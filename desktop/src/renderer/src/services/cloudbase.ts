/**
 * CloudBase 云同步服务（渲染进程）
 *
 * 使用 @cloudbase/js-sdk 连接腾讯云 CloudBase，
 * 匿名登录 + 数据库 CRUD，配合主进程 SQLite 实现双向同步。
 */

import cloudbase from '@cloudbase/js-sdk'

const COLLECTION = 'records'
const SYNC_META_KEY = 'cloud_sync_meta'
const OWNER_KEY = 'cloud_owner_id'
let app: any = null
let db: any = null
let auth: any = null
let envId = ''
let ownerId = ''

// ---- 同步码（户标识，多用户隔离）----
// 与小程序端 cloudCore.ts 的同名工具保持同步（字符集/长度/校验规则必须一致）

/** 生成随机同步码：12 位大写字母数字（去掉易混淆的 I/O/U） */
export function newOwnerId(): string {
  const CHARS = 'ABCDEFGHJKLMNPQRSTVWXYZ023456789'
  let out = ''
  for (let i = 0; i < 12; i++) out += CHARS[Math.floor(Math.random() * CHARS.length)]
  return out
}

/** 同步码归一化：去空格/连字符、转大写 */
export function normalizeOwnerId(raw: string): string {
  return (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** 同步码显示格式：每 4 位一杠 */
export function formatOwnerId(id: string): string {
  return (id || '').replace(/(.{4})(?=.)/g, '$1-')
}

function isValidOwnerId(id: string): boolean {
  return /^[A-Z0-9]{8,}$/.test(id)
}

/** 获取本户同步码（没有则自动生成并持久化） */
export function getOwnerId(): string {
  if (!ownerId) {
    ownerId = localStorage.getItem(OWNER_KEY) || ''
    if (!isValidOwnerId(ownerId)) {
      ownerId = newOwnerId()
      localStorage.setItem(OWNER_KEY, ownerId)
    }
  }
  return ownerId
}

/** 设置/加入指定户：输入小程序端显示的同步码，成功返回 true */
export function setOwnerId(raw: string): boolean {
  const id = normalizeOwnerId(raw)
  if (!isValidOwnerId(id)) return false
  ownerId = id
  localStorage.setItem(OWNER_KEY, id)
  return true
}

const DEVICE_TAG_KEY = 'device_tag'

/** v0.9.6 本机同步来源「desktop:随机 8 位」，每台电脑唯一（与小程序 getDeviceSource 同规则）。
 *  旧版所有电脑共用 'desktop'：自己传的注销凭条要跳过，同户第二台电脑于是永远不跟着彻底删除 */
function deviceSource(): string {
  let tag = localStorage.getItem(DEVICE_TAG_KEY)
  if (!tag) {
    tag = newOwnerId().slice(0, 8)
    localStorage.setItem(DEVICE_TAG_KEY, tag)
  }
  return `desktop:${tag}`
}

// ---- 初始化 ----

/** 初始化 CloudBase 连接 */
export async function initCloud(env: string): Promise<boolean> {
  try {
    envId = env
    app = cloudbase.init({ env })
    auth = app.auth({ persistence: 'local' })

    // 匿名登录
    await auth.anonymousAuthProvider().signIn()
    db = app.database()
    return true
  } catch (e: any) {
    console.error('[CloudBase] 初始化失败:', e.message)
    return false
  }
}

/** 是否已连接 */
export function isConnected(): boolean {
  return db !== null
}

/** 获取环境 ID */
export function getEnvId(): string {
  return envId
}

// ---- 数据操作 ----

export interface CloudRecord {
  _id?: string
  type: string
  amount: number
  categoryKey: string
  categoryName: string
  subcategoryKey: string
  subcategoryName: string
  note: string
  date: string
  person?: string  // v0.8.0 记录人（谁花的，可选）
  createdAt?: number // v0.8.7 提交时刻毫秒时间戳：跨端保持"同一天内记的早的排后面"
  updatedAt: number
  ownerId?: string   // 同步码，只同步同码记录（多用户隔离）
  source?: string
}

/** 删除凭证（v0.6.6 软删除）：与小程序端 cloudCore.ts 格式一致 */
export interface CloudTombstone {
  _id?: string
  kind: 'tombstone'
  targetKey: string
  ownerId: string
  updatedAt: number
  source?: string
  label?: string        // v0.6.7 人话摘要，仅供控制台阅读
}

/** 撤销凭条（v0.6.7 恢复）：抵消一条删除凭证，让回收站恢复也能跨端生效 */
export interface CloudRevive {
  _id?: string
  kind: 'revive'
  targetKey: string
  ownerId: string
  updatedAt: number
  source?: string
  label?: string
}

/** 注销凭条（v0.8.5 彻底删除）：与小程序端 cloudCore.ts 格式一致 */
export interface CloudPurge {
  _id?: string
  kind: 'purge'
  pid: string
  targetKey: string
  cancelRec: number
  cancelTomb: number
  cancelRev: number
  ownerId: string
  updatedAt: number
  source?: string
  label?: string
}

/** 本地待上传注销凭条（sync_purges 表行） */
export interface PendingPurge {
  pid: string
  targetKey: string
  cancelRec: number
  cancelTomb: number
  cancelRev: number
  label?: string
}

/**
 * 实体快照文档（v0.7.3 待办/周期账单同步，与小程序端 cloudCore.ts 格式一致）：
 * 每次改动追加一条完整新快照，各端按 entityId 取 updatedAt 最大的一份；删除 = deleted:true 快照
 */
export interface CloudEntityDoc {
  _id?: string
  kind: 'todo' | 'recurring'
  entityId: string
  ownerId: string
  updatedAt: number
  source?: string
  data: Record<string, any>
}

export type CloudDoc = CloudRecord | CloudTombstone | CloudRevive | CloudPurge | CloudEntityDoc
export type NewCloudDoc =
  | Omit<CloudRecord, '_id'>
  | Omit<CloudTombstone, '_id'>
  | Omit<CloudRevive, '_id'>
  | Omit<CloudPurge, '_id'>
  | Omit<CloudEntityDoc, '_id'>

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

/** 凭证/凭条的人话摘要（与小程序 cloudCore.docLabel 格式一致） */
function docLabel(r: { date: string; categoryName?: string; categoryKey?: string; subcategoryName?: string; subcategoryKey?: string; amount: number; note?: string }): string {
  return `${r.date} ${r.categoryName || r.categoryKey || ''}/${r.subcategoryName || r.subcategoryKey || ''} ¥${r.amount}${r.note ? ' 备注:' + r.note : ''}`
}

/** 上传单条文档（账单或删除凭证；失败时把真实错误带回去，不再静默吞掉） */
export async function uploadRecord(record: NewCloudDoc): Promise<{ id: string | null; error?: string }> {
  if (!db) return { id: null, error: '未连接云端' }
  try {
    const res = await db.collection(COLLECTION).add({ ...record, ownerId: getOwnerId(), updatedAt: Date.now() })
    return { id: res.id || null }
  } catch (e: any) {
    console.error('[CloudBase] 上传失败:', e.message)
    return { id: null, error: e.message || String(e) }
  }
}

/** 批量上传：成功数 + 失败数 + 第一条错误 */
export async function uploadRecords(records: NewCloudDoc[]): Promise<{ uploaded: number; failed: number; firstError?: string }> {
  if (!db || records.length === 0) return { uploaded: 0, failed: 0 }
  let uploaded = 0
  let failed = 0
  let firstError: string | undefined
  for (const r of records) {
    const res = await uploadRecord(r)
    if (res.id) uploaded++
    else { failed++; firstError = firstError || res.error }
  }
  return { uploaded, failed, firstError }
}

/** 下载云端本户（同同步码）的全部文档（账单 + 删除凭证混合格式） */
export async function downloadAllRecords(): Promise<CloudDoc[]> {
  if (!db) return []
  try {
    // CloudBase 默认限制一次查 100 条，需要分页；同一趟上传的文档 updatedAt 相同，补 _id 作稳定次序并按 _id 去重，防跨页重复/漏拉
    const all = new Map<string, CloudDoc>()
    let offset = 0
    const limit = 100
    while (true) {
      const res = await db.collection(COLLECTION)
        .where({ ownerId: getOwnerId() })
        .skip(offset).limit(limit).orderBy('updatedAt', 'desc').orderBy('_id', 'desc').get()
      if (!res.data || res.data.length === 0) break
      for (const d of res.data as CloudDoc[]) all.set(String(d._id), d)
      if (res.data.length < limit) break
      offset += limit
    }
    return [...all.values()]
  } catch (e: any) {
    console.error('[CloudBase] 下载失败:', e.message)
    return []
  }
}

/** 下载本户指定时间之后的文档（含账单与凭证） */
export async function downloadSince(timestamp: number): Promise<CloudDoc[]> {
  if (!db) return []
  try {
    const all: CloudDoc[] = []
    let offset = 0
    const limit = 100
    while (true) {
      const res = await db.collection(COLLECTION)
        .where({ ownerId: getOwnerId(), updatedAt: db.command.gt(timestamp) })
        .skip(offset).limit(limit).orderBy('updatedAt', 'desc').get()
      if (!res.data || res.data.length === 0) break
      all.push(...res.data)
      if (res.data.length < limit) break
      offset += limit
    }
    return all
  } catch (e: any) {
    console.error('[CloudBase] 增量下载失败:', e.message)
    return []
  }
}

// ---- 同步元数据 ----

export async function getSyncMeta(): Promise<{ lastSyncAt: number } | null> {
  if (!db) return null
  try {
    const val = localStorage.getItem(syncMetaKey())
    return val ? JSON.parse(val) : null
  } catch {
    return null
  }
}

export function saveSyncMeta(meta: { lastSyncAt: number }): void {
  localStorage.setItem(syncMetaKey(), JSON.stringify(meta))
}

// 同步进度按 环境+同步码 分隔：换环境或换户都不会错用旧增量时间戳
function syncMetaKey(): string {
  return `${SYNC_META_KEY}_${envId.slice(0, 8)}_${getOwnerId().slice(0, 8)}`
}

// ---- 完整同步流程 ----

export interface SyncResult {
  success: boolean
  uploaded: number
  downloaded: number
  error?: string
}

/** 跨端去重键 —— 与小程序 cloudCore.ts 的 recordKey 保持一致 */
function recordKeyOf(r: { date: string; amount: number; subcategoryKey: string; type: string }): string {
  return `${r.date}|${r.amount}|${r.subcategoryKey}|${r.type}`
}

function countBy(list: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const k of list) m.set(k, (m.get(k) || 0) + 1)
  return m
}

/** 需回写 SQLite 的标删请求（由 AppLayout 执行 records:markByFingerprint IPC） */
export interface MarkRequest {
  parts: { date: string; amount: number; subcategoryKey: string; type: string }
  count: number
}

/** 解析去重键（删除凭证定位本地哪笔该标删） */
function parseKey(key: string): MarkRequest['parts'] | null {
  const p = (key || '').split('|')
  if (p.length !== 4) return null
  const amount = Number(p[1])
  if (isNaN(amount)) return null
  return { date: p[0], amount, subcategoryKey: p[2], type: p[3] }
}

/**
 * v0.7.3 单类实体（待办/周期账单）LWW 同步：与小程序端 cloudCore.syncEntities 同算法。
 * 返回 toUpload（需传云端的快照文档）与 incoming（需回写本地的快照数据）
 */
function planEntities(
  kind: 'todo' | 'recurring',
  local: EntitySnapshot[],
  cloudDocs: CloudEntityDoc[],
): { toUpload: NewCloudDoc[]; incoming: EntitySnapshot[] } {
  const latest = new Map<string, CloudEntityDoc>()
  for (const d of cloudDocs) {
    const cur = latest.get(d.entityId)
    if (!cur || (d.updatedAt || 0) > (cur.updatedAt || 0)) latest.set(d.entityId, d)
  }
  const localById = new Map<string, EntitySnapshot>()
  const toUpload: NewCloudDoc[] = []
  for (const item of local) {
    if (!item.id) continue
    localById.set(item.id, item)
    const c = latest.get(item.id)
    const ts = item.updatedAt || 0
    if (!c || ts > (c.updatedAt || 0)) {
      toUpload.push({ kind, entityId: item.id, ownerId: getOwnerId(), updatedAt: ts || Date.now(), source: deviceSource(), data: item })
    }
  }
  const incoming: EntitySnapshot[] = []
  latest.forEach((c, id) => {
    const l = localById.get(id)
    if (!l || (c.updatedAt || 0) > (l.updatedAt || 0)) {
      if (c.data) incoming.push({ ...c.data, id, updatedAt: c.updatedAt })
    }
  })
  return { toUpload, incoming }
}

type EntitySnapshot = Record<string, any> & { id: string; updatedAt?: number }

/**
 * 执行完整双向同步（v0.6.7：笔数配对 + 删除凭证 + 撤销凭条，与小程序端 runSync 算法对齐）。
 * 不变式：每键本地总行数 ↔ 云端账单数；本地(已删+累计恢复) ↔ 云端凭证数；本地累计恢复 ↔ 云端撤销数。
 * 返回 newCloudRecords = 需新增入库的账单；toMark = 按凭证软删；toAlive = 按撤销凭条恢复
 * v0.7.3：额外处理待办/周期账单实体快照（LWW），返回 todoIncoming/recurringIncoming 需回写 SQLite
 */
export async function performSync(
  localRecords: {
    type: string; amount: number; categoryKey: string; categoryName: string
    subcategoryKey: string; subcategoryName: string; note: string; date: string
    person?: string; createdAt?: number; deleted?: number; reviveCount?: number
  }[],
  localTodos: EntitySnapshot[] = [],
  localRecurring: EntitySnapshot[] = [],
  pendingPurges: PendingPurge[] = [],
): Promise<{
  result: SyncResult
  newCloudRecords: CloudRecord[]
  toMark: MarkRequest[]
  toAlive: MarkRequest[]
  toPurge: MarkRequest[]
  purgeUploadedPids: string[]
  todoIncoming: EntitySnapshot[]
  recurringIncoming: EntitySnapshot[]
}> {
  const empty = { result: { success: false, uploaded: 0, downloaded: 0, error: '未连接云端' }, newCloudRecords: [] as CloudRecord[], toMark: [] as MarkRequest[], toAlive: [] as MarkRequest[], toPurge: [] as MarkRequest[], purgeUploadedPids: [] as string[], todoIncoming: [] as EntitySnapshot[], recurringIncoming: [] as EntitySnapshot[] }
  if (!db) return empty

  try {
    const docs = await downloadAllRecords()
    const cloudRecs = docs.filter((d) => !isTombstone(d) && !isRevive(d) && !isPurge(d) && !isEntityDoc(d)) as CloudRecord[]
    const cloudTombs = docs.filter((d) => isTombstone(d)) as CloudTombstone[]
    const cloudRevs = docs.filter((d) => isRevive(d)) as CloudRevive[]
    const cloudPurges = docs.filter((d) => isPurge(d)) as CloudPurge[]
    const cloudTodoDocs = docs.filter((d) => (d as CloudEntityDoc).kind === 'todo') as CloudEntityDoc[]
    const cloudRecurDocs = docs.filter((d) => (d as CloudEntityDoc).kind === 'recurring') as CloudEntityDoc[]

    // 0. v0.8.5 登记对端注销凭条额度（自己的不消费）；v0.8.6 实际删除挪到 eff 算好后按差额执行
    const toPurge: MarkRequest[] = []
    const purgeCredit = new Map<string, number>()
    for (const p of cloudPurges) {
      // 自己传的凭条对应行早已本地删除，不重复消费；升级前共用名 'desktop' 的历史凭条也按自己的处理（保持旧行为，防误删离线新记的同号账）
      if (p.source === deviceSource() || p.source === 'desktop') continue
      const n = Math.max(0, p.cancelRec || 0)
      if (n > 0 && parseKey(p.targetKey)) purgeCredit.set(p.targetKey, (purgeCredit.get(p.targetKey) || 0) + n)
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
        const recBefore = cloudRecs.filter(r => recordKeyOf(r) === k && (r.updatedAt || 0) < pTime).length
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
    const cloudRecCounts = countBy(cloudRecs.map(recordKeyOf))
    const cloudTombCounts = countBy(cloudTombs.map((t) => t.targetKey))
    const cloudReviveCounts = countBy(cloudRevs.map((v) => v.targetKey))
    const effRec = (k: string) => Math.max(0, (cloudRecCounts.get(k) || 0) - (cancelRec.get(k) || 0))
    const effTomb = (k: string) => Math.max(0, (cloudTombCounts.get(k) || 0) - (cancelTomb.get(k) || 0))
    const effRev = (k: string) => Math.max(0, (cloudReviveCounts.get(k) || 0) - (cancelRev.get(k) || 0))
    // 0b. v0.8.6 注销凭条消费（差额版）：本地该键总行数超出云端有效账单数的部分才物理删，
    //     优先删回收站行、不够再删同号存活行（堵离线端错过删除后诈尸回传）；
    //     删除额度封顶对端凭条 cancelRec，防误杀注销后新加的同号账。内存快照同步扣减，落库由 AppLayout 执行
    purgeCredit.forEach((credit, k) => {
      const parts = parseKey(k)
      if (!parts) return
      const total = localRecords.filter((r) => recordKeyOf(r) === k).length
      const excess = Math.min(credit, Math.max(0, total - effRec(k)))
      if (excess <= 0) return
      let left = excess
      for (const pass of [1, 0]) { // 第 1 轮删回收站行，第 2 轮删存活行
        for (let i = localRecords.length - 1; i >= 0 && left > 0; i--) {
          const row = localRecords[i]
          if (((row.deleted || 0) > 0 ? 1 : 0) === pass && recordKeyOf(row) === k) {
            localRecords.splice(i, 1) // 内存快照先删，保证本轮所有配对基于"已物理删除"状态
            left--
          }
        }
      }
      if (excess - left > 0) toPurge.push({ parts, count: excess - left })
    })
    const localTotals = countBy(localRecords.map(recordKeyOf))            // 存活 + 已删
    // 凭证配额：死过一行 = 一张；每被恢复过一次 = 历史再多一张（配额 = D + V）
    const tombDonors: typeof localRecords = []
    const reviveDonors: typeof localRecords = []
    for (const r of localRecords) {
      if ((r.deleted || 0) > 0) tombDonors.push(r)
      for (let i = 0; i < (r.reviveCount || 0); i++) { tombDonors.push(r); reviveDonors.push(r) }
    }
    const deadList = localRecords.filter((r) => (r.deleted || 0) > 0)
    const localDeadCounts = countBy(deadList.map(recordKeyOf))
    const tombQuota = countBy(tombDonors.map(recordKeyOf))
    const localReviveCounts = countBy(reviveDonors.map(recordKeyOf))

    const toUpload: NewCloudDoc[] = []
    // 0d. v0.8.5 上传本端注销凭条（彻底删除队列，含离线积压）：pid 不在云端的才传，防重复核销
    const cloudPurgePids = new Set(cloudPurges.map((p) => p.pid || ''))
    const uploadingPurges: PendingPurge[] = []
    for (const p of pendingPurges) {
      if (!p.pid || cloudPurgePids.has(p.pid)) continue
      toUpload.push({ kind: 'purge', pid: p.pid, targetKey: p.targetKey, cancelRec: p.cancelRec, cancelTomb: p.cancelTomb, cancelRev: p.cancelRev, ownerId: getOwnerId(), updatedAt: Date.now(), source: deviceSource(), label: p.label })
      uploadingPurges.push(p)
    }
    if (uploadingPurges.length > 0) {
      // 本轮配对立即按注销后计（刚删的行不会被旧计数倒灌回本地）
      for (const p of uploadingPurges) {
        cancelRec.set(p.targetKey, (cancelRec.get(p.targetKey) || 0) + Math.max(0, p.cancelRec))
        cancelTomb.set(p.targetKey, (cancelTomb.get(p.targetKey) || 0) + Math.max(0, p.cancelTomb))
        cancelRev.set(p.targetKey, (cancelRev.get(p.targetKey) || 0) + Math.max(0, p.cancelRev))
      }
    }
    // 1. 补传账单：本键本地总行数超出云端有效账单数的部分（deleted/reviveCount 不上云，云端只存原始内容）
    const pushPerKey = new Map<string, number>()
    for (const r of localRecords) {
      const k = recordKeyOf(r)
      const need = (localTotals.get(k) || 0) - effRec(k)
      const done = pushPerKey.get(k) || 0
      if (need > 0 && done < need) {
        const { deleted: _dl, reviveCount: _rv, ...doc } = r
        toUpload.push({ ...doc, source: deviceSource(), updatedAt: Date.now() })
        pushPerKey.set(k, done + 1)
      }
    }
    // 2a. 补传删除凭证：配额(D+V)超出云端有效凭证数的部分；label 供人在控制台看懂删的是哪笔
    const pushTombPerKey = new Map<string, number>()
    for (const r of tombDonors) {
      const k = recordKeyOf(r)
      const need = (tombQuota.get(k) || 0) - effTomb(k)
      const done = pushTombPerKey.get(k) || 0
      if (need > 0 && done < need) {
        toUpload.push({ kind: 'tombstone', targetKey: k, ownerId: getOwnerId(), updatedAt: Date.now(), source: deviceSource(), label: docLabel(r) })
        pushTombPerKey.set(k, done + 1)
      }
    }
    // 2b. 补传撤销凭条：本地恢复数超出云端有效撤销数的部分（恢复也跨端生效）
    const pushRevPerKey = new Map<string, number>()
    for (const r of reviveDonors) {
      const k = recordKeyOf(r)
      const need = (localReviveCounts.get(k) || 0) - effRev(k)
      const done = pushRevPerKey.get(k) || 0
      if (need > 0 && done < need) {
        toUpload.push({ kind: 'revive', targetKey: k, ownerId: getOwnerId(), updatedAt: Date.now(), source: deviceSource(), label: docLabel(r) })
        pushRevPerKey.set(k, done + 1)
      }
    }
    // 2c. v0.7.3 待办/周期账单实体快照（LWW）：需补传的快照并入本轮上传，需回写的本地快照带回去
    const todoPlan = planEntities('todo', localTodos, cloudTodoDocs)
    const recurPlan = planEntities('recurring', localRecurring, cloudRecurDocs)
    toUpload.push(...todoPlan.toUpload, ...recurPlan.toUpload)

    let uploaded = 0
    const purgeUploadedPids: string[] = []
    if (toUpload.length > 0) {
      const up = await uploadRecords(toUpload)
      uploaded = up.uploaded
      // 该传却一条都没传上去 = 写入通道断了，必须把真实错误抱出来，不能再冒充"已最新"
      if (up.uploaded === 0) {
        return { result: { success: false, uploaded: 0, downloaded: 0, error: `云端写入失败（${up.failed} 条未传）：${up.firstError || '未知原因'} — 请检查 records 集合是否存在、权限是否允许创建、匿名登录是否开启` }, newCloudRecords: [], toMark: [], toAlive: [], toPurge, purgeUploadedPids: [], todoIncoming: [], recurringIncoming: [] }
      }
      // 全部传成功才清本地凭条队列；部分失败留着，下轮靠 pid 去重只补漏网的（幂等，不会重复核销）
      if (up.failed === 0) purgeUploadedPids.push(...uploadingPurges.map((p) => p.pid))
    }

    // 3. 补拉账单：云端有效账单数超出本地总行数的差额（v0.8.3 去掉 lastSyncAt 时间窗：
    //    窗口会把"另一端在你上次同步之前传入"的数据永久漏拉；差额配对本身幂等，刚自己传的差额为 0 不倒灌）
    const rawDocs = docs
    const rawRecs = rawDocs.filter((d) => !isTombstone(d) && !isRevive(d) && !isPurge(d) && !isEntityDoc(d)) as CloudRecord[]
    const takenPerKey = new Map<string, number>()
    const newCloudRecords: CloudRecord[] = []
    for (const r of rawRecs) {
      const k = recordKeyOf(r)
      const cap = effRec(k) - (localTotals.get(k) || 0)
      const taken = takenPerKey.get(k) || 0
      if (cap > 0 && taken < cap) {
        takenPerKey.set(k, taken + 1)
        newCloudRecords.push(r)
      }
    }

    // 4. 按净额跟随标删/恢复：净删除数 = max(有效凭证数 - 有效撤销数, 0)，和本地已删数比差额（不设窗口，必收敛）。
    //    本轮刚补传的凭证/撤销也要计入净额，否则刚恢复的行会被旧凭证快照当场再标删（回灌）
    const toMark: MarkRequest[] = []
    const toAlive: MarkRequest[] = []
    const netDel = new Map<string, number>()
    cloudTombCounts.forEach((n, k) => netDel.set(k, Math.max(0, n - (cancelTomb.get(k) || 0))))
    pushTombPerKey.forEach((n, k) => netDel.set(k, (netDel.get(k) || 0) + n))
    cloudReviveCounts.forEach((n, k) => netDel.set(k, Math.max(0, (netDel.get(k) || 0) - Math.max(0, n - (cancelRev.get(k) || 0)))))
    pushRevPerKey.forEach((n, k) => netDel.set(k, Math.max(0, (netDel.get(k) || 0) - n)))
    netDel.forEach((cnt, k) => {
      const d = localDeadCounts.get(k) || 0
      const parts = parseKey(k)
      if (!parts) return
      if (cnt > d) toMark.push({ parts, count: cnt - d })
      else if (cnt < d) toAlive.push({ parts, count: d - cnt })
    })

    // 5. 更新同步时间
    saveSyncMeta({ lastSyncAt: Date.now() })

    return {
      result: { success: true, uploaded, downloaded: newCloudRecords.length },
      newCloudRecords,
      toMark,
      toAlive,
      toPurge,
      purgeUploadedPids,
      todoIncoming: todoPlan.incoming,
      recurringIncoming: recurPlan.incoming,
    }
  } catch (e: any) {
    return { result: { success: false, uploaded: 0, downloaded: 0, error: e.message }, newCloudRecords: [], toMark: [], toAlive: [], toPurge: [], purgeUploadedPids: [], todoIncoming: [], recurringIncoming: [] }
  }
}

/** 断开连接 */
export function disconnect(): void {
  db = null
  auth = null
  app = null
  envId = ''
}
