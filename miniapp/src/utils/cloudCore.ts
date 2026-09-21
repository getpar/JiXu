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
 * - 编辑 = 旧记录打删除凭证 + 新增一笔，天然继承上述同步能力
 * - 多用户隔离：每条云端文档带 ownerId（同步码），同码才是同一户（方案 B）
 */

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
  updatedAt: number     // 毫秒时间戳，增量同步依据
  source?: string       // 'desktop' | 'miniapp'（旧数据可能没有此字段）
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
}

/** records 集合里的任意文档：账单记录 or 删除凭证 */
export type CloudDoc = CloudRecord | CloudTombstone

export function isTombstone(d: CloudDoc): d is CloudTombstone {
  return (d as CloudTombstone).kind === 'tombstone'
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
  deleted?: number      // v0.6.6 软删除：0/undefined = 正常，1 = 已删除（仅本地状态，同步靠删除凭证文档）
}

/** 最小键值存储接口：小程序端 = Taro Storage，验证脚本 = 内存对象 */
export interface KVStore {
  get(key: string): string | null
  set(key: string, value: string): void
}

/** 待上传的新文档：账单或删除凭证（不含 _id） */
export type NewCloudDoc = Omit<CloudRecord, '_id'> | Omit<CloudTombstone, '_id'>

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
    date: r.date,
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
    date: r.date,
    updatedAt: now,
    source,
    ownerId,
  }
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
  /** 本端标识：'miniapp' / 'desktop' */
  source: string
  /** 本户同步码（只同步同码记录，多用户隔离的关键） */
  ownerId: string
  /** 读取本地全部记录（含已标记删除的行 — 按笔数配对需要完整底数） */
  getLocal: () => Promise<SyncableRecord[]>
  /** 把云端记录写入本地，返回实际新增条数（id 去重即可，笔数配对由引擎算好） */
  addLocal: (records: SyncableRecord[]) => Promise<number>
  /** 按去重键把 count 笔本地存活记录标记为软删除（持久化），返回实际标记数 */
  markLocal: (key: string, count: number) => Promise<number>
  /** 存放 lastSyncAt 的键值存储 */
  store: KVStore
  /** 可注入的时钟（便于测试） */
  now?: () => number
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
 * 执行一次完整双向同步（v0.6.6：笔数配对 + 软删除凭证），不变式：
 *   每键本地总行数(存活+已删) ↔ 云端账单文档数；本地已删数 ↔ 云端凭证数。
 * 1. 本地总行数 > 云端账单数 → 补传差额账单（含"记了从未同步又删掉"的，新设备才能完整还原）
 * 2. 本地已删数 > 云端凭证数 → 补传删除凭证
 * 3. 云端账单数 > 本地总行数 → 补拉差额（限上次同步后写入的）
 * 4. 云端凭证数 > 本地已删数 → 把对应键的存活记录标删（不设窗口，差额驱动必收敛）
 */
export async function runSync(deps: SyncDeps): Promise<SyncResult> {
  const now = deps.now ? deps.now() : Date.now()
  if (!isValidOwnerId(deps.ownerId || '')) {
    return { ok: false, pushed: 0, pulled: 0, error: '同步码未设置或不合法' }
  }
  try {
    const docs = await deps.cloud.listAll(deps.ownerId)
    const mine = docs.filter((d) => d.ownerId === deps.ownerId) // 再验一次码，防驱动层漏筛
    const cloudRecs = mine.filter((d): d is CloudRecord => !isTombstone(d))
    const cloudTombs = mine.filter((d): d is CloudTombstone => isTombstone(d))

    const cloudRecCounts = countByRecordKey(cloudRecs)
    const cloudTombCounts = new Map<string, number>()
    for (const t of cloudTombs) cloudTombCounts.set(t.targetKey, (cloudTombCounts.get(t.targetKey) || 0) + 1)

    const localAll = await deps.getLocal()
    const localTotals = countByRecordKey(localAll)                       // 存活 + 已删
    const deadList = localAll.filter((r) => (r.deleted || 0) > 0)
    const localDeadCounts = countByRecordKey(deadList)

    let pushed = 0
    // 1. 补传账单：本键总行数超出云端账单数的部分
    const pushPerKey = new Map<string, number>()
    for (const r of localAll) {
      const k = recordKey(r)
      const need = (localTotals.get(k) || 0) - (cloudRecCounts.get(k) || 0)
      const done = pushPerKey.get(k) || 0
      if (need > 0 && done < need) {
        const id = await deps.cloud.add(localToCloud(r, deps.source, now, deps.ownerId))
        if (id) { pushed++; pushPerKey.set(k, done + 1) }
      }
    }
    // 2. 补传删除凭证：本键已删数超出云端凭证数的部分（凭证内容只含指纹，不含金额明细）
    const pushTombPerKey = new Map<string, number>()
    for (const r of deadList) {
      const k = recordKey(r)
      const need = (localDeadCounts.get(k) || 0) - (cloudTombCounts.get(k) || 0)
      const done = pushTombPerKey.get(k) || 0
      if (need > 0 && done < need) {
        const id = await deps.cloud.add({ kind: 'tombstone', targetKey: k, ownerId: deps.ownerId, updatedAt: now, source: deps.source })
        if (id) { pushed++; pushTombPerKey.set(k, done + 1) }
      }
    }

    // 3. 补拉账单：云端账单数超出本地总行数，限上次同步后写入的（刚自己传上去的因计数平衡不会倒灌）
    const lastSync = Number(deps.store.get(lastSyncKey(deps.ownerId)) || 0)
    const takenPerKey = new Map<string, number>()
    const incoming: CloudRecord[] = []
    for (const r of cloudRecs) {
      if ((r.updatedAt || 0) <= lastSync) continue
      const k = recordKey(r)
      const cap = (cloudRecCounts.get(k) || 0) - (localTotals.get(k) || 0)
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

    const pendingMarks: { k: string; need: number }[] = []

    // 4. 凭证补标删：云端凭证数超出本地已删数，把该键存活记录标掉（不设窗口，差额驱动收敛）
    cloudTombCounts.forEach((tombCount, k) => {
      const need = tombCount - (localDeadCounts.get(k) || 0)
      if (need > 0) {
        // forEach 回调不能 await，包成同步段后统一处理：收集差额再串行标记
        pendingMarks.push({ k, need })
      }
    })
    for (const m of pendingMarks) {
      pulled += await deps.markLocal(m.k, m.need)
    }

    // 5. 更新同步时间
    deps.store.set(lastSyncKey(deps.ownerId), String(now))

    return { ok: true, pushed, pulled }
  } catch (e: any) {
    return { ok: false, pushed: 0, pulled: 0, error: e?.message || String(e) }
  }
}
