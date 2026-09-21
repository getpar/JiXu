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
}

export type CloudDoc = CloudRecord | CloudTombstone
export type NewCloudDoc = Omit<CloudRecord, '_id'> | Omit<CloudTombstone, '_id'>

export function isTombstone(d: CloudDoc): d is CloudTombstone {
  return (d as CloudTombstone).kind === 'tombstone'
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
    // CloudBase 默认限制一次查 100 条，需要分页
    const all: CloudDoc[] = []
    let offset = 0
    const limit = 100
    while (true) {
      const res = await db.collection(COLLECTION)
        .where({ ownerId: getOwnerId() })
        .skip(offset).limit(limit).orderBy('updatedAt', 'desc').get()
      if (!res.data || res.data.length === 0) break
      all.push(...res.data)
      if (res.data.length < limit) break
      offset += limit
    }
    return all
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
 * 执行完整双向同步（v0.6.6：笔数配对 + 软删除凭证，与小程序端 runSync 算法对齐）。
 * 不变式：每键本地总行数(存活+已删) ↔ 云端账单数；本地已删数 ↔ 云端凭证数。
 * 返回 newCloudRecords = 需新增入库的账单；toMark = 需按凭证软删除的本地记录
 */
export async function performSync(
  localRecords: {
    type: string; amount: number; categoryKey: string; categoryName: string
    subcategoryKey: string; subcategoryName: string; note: string; date: string
    deleted?: number
  }[],
): Promise<{ result: SyncResult; newCloudRecords: CloudRecord[]; toMark: MarkRequest[] }> {
  if (!db) return { result: { success: false, uploaded: 0, downloaded: 0, error: '未连接云端' }, newCloudRecords: [], toMark: [] }

  try {
    const docs = await downloadAllRecords()
    const cloudRecs = docs.filter((d) => !isTombstone(d)) as CloudRecord[]
    const cloudTombs = docs.filter((d) => isTombstone(d)) as CloudTombstone[]
    const cloudRecCounts = countBy(cloudRecs.map(recordKeyOf))
    const cloudTombCounts = countBy(cloudTombs.map((t) => t.targetKey))
    const localTotals = countBy(localRecords.map(recordKeyOf))            // 存活 + 已删
    const deadList = localRecords.filter((r) => (r.deleted || 0) > 0)
    const localDeadCounts = countBy(deadList.map(recordKeyOf))

    const toUpload: NewCloudDoc[] = []
    // 1. 补传账单：本键本地总行数超出云端账单数的部分（deleted 字段不上云，云端只存原始内容）
    const pushPerKey = new Map<string, number>()
    for (const r of localRecords) {
      const k = recordKeyOf(r)
      const need = (localTotals.get(k) || 0) - (cloudRecCounts.get(k) || 0)
      const done = pushPerKey.get(k) || 0
      if (need > 0 && done < need) {
        const { deleted: _dl, ...doc } = r
        toUpload.push({ ...doc, updatedAt: Date.now() })
        pushPerKey.set(k, done + 1)
      }
    }
    // 2. 补传删除凭证：本键已删数超出云端凭证数的部分
    const pushTombPerKey = new Map<string, number>()
    for (const r of deadList) {
      const k = recordKeyOf(r)
      const need = (localDeadCounts.get(k) || 0) - (cloudTombCounts.get(k) || 0)
      const done = pushTombPerKey.get(k) || 0
      if (need > 0 && done < need) {
        toUpload.push({ kind: 'tombstone', targetKey: k, ownerId: getOwnerId(), updatedAt: Date.now(), source: 'desktop' })
        pushTombPerKey.set(k, done + 1)
      }
    }
    let uploaded = 0
    if (toUpload.length > 0) {
      const up = await uploadRecords(toUpload)
      uploaded = up.uploaded
      // 该传却一条都没传上去 = 写入通道断了，必须把真实错误抱出来，不能再冒充"已最新"
      if (up.uploaded === 0) {
        return { result: { success: false, uploaded: 0, downloaded: 0, error: `云端写入失败（${up.failed} 条未传）：${up.firstError || '未知原因'} — 请检查 records 集合是否存在、权限是否允许创建、匿名登录是否开启` }, newCloudRecords: [], toMark: [] }
      }
    }

    // 3. 补拉账单：云端账单数超出本地总行数的差额，限上次同步后写入的（刚自己传的因差额为 0 不倒灌）
    const meta = await getSyncMeta()
    const rawDocs = meta ? await downloadSince(meta.lastSyncAt) : docs
    const rawRecs = rawDocs.filter((d) => !isTombstone(d)) as CloudRecord[]
    const takenPerKey = new Map<string, number>()
    const newCloudRecords: CloudRecord[] = []
    for (const r of rawRecs) {
      const k = recordKeyOf(r)
      const cap = (cloudRecCounts.get(k) || 0) - (localTotals.get(k) || 0)
      const taken = takenPerKey.get(k) || 0
      if (cap > 0 && taken < cap) {
        takenPerKey.set(k, taken + 1)
        newCloudRecords.push(r)
      }
    }

    // 4. 凭证补标删：云端凭证数超出本地已删数的差额（不设窗口，收敛）
    const toMark: MarkRequest[] = []
    cloudTombCounts.forEach((tombCount, k) => {
      const need = tombCount - (localDeadCounts.get(k) || 0)
      const parts = parseKey(k)
      if (need > 0 && parts) toMark.push({ parts, count: need })
    })

    // 5. 更新同步时间
    saveSyncMeta({ lastSyncAt: Date.now() })

    return {
      result: { success: true, uploaded, downloaded: newCloudRecords.length },
      newCloudRecords,
      toMark,
    }
  } catch (e: any) {
    return { result: { success: false, uploaded: 0, downloaded: 0, error: e.message }, newCloudRecords: [], toMark: [] }
  }
}

/** 断开连接 */
export function disconnect(): void {
  db = null
  auth = null
  app = null
  envId = ''
}
