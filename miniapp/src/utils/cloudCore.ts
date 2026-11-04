/**
 * 云同步核心逻辑（纯 TypeScript，零 Taro / 零 wx 依赖）
 *
 * 设计说明：
 * - 本文件只包含"同步算法"，不碰任何小程序 API，因此可以直接在 Node 环境
 *   运行验证脚本（scripts/verify-sync.js），提前跑通桌面 ↔ 小程序的同步逻辑。
 * - 真实的 CloudBase 连接 与 本地模拟云 都实现 CloudCollection 接口，
 *   同步引擎不关心背后是哪种，换成真云时零改动。
 *
 * 同步语义（与桌面端 services/cloudbase.ts 完全对齐）：
 * - 去重键 = date|amount|subcategoryKey|type，同键多笔按"笔数"配对（v0.6.5）
 * - 软删除（v0.6.6）：删除 = 本地标记 deleted=1（数据留底可恢复），同步时向云端
 *   新增一条"删除凭证"文档；另一端拉到凭证后把自己那份也标删——只用到"新增"操作，
 *   无需修改/删除云端文档，因此集合权限保持最严、也不需要云函数
 * - 恢复（v0.6.7）：回收站恢复 = 本地行复活（deleted 归 0、reviveCount+1），同步时
 *   向云端新增"撤销凭条"(revive) 文档抵消一条删除凭证；另一端按净额 T-R 跟随标删或复活。
 *   配对不变式：每键 云端删除凭证数 T = 本地已删数 D + 本地累计恢复数 V；云端撤销数 R = V
 * - 凭证/凭条附 label 人话摘要（v0.6.7）：只供人在控制台阅读，引擎不使用
 * - 编辑 = 旧记录打删除凭证 + 新增一笔，天然继承上述同步能力
 * - 彻底删除（v0.8.5）：回收站行物理删除时新增"注销凭条"(purge) 抵消该行的
 *   1 张账单 + (1+V) 张凭证 + V 张凭条，对端消费凭条后也物理删自己那份本地行
 *   （v0.8.6：优先删回收站行，不够再删同号存活行，离线端回流诈尸也堵死）；
 *   所有配对公式统一用"注销后的有效计数"，保证不回流、不诈尸
 * - 多用户隔离：每条云端文档带 ownerId（同步码），同码才是同一户（方案 B）
 */

// v0.9.5 只依赖 money.ts（同样是纯 TS、零 Taro 依赖），用于凭证摘要里的金额格式化
import { formatMoneyExact } from './money'

// ---- 数据结构 ----

/** 云数据库 records 集合中的一条记录（字段格式与桌面端上传的保持一致） */
export interface CloudRecord {
  _id?: string
  type: string
  amount: number
  categoryKey: string
  categoryName: string
  subcategoryKey: string
  subcategoryName: string
  note: string
  date: string          // YYYY-MM-DD
  person?: string       // v0.8.0 记录人（谁花的，可选）
  createdAt?: number    // v0.8.7 提交时刻（毫秒时间戳）：跨端保持"同一天内记的早的排后面"
  updatedAt: number     // 毫秒时间戳，增量同步依据
  source?: string       // 上传设备：'desktop' / 'miniapp'（v0.9.6 前的共用名）或 'miniapp:XXXXXXXX'（每台设备唯一）；旧数据可能没有
  ownerId?: string      // 同步码（户标识），只同步同码记录；旧数据无此字段 = 孤立数据不再拉取
}

/** 删除凭证（v0.6.6 软删除）：不修改/不删除云端原记录，只新增一条凭证，各端看到后把自己那份标删 */
export interface CloudTombstone {
  _id?: string
  kind: 'tombstone'
  targetKey: string     // 被删记录的去重键 date|amount|subcategoryKey|type
  ownerId: string
  updatedAt: number
  source?: string
  label?: string        // v0.6.7 被删内容的人话摘要，仅供控制台阅读，引擎不用
}

/** 撤销凭条（v0.6.7 恢复）：抵消一条删除凭证，让恢复动作也跨端生效；同样只需"新增"权限 */
export interface CloudRevive {
  _id?: string
  kind: 'revive'
  targetKey: string
  ownerId: string
  updatedAt: number
  source?: string
  label?: string
}

/**
 * 注销凭条（v0.8.5 彻底删除）：回收站行被本地物理删除后，追加此凭条把该笔在云端的
 * 存在痕迹整体核销 — cancelRec 注销一条账单文档、cancelTomb 注销一条删除凭证、
 * cancelRev 注销一条撤销凭条（= 该行完整生命周期 1 张账单 + (1+V) 张凭证 + V 张凭条）。
 * 对端拉到后把自己那份"回收站行"也物理删除。pid 全局唯一，防离线重试时重复上云。
 */
export interface CloudPurge {
  _id?: string
  kind: 'purge'
  pid: string           // 全局唯一凭条号（上传重试幂等去重）
  targetKey: string
  cancelRec: number
  cancelTomb: number
  cancelRev: number
  ownerId: string
  updatedAt: number
  source?: string
  label?: string
}

/** 本地待上传的注销凭条队列项（彻底删除时入队，离线也不丢，上传成功后按 pid 清除） */
export interface PendingPurge {
  pid: string
  targetKey: string
  cancelRec: number
  cancelTomb: number
  cancelRev: number
  label?: string
}

/**
 * 实体快照文档（v0.7.3 待办/周期账单同步）：这类是会被反复修改的小对象，
 * 用"快照追加 + updatedAt 最新者胜"（LWW）模型：每次改动追加一条完整新快照，
 * 各端按 entityId 取 updatedAt 最大的一份为当前状态。仍然只用"新增"权限，集合权限保持最严。
 * 删除 = deleted:true 的快照（软删，防旧快照倒灌复活）。
 */
export interface CloudEntityDoc {
  _id?: string
  kind: 'todo' | 'recurring'
  entityId: string        // 本地业务 id（稳定不变）
  ownerId: string
  updatedAt: number       // 本次快照的修改时刻
  source?: string
  data: Record<string, any> // 完整快照（含 deleted 标记），字段由各端自定义
}

/** records 集合里的任意文档：账单记录 / 删除凭证 / 撤销凭条 / 注销凭条 / 实体快照 */
export type CloudDoc = CloudRecord | CloudTombstone | CloudRevive | CloudPurge | CloudEntityDoc

export function isTombstone(d: CloudDoc): d is CloudTombstone {
  return (d as CloudTombstone).kind === 'tombstone'
}

export function isRevive(d: CloudDoc): d is CloudRevive {
  return (d as CloudRevive).kind === 'revive'
}

export function isPurge(d: CloudDoc): d is CloudPurge {
  return (d as CloudPurge).kind === 'purge'
}

export function isEntityDoc(d: CloudDoc): d is CloudEntityDoc {
  return (d as CloudEntityDoc).kind === 'todo' || (d as CloudEntityDoc).kind === 'recurring'
}

/** 可同步的本地记录（与小程序 RecordItem / 桌面端 records 表字段兼容） */
export interface SyncableRecord {
  id?: string
  type: string
  amount: number
  categoryKey: string
  categoryName: string
  subcategoryKey: string
  subcategoryName: string
  note: string
  date: string
  person?: string       // v0.8.0 记录人（谁花的，可选）
  createdAt?: number    // v0.8.7 提交时刻毫秒时间戳（随云同步跨端，列表排序依据）
  deleted?: number      // v0.6.6 软删除：0/undefined = 正常，1 = 已删除（仅本地状态，同步靠删除凭证文档）
  reviveCount?: number  // v0.6.7 本笔被恢复过的次数（仅本地；期望云端凭证数 = 已删数 + 恢复数）
}

/** 最小键值存储接口：小程序端 = Taro Storage，验证脚本 = 内存对象 */
export interface KVStore {
  get(key: string): string | null
  set(key: string, value: string): void
}

/** 待上传的新文档：账单 / 删除凭证 / 撤销凭条 / 注销凭条 / 实体快照（不含 _id） */
export type NewCloudDoc =
  | Omit<CloudRecord, '_id'>
  | Omit<CloudTombstone, '_id'>
  | Omit<CloudRevive, '_id'>
  | Omit<CloudPurge, '_id'>
  | Omit<CloudEntityDoc, '_id'>

/** 云数据库集合的最小操作面：模拟云 和 wx.cloud 真云 都实现它 */
export interface CloudCollection {
  /** 分页拉取云端属于指定同步码的全部文档（账单记录 + 删除凭证混在一起） */
  listAll(ownerId: string): Promise<CloudDoc[]>
  /** 上传一条文档（账单或凭证），返回云端 _id（失败返回 null） */
  add(doc: NewCloudDoc): Promise<string | null>
}

// ---- 公共约定 ----

/** 本地记录"上次同步时间"的存储键（按同步码分隔，换户不影响旧户增量） */
export function lastSyncKey(ownerId: string): string {
  return `cloud_last_sync_at_${ownerId}`
}

/** 生成随机同步码：12 位大写字母数字（去掉了易混淆的 I/O/U），碰撞概率约 3.8×10¹⁸ 分之一 */
export function newOwnerId(): string {
  const CHARS = 'ABCDEFGHJKLMNPQRSTVWXYZ023456789'
  let out = ''
  for (let i = 0; i < 12; i++) out += CHARS[Math.floor(Math.random() * CHARS.length)]
  return out
}

/** 同步码归一化：去掉空格/连字符、转大写（用户手输容错） */
export function normalizeOwnerId(raw: string): string {
  return (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** 同步码显示格式：每 4 位一杠，方便手机照着键盘输 */
export function formatOwnerId(id: string): string {
  return (id || '').replace(/(.{4})(?=.)/g, '$1-')
}

/** 同步码合法性：至少 8 位（未来若改长度只动这一处） */
export function isValidOwnerId(id: string): boolean {
  return /^[A-Z0-9]{8,}$/.test(id)
}

/** 跨端去重键 —— 必须与桌面端 cloudbase.ts 中 performSync 的键保持一致 */
export function recordKey(r: { date: string; amount: number; subcategoryKey: string; type: string }): string {
  return `${r.date}|${r.amount}|${r.subcategoryKey}|${r.type}`
}

/** 解析去重键（删除凭证落到本地时用它定位该标哪笔） */
export function parseRecordKey(key: string): { date: string; amount: number; subcategoryKey: string; type: string } | null {
  const parts = (key || '').split('|')
  if (parts.length !== 4) return null
  const amount = Number(parts[1])
  if (isNaN(amount)) return null
  return { date: parts[0], amount, subcategoryKey: parts[2], type: parts[3] }
}

/** 云端记录 → 本地记录格式 */
export function cloudToLocal(r: CloudRecord): SyncableRecord {
  return {
    id: `cloud_${r._id || recordKey(r)}`,
    type: r.type,
    amount: r.amount,
    categoryKey: r.categoryKey,
    categoryName: r.categoryName || '',
    subcategoryKey: r.subcategoryKey,
    subcategoryName: r.subcategoryName || '',
    note: r.note || '',
    person: r.person || '',
    date: r.date,
    createdAt: r.createdAt || r.updatedAt, // v0.8.7 老云端数据无提交时刻时退用上云时间
  }
}

/** 本地记录 → 云端上传格式 */
export function localToCloud(r: SyncableRecord, source: string, now: number, ownerId: string): Omit<CloudRecord, '_id'> {
  return {
    type: r.type,
    amount: r.amount,
    categoryKey: r.categoryKey,
    categoryName: r.categoryName,
    subcategoryKey: r.subcategoryKey,
    subcategoryName: r.subcategoryName,
    note: r.note || '',
    person: r.person || '',
    date: r.date,
    createdAt: r.createdAt || now, // v0.8.7 提交时刻随云上云（老本地数据退用上传时刻）
    updatedAt: now,
    source,
    ownerId,
  }
}

/** 凭证/凭条的人话摘要：云控制台里能看懂这条删/恢复的是哪笔账（引擎不读此字段） */
export function docLabel(r: SyncableRecord): string {
  const cat = r.categoryName || r.categoryKey || ''
  const sub = r.subcategoryName || r.subcategoryKey || ''
  // v0.9.5 金额走统一格式化：避免脏数据在云控制台里显示成 1.1122222222222222e+125
  return `${r.date} ${cat}/${sub} ¥${formatMoneyExact(r.amount)}${r.note ? ' 备注:' + r.note : ''}`
}

// ---- 本地模拟云（开发验证用） ----

/**
 * 创建一个存在 KVStore 里的"模拟云数据库"。
 * 行为对齐 CloudBase：自动生成 _id、按 updatedAt 排序、无鉴权。
 * 桌面端 → 小程序 的跨端验证脚本共用同一个 KVStore 即等价于共用一个云环境。
 */
export function createMockCloud(store: KVStore, collectionKey: string = 'mock_cloud_records'): CloudCollection {
  function read(): CloudDoc[] {
    const raw = store.get(collectionKey)
    return raw ? (JSON.parse(raw) as CloudDoc[]) : []
  }
  function write(list: CloudDoc[]): void {
    store.set(collectionKey, JSON.stringify(list))
  }
  return {
    async listAll(ownerId) {
      return read()
        .filter((r) => r.ownerId === ownerId)
        .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))
    },
    async add(record) {
      const list = read()
      const _id = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      list.push({ ...record, _id } as CloudDoc)
      write(list)
      return _id
    },
  }
}

// ---- 同步引擎 ----

export interface SyncDeps {
  /** 云端集合（模拟云或真云） */
  cloud: CloudCollection
  /** 本端标识：v0.9.6 起每台设备唯一（如 'miniapp:7KQ2M9XA'）。引擎跳过 source 与自己相同的注销凭条，
   *  同户两台同平台设备若共用一个名字，A 彻底删除的账 B 永远不跟删、还会把它补传回云端 */
  source: string
  /** v0.9.6 本端升级前用过的共用 source（如 'miniapp'）：这类历史注销凭条仍按「自己传的」跳过，保持升级前行为——
   *  否则升级后可能把离线新记、恰好与旧凭条同号的账当成诈尸行物理删掉 */
  legacySources?: string[]
  /** 本户同步码（只同步同码记录，多用户隔离的关键） */
  ownerId: string
  /** 读取本地全部记录（含已标记删除的行 — 按笔数配对需要完整底数） */
  getLocal: () => Promise<SyncableRecord[]>
  /** 把云端记录写入本地，返回实际新增条数（id 去重即可，笔数配对由引擎算好） */
  addLocal: (records: SyncableRecord[]) => Promise<number>
  /** 按去重键把 count 笔本地存活记录标记为软删除（持久化），返回实际标记数 */
  markLocal: (key: string, count: number) => Promise<number>
  /** v0.6.7：按去重键把 count 笔本地已删记录恢复存活（reviveCount+1），返回实际恢复数 */
  markAlive: (key: string, count: number) => Promise<number>
  /** v0.8.5 彻底删除消费：按去重键物理删除 count 笔本地回收站行，返回实际删除数 */
  purgeLocal?: (key: string, count: number) => Promise<number>
  /** v0.8.5 注销凭条队列：本端彻底删除产生的待上传凭条（离线删除也不丢），上传成功后按 pid 清除 */
  purges?: { getPending: () => PendingPurge[]; clearPending: (pids: string[]) => void }
  /** 存放 lastSyncAt 的键值存储 */
  store: KVStore
  /** v0.7.3 待办实体同步（可选）：getLocal 返回含已软删项的全部待办，apply 按 id 覆盖/新增本地 */
  todos?: EntitySyncSpec
  /** v0.7.3 周期账单实体同步（可选） */
  recurring?: EntitySyncSpec
  /** 可注入的时钟（便于测试） */
  now?: () => number
}

/** v0.7.3 实体同步的两端适配接口（小程序/桌面各自实现） */
export interface EntitySyncSpec {
  /** 读本地全部实体（含 deleted 软删项），每项必须有稳定 id 和 updatedAt */
  getLocal: () => Promise<Array<Record<string, any> & { id: string; updatedAt?: number }>>
  /** 应用云端快照（含 deleted 标记）：按 id 新增/覆盖，返回实际变更数 */
  apply: (items: Array<Record<string, any>>) => Promise<number>
}

export interface SyncResult {
  ok: boolean
  pushed: number      // 本端上传到云端的文档数（含账单与删除凭证）
  pulled: number      // 本端从云端学到的变化数（新增入账 + 标记删除）
  error?: string
}

/** 统计一批记录里每个去重键出现几次（按笔数配对的核心） */
type KeyPart = { date: string; amount: number; subcategoryKey: string; type: string }
export function countByRecordKey<T extends KeyPart>(list: T[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of list) m.set(recordKey(r), (m.get(recordKey(r)) || 0) + 1)
  return m
}

/**
 * v0.7.3 单类实体（待办或周期账单）的 LWW 同步：
 * 云端按 entityId 取最新快照 → 本地比云端新则补传、云端比本地新则覆盖本地（含 deleted 标记）。
 * 同一时刻平手时以本地为准（下轮再处理，结果仍收敛）。
 */
async function syncEntities(
  kind: 'todo' | 'recurring',
  spec: EntitySyncSpec,
  cloud: CloudCollection,
  ownerId: string,
  cloudDocs: CloudEntityDoc[],
  now: number,
): Promise<{ pushed: number; pulled: number }> {
  const latest = new Map<string, CloudEntityDoc>()
  for (const d of cloudDocs) {
    const cur = latest.get(d.entityId)
    if (!cur || (d.updatedAt || 0) > (cur.updatedAt || 0)) latest.set(d.entityId, d)
  }
  const local = await spec.getLocal()
  const localById = new Map<string, Record<string, any> & { id: string; updatedAt?: number }>()
  let pushed = 0
  for (const item of local) {
    localById.set(item.id, item)
    const c = latest.get(item.id)
    const itemTs = item.updatedAt || 0
    if (!c || itemTs > (c.updatedAt || 0)) {
      const id = await cloud.add({ kind, entityId: item.id, ownerId, updatedAt: itemTs || now, data: item })
      if (id) pushed++
    }
  }
  const incoming: Array<Record<string, any>> = []
  latest.forEach((c, id) => {
    const l = localById.get(id)
    if (!l || (c.updatedAt || 0) > (l.updatedAt || 0)) {
      if (c.data) incoming.push({ ...c.data, id, updatedAt: c.updatedAt }) // id 以 entityId 为准，防脏快照
    }
  })
  const pulled = incoming.length > 0 ? await spec.apply(incoming) : 0
  return { pushed, pulled }
}

/**
 * 执行一次完整双向同步（v0.6.7：笔数配对 + 删除凭证 + 撤销凭条），不变式：
 *   每键本地总行数(存活+已删) ↔ 云端账单数；本地(已删数+累计恢复数) ↔ 云端凭证数；本地累计恢复数 ↔ 云端撤销数。
 * 1. 本地总行数 > 云端账单数 → 补传差额账单
 * 2. 本地凭证应配数(D+V) > 云端凭证数 → 补传删除凭证；本地恢复数 V > 云端撤销数 → 补传撤销凭条
 * 3. 云端账单数 > 本地总行数 → 补拉差额（限上次同步后写入的）
 * 4. 云端净删除数 max(T-R,0) > 本地已删数 → 标删差额；反之 → 复活差额（凭证/撤销均不设窗口，差额驱动必收敛）
 */
export async function runSync(deps: SyncDeps): Promise<SyncResult> {
  const now = deps.now ? deps.now() : Date.now()
  if (!isValidOwnerId(deps.ownerId || '')) {
    return { ok: false, pushed: 0, pulled: 0, error: '同步码未设置或不合法' }
  }
  try {
    const docs = await deps.cloud.listAll(deps.ownerId)
    const mine = docs.filter((d) => d.ownerId === deps.ownerId) // 再验一次码，防驱动层漏筛
    const cloudRecs = mine.filter((d): d is CloudRecord => !isTombstone(d) && !isRevive(d) && !isPurge(d) && !isEntityDoc(d))
    const cloudTombs = mine.filter((d): d is CloudTombstone => isTombstone(d))
    const cloudRevs = mine.filter((d): d is CloudRevive => isRevive(d))
    const cloudPurges = mine.filter((d): d is CloudPurge => isPurge(d))
    const cloudTodoDocs = mine.filter((d): d is CloudEntityDoc => (d as CloudEntityDoc).kind === 'todo')
    const cloudRecurDocs = mine.filter((d): d is CloudEntityDoc => (d as CloudEntityDoc).kind === 'recurring')

    // 0. v0.8.5 登记对端注销凭条额度（自己上传的不消费）；v0.8.6 实际删除挪到 eff 算好后按差额执行
    const purgeCredit = new Map<string, number>()
    const ownSources = new Set([deps.source, ...(deps.legacySources || [])])
    for (const p of cloudPurges) {
      if (!deps.purgeLocal || ownSources.has(p.source || '')) continue
      const n = Math.max(0, p.cancelRec || 0)
      if (n > 0 && parseRecordKey(p.targetKey)) purgeCredit.set(p.targetKey, (purgeCredit.get(p.targetKey) || 0) + n)
    }

    // 注销核销聚合（v0.8.5b 时间戳感知：凭条只能核销在它之前上传的记录，不能误杀之后新加的同号账）
    const cancelRec = new Map<string, number>()
    const cancelTomb = new Map<string, number>()
    const cancelRev = new Map<string, number>()
    for (const p of cloudPurges) {
      const k = p.targetKey
      const pTime = p.updatedAt || 0
      const wantRec = Math.max(0, p.cancelRec || 0)
      const wantTomb = Math.max(0, p.cancelTomb || 0)
      const wantRev = Math.max(0, p.cancelRev || 0)
      const alreadyRec = cancelRec.get(k) || 0
      const alreadyTomb = cancelTomb.get(k) || 0
      const alreadyRev = cancelRev.get(k) || 0
      if (wantRec > 0) {
        const recBefore = cloudRecs.filter(r => recordKey(r) === k && (r.updatedAt || 0) < pTime).length
        cancelRec.set(k, alreadyRec + Math.min(wantRec, Math.max(0, recBefore - alreadyRec)))
      }
      if (wantTomb > 0) {
        const tombBefore = cloudTombs.filter(t => t.targetKey === k && (t.updatedAt || 0) < pTime).length
        cancelTomb.set(k, alreadyTomb + Math.min(wantTomb, Math.max(0, tombBefore - alreadyTomb)))
      }
      if (wantRev > 0) {
        const revBefore = cloudRevs.filter(v => v.targetKey === k && (v.updatedAt || 0) < pTime).length
        cancelRev.set(k, alreadyRev + Math.min(wantRev, Math.max(0, revBefore - alreadyRev)))
      }
    }

    const cloudRecCounts = countByRecordKey(cloudRecs)
    const cloudTombCounts = new Map<string, number>()
    for (const t of cloudTombs) cloudTombCounts.set(t.targetKey, (cloudTombCounts.get(t.targetKey) || 0) + 1)
    const cloudReviveCounts = new Map<string, number>()
    for (const v of cloudRevs) cloudReviveCounts.set(v.targetKey, (cloudReviveCounts.get(v.targetKey) || 0) + 1)
    // 有效计数（注销后）：所有配对公式统一走这三个函数
    const effRec = (k: string) => Math.max(0, (cloudRecCounts.get(k) || 0) - (cancelRec.get(k) || 0))
    const effTomb = (k: string) => Math.max(0, (cloudTombCounts.get(k) || 0) - (cancelTomb.get(k) || 0))
    const effRev = (k: string) => Math.max(0, (cloudReviveCounts.get(k) || 0) - (cancelRev.get(k) || 0))

    const localAll = await deps.getLocal()
    // 0b. v0.8.6 注销凭条消费（差额版）：本地该键总行数超出云端有效账单数的部分才物理删，
    //     优先删回收站行、不够再删同号存活行（堵离线端错过删除后诈尸回传）；
    //     删除额度封顶对端凭条 cancelRec，防误杀注销后新加的同号账
    if (deps.purgeLocal) {
      for (const [k, credit] of purgeCredit) {
        const total = localAll.filter((r) => recordKey(r) === k).length
        const excess = Math.min(credit, Math.max(0, total - effRec(k)))
        if (excess <= 0) continue
        let left = excess
        for (const pass of [1, 0]) { // 第 1 轮删回收站行，第 2 轮删存活行
          for (let i = localAll.length - 1; i >= 0 && left > 0; i--) {
            if (((localAll[i].deleted || 0) > 0 ? 1 : 0) === pass && recordKey(localAll[i]) === k) {
              localAll.splice(i, 1)
              left--
            }
          }
        }
        await deps.purgeLocal(k, excess - left)
      }
    }
    const localTotals = countByRecordKey(localAll)                       // 存活 + 已删
    const deadList = localAll.filter((r) => (r.deleted || 0) > 0)
    const localDeadCounts = countByRecordKey(deadList)
    // 凭证配额：一行死过 = 一张凭证；每被恢复过一次 = 历史再多一张凭证（所以配额 = D + V）
    const tombDonors: SyncableRecord[] = []
    const reviveDonors: SyncableRecord[] = []
    for (const r of localAll) {
      if ((r.deleted || 0) > 0) tombDonors.push(r)
      for (let i = 0; i < (r.reviveCount || 0); i++) { tombDonors.push(r); reviveDonors.push(r) }
    }
    const tombQuota = countByRecordKey(tombDonors)
    const localReviveCounts = countByRecordKey(reviveDonors)

    let pushed = 0
    // 2c. v0.8.5 上传本端注销凭条（彻底删除队列，含离线积压）：pid 不在云端的才传，防重复核销
    if (deps.purges) {
      const cloudPids = new Set(cloudPurges.map((p) => p.pid || ''))
      const uploaded: PendingPurge[] = []
      for (const p of deps.purges.getPending()) {
        if (!p.pid || cloudPids.has(p.pid)) continue
        const id = await deps.cloud.add({ kind: 'purge', pid: p.pid, targetKey: p.targetKey, cancelRec: p.cancelRec, cancelTomb: p.cancelTomb, cancelRev: p.cancelRev, ownerId: deps.ownerId, updatedAt: now, source: deps.source, label: p.label })
        if (id) { pushed++; uploaded.push(p) }
      }
      if (uploaded.length > 0) {
        deps.purges.clearPending(uploaded.map((p) => p.pid))
        // 刚上传的核销立即计入 eff（本轮配对即以注销后为准，防止刚删的行被旧计数倒灌）
        for (const p of uploaded) {
          cancelRec.set(p.targetKey, (cancelRec.get(p.targetKey) || 0) + Math.max(0, p.cancelRec))
          cancelTomb.set(p.targetKey, (cancelTomb.get(p.targetKey) || 0) + Math.max(0, p.cancelTomb))
          cancelRev.set(p.targetKey, (cancelRev.get(p.targetKey) || 0) + Math.max(0, p.cancelRev))
        }
      }
    }
    // 1. 补传账单：本键总行数超出云端有效账单数的部分
    const pushPerKey = new Map<string, number>()
    for (const r of localAll) {
      const k = recordKey(r)
      const need = (localTotals.get(k) || 0) - effRec(k)
      const done = pushPerKey.get(k) || 0
      if (need > 0 && done < need) {
        const id = await deps.cloud.add(localToCloud(r, deps.source, now, deps.ownerId))
        if (id) { pushed++; pushPerKey.set(k, done + 1) }
      }
    }
    // 2a. 补传删除凭证：配额(D+V)超出云端凭证数的部分；label 只供人阅读
    const pushTombPerKey = new Map<string, number>()
    for (const r of tombDonors) {
      const k = recordKey(r)
      const need = (tombQuota.get(k) || 0) - effTomb(k)
      const done = pushTombPerKey.get(k) || 0
      if (need > 0 && done < need) {
        const id = await deps.cloud.add({ kind: 'tombstone', targetKey: k, ownerId: deps.ownerId, updatedAt: now, source: deps.source, label: docLabel(r) })
        if (id) { pushed++; pushTombPerKey.set(k, done + 1) }
      }
    }
    // 2b. 补传撤销凭条：本地恢复数 V 超出云端撤销数的部分（恢复也跨端生效）
    const pushRevPerKey = new Map<string, number>()
    for (const r of reviveDonors) {
      const k = recordKey(r)
      const need = (localReviveCounts.get(k) || 0) - effRev(k)
      const done = pushRevPerKey.get(k) || 0
      if (need > 0 && done < need) {
        const id = await deps.cloud.add({ kind: 'revive', targetKey: k, ownerId: deps.ownerId, updatedAt: now, source: deps.source, label: docLabel(r) })
        if (id) { pushed++; pushRevPerKey.set(k, done + 1) }
      }
    }

    // 3. 补拉账单：云端账单数超出本地总行数的差额（v0.8.3 去掉时间窗：窗口会把"另一端在你上次同步
    //    之前传入"的数据永久漏拉；笔数差额本身幂等——刚自己传的因差额为 0 不倒灌，addLocal 按 _id 防重）
    const takenPerKey = new Map<string, number>()
    const incoming: CloudRecord[] = []
    for (const r of cloudRecs) {
      const k = recordKey(r)
      const cap = effRec(k) - (localTotals.get(k) || 0)
      const taken = takenPerKey.get(k) || 0
      if (cap > 0 && taken < cap) {
        takenPerKey.set(k, taken + 1)
        incoming.push(r)
      }
    }
    let pulled = 0
    if (incoming.length > 0) {
      pulled += await deps.addLocal(incoming.map(cloudToLocal))
    }

    // 4. 按净额跟随标删/复活：净删除数 = max(凭证数 - 撤销数, 0)，和本地已删数比差额（不设窗口，必收敛）。
    //    本轮刚补传的凭证/撤销也要计入净额，否则刚恢复的行会被旧凭证快照当场再标删（回灌）
    const netDel = new Map<string, number>()
    cloudTombCounts.forEach((n, k) => netDel.set(k, Math.max(0, n - (cancelTomb.get(k) || 0))))
    pushTombPerKey.forEach((n, k) => netDel.set(k, (netDel.get(k) || 0) + n))
    cloudReviveCounts.forEach((n, k) => netDel.set(k, Math.max(0, (netDel.get(k) || 0) - Math.max(0, n - (cancelRev.get(k) || 0)))))
    pushRevPerKey.forEach((n, k) => netDel.set(k, Math.max(0, (netDel.get(k) || 0) - n)))
    const pendingMarks: { k: string; need: number }[] = []
    const pendingAlives: { k: string; need: number }[] = []
    netDel.forEach((cnt, k) => {
      const d = localDeadCounts.get(k) || 0
      if (cnt > d) pendingMarks.push({ k, need: cnt - d })
      else if (cnt < d) pendingAlives.push({ k, need: d - cnt })
    })
    for (const m of pendingMarks) {
      pulled += await deps.markLocal(m.k, m.need)
    }
    for (const a of pendingAlives) {
      pulled += await deps.markAlive(a.k, a.need)
    }

    // 4b. v0.7.3 待办/周期账单实体同步（LWW 快照，与账单链路互不干扰）
    if (deps.todos) {
      const r = await syncEntities('todo', deps.todos, deps.cloud, deps.ownerId, cloudTodoDocs, now)
      pushed += r.pushed; pulled += r.pulled
    }
    if (deps.recurring) {
      const r = await syncEntities('recurring', deps.recurring, deps.cloud, deps.ownerId, cloudRecurDocs, now)
      pushed += r.pushed; pulled += r.pulled
    }

    // 5. 更新同步时间
    deps.store.set(lastSyncKey(deps.ownerId), String(now))

    return { ok: true, pushed, pulled }
  } catch (e: any) {
    return { ok: false, pushed: 0, pulled: 0, error: e?.message || String(e) }
  }
}
