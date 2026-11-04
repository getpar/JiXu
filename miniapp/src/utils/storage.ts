import Taro from '@tarojs/taro'
import { getCloudCollection, getOwnerId, getDeviceSource, taroStore } from './cloud'
import { runSync, recordKey, parseRecordKey, PendingPurge, SyncableRecord, SyncResult } from './cloudCore'
import { sumAmounts } from './money'
import { localDateStr, advanceDate } from './dates'

// ========== 类型 ==========

export interface RecordItem {
  id: string
  type: 'expense' | 'income'
  amount: number
  categoryKey: string
  categoryName: string
  subcategoryKey: string
  subcategoryName: string
  note: string
  date: string
  person?: string       // v0.8.0 记录人（谁花的，可选，随云同步跨端）
  createdAt?: number    // v0.8.7 提交时刻毫秒时间戳（随云同步跨端；列表同日按它倒序，新的在上）
  photo?: string        // v0.8.1 拍照凭证：本机持久文件路径（仅存手机，不上云）
  deleted?: number      // v0.6.6 软删除：1 = 已删（页面不显示，数据留底可恢复）；undefined/0 = 正常
  reviveCount?: number  // v0.6.7 被恢复过的次数（同步用：历史删除凭证配额 = 已删 + 恢复次数）
}

// ========== 云同步（本地为主 + 云端双向增量同步） ==========

/**
 * 执行一次双向同步：本地新记录上传云端，云端（桌面端等其他设备）新记录/删除凭证拉回本地。
 * 只同步同一个“同步码”（ownerId）的文档 — 多用户隔离的关键。
 * 未配置云环境 ID 时走「本地模拟云」，逻辑完全一致，接真云零改动。
 * v0.6.6：删除/编辑通过"删除凭证 + 新增"参与同步（软删除，集合权限不变、无需云函数）。
 */
export async function syncNow(force = false): Promise<SyncResult> {
  // v0.8.3 并发锁：冷启动时 app.tsx + 首页 show + 周期检查会几乎同时触发多路同步，
  // 并发跑会互相"看不见"对方在传的数据导致同一笔重复上传，这里合并为同一趟
  if (syncInFlight) {
    if (!force) return syncInFlight
    // v0.9.6 写后推送撞上正在跑的同步：那一趟读本地时还没有这次的改动，排队补跑一趟（多次请求合并为一趟）
    if (!syncQueued) {
      syncQueued = syncInFlight.catch(() => undefined).then(() => { syncQueued = null; return syncNow(true) })
    }
    return syncQueued
  }
  // v0.8.4 节流：进页自动触发的同步 30 秒内不重复拉（账单页秒开优化）；
  // 记账/删除/恢复后的推送传 force=true 必走
  if (!force && Date.now() - lastSyncDoneAt < 30_000) return { ok: true, pushed: 0, pulled: 0 }
  syncInFlight = runSync({
    cloud: getCloudCollection(),
    source: getDeviceSource(),
    legacySources: ['miniapp'],
    ownerId: getOwnerId(),
    getLocal: getAllRecords,
    addLocal: mergeLocalRecords,
    markLocal: markLocalDeleted,
    markAlive: markLocalAlive,
    purgeLocal: purgeLocalRecords,                          // v0.8.5 消费对端注销凭条
    purges: { getPending: getPendingPurges, clearPending: clearPendingPurges }, // v0.8.5 上传本端注销凭条
    store: taroStore,
    // v0.7.3 待办/周期账单参与云同步（LWW 快照，与账单链路互不干扰）
    todos: { getLocal: getAllTodos, apply: applyCloudTodos },
    recurring: { getLocal: getAllRecurringBills, apply: applyCloudRecurringBills },
  }).finally(() => { syncInFlight = null; lastSyncDoneAt = Date.now() })
  return syncInFlight
}
let syncInFlight: Promise<SyncResult> | null = null
let syncQueued: Promise<SyncResult> | null = null
let lastSyncDoneAt = 0 // v0.8.4 上次同步完成时刻（进页自动同步的 30 秒节流依据）

/** v0.9.6 本地写完后推一次云：不等待——离线/弱网时保存不再卡在网络超时上，失败由下次同步补传 */
function pushSoon(): void {
  syncNow(true).catch(() => { /* 下次同步兜底 */ })
}

/** 把云端记录写入本地（笔数配对由引擎算好，这里只防同一条云端记录重复入账），返回实际新增条数 */
async function mergeLocalRecords(records: SyncableRecord[]): Promise<number> {
  const list = readAllRecordsSync()
  const seenIds = new Set(list.map((r) => String(r.id)))
  let added = 0
  for (const r of records) {
    if (r.id && seenIds.has(String(r.id))) continue // 同一条云端记录不重复导入
    list.push({ ...r, id: r.id || `c_${Date.now()}_${added}` } as RecordItem)
    if (r.id) seenIds.add(String(r.id))
    added++
  }
  if (added > 0) writeAllRecords(sortRecordsByTimeDesc(list))
  return added
}

/** 按去重键把 count 笔本地存活记录标删（引擎拉到云端删除凭证时调用） */
async function markLocalDeleted(key: string, count: number): Promise<number> {
  if (!parseRecordKey(key)) return 0
  const list = readAllRecordsSync()
  let marked = 0
  for (const r of list) {
    if (marked >= count) break
    if (!r.deleted && recordKey(r) === key) {
      r.deleted = 1
      marked++
    }
  }
  if (marked > 0) writeAllRecords(list)
  return marked
}

/** v0.6.7 按去重键把 count 笔本地已删记录复活（引擎拉到云端撤销凭条时调用；reviveCount+1 防凭证回灌） */
async function markLocalAlive(key: string, count: number): Promise<number> {
  if (!parseRecordKey(key)) return 0
  const list = readAllRecordsSync()
  let revived = 0
  for (const r of list) {
    if (revived >= count) break
    if (r.deleted && recordKey(r) === key) {
      r.deleted = 0
      r.reviveCount = (r.reviveCount || 0) + 1
      revived++
    }
  }
  if (revived > 0) writeAllRecords(list)
  return revived
}

// ========== v0.8.5 彻底删除（回收站物理删除 + 注销凭条） ==========

/** 待上传注销凭条队列（离线彻底删除也不丢，同步上传成功后按 pid 清除） */
function getPendingPurges(): PendingPurge[] {
  const raw = Taro.getStorageSync('purge_pending')
  return raw ? (JSON.parse(raw) as PendingPurge[]) : []
}

function savePendingPurges(list: PendingPurge[]): void {
  Taro.setStorageSync('purge_pending', JSON.stringify(list))
}

function clearPendingPurges(pids: string[]): void {
  const gone = new Set(pids)
  savePendingPurges(getPendingPurges().filter((p) => !gone.has(p.pid)))
}

/** v0.9.6 物理删除行后清掉不再被任何行引用的小票照片（编辑会让新旧两行共用同一张照片，所以按引用判断） */
function removeOrphanPhotos(removed: RecordItem[], kept: RecordItem[]): void {
  const inUse = new Set(kept.map((r) => r.photo).filter(Boolean))
  const fs = Taro.getFileSystemManager()
  for (const r of removed) {
    if (!r.photo || inUse.has(r.photo)) continue
    try { fs.unlinkSync(r.photo) } catch { /* 文件已不在 */ }
    inUse.add(r.photo)
  }
}

/** 引擎消费对端注销凭条：按去重键物理删除 count 笔本地行（v0.8.6 优先删回收站行，不够再删同号存活行，防离线窗口诈尸） */
async function purgeLocalRecords(key: string, count: number): Promise<number> {
  if (!parseRecordKey(key)) return 0
  const list = readAllRecordsSync()
  const doomed = new Set<RecordItem>()
  for (const r of list) if (doomed.size < count && r.deleted && recordKey(r) === key) doomed.add(r)
  for (const r of list) if (doomed.size < count && !r.deleted && recordKey(r) === key) doomed.add(r)
  if (doomed.size === 0) return 0
  const kept = list.filter((r) => !doomed.has(r))
  writeAllRecords(kept)
  removeOrphanPhotos([...doomed], kept)
  return doomed.size
}

/**
 * 彻底删除回收站里的一笔：本地物理删除 + 生成注销凭条入队 + 立即同步上云。
 * 凭条核销量 = 该行完整生命周期（1 张账单 + (1+V) 张删除凭证 + V 张撤销凭条），
 * 对端同步后自己那份回收站行也会被物理删除，且云端计数配平、绝不回流复活。
 */
export async function purgeRecord(id: string): Promise<void> {
  const list = readAllRecordsSync()
  const rec = list.find((r) => String(r.id) === String(id))
  if (!rec || !(rec.deleted || 0)) return
  const v = rec.reviveCount || 0
  const pend = getPendingPurges()
  pend.push({
    pid: `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    targetKey: recordKey(rec),
    cancelRec: 1,
    cancelTomb: 1 + v,
    cancelRev: v,
    label: `${rec.date} ${rec.categoryName || ''}/${rec.subcategoryName || ''} ¥${rec.amount}${rec.note ? ' 备注:' + rec.note : ''}`,
  })
  savePendingPurges(pend)
  const kept = list.filter((r) => String(r.id) !== String(id))
  writeAllRecords(kept)
  removeOrphanPhotos([rec], kept)
  pushSoon() // 把注销凭条推上云（失败不阻塞，队列会随下次同步补传）
}

// ========== 账单本地存储（v0.9.6 按月分片） ==========
// 微信 Storage 单个 key 上限 1MB：旧版把全部账单（含回收站与编辑留底行）塞进一个 key，
// 约 4000 行后 setStorageSync 抛错，记账与同步会静默失败。改为每月一个 key + 月份索引。

const LEGACY_RECORDS_KEY = 'daily_records'
const RECORD_MONTHS_KEY = 'daily_records_months'

function shardKey(month: string): string {
  return `daily_records_${month}`
}

function shardOf(r: RecordItem): string {
  const m = /^\d{4}-\d{2}/.exec(r.date || '')
  return m ? m[0] : 'unknown'
}

/** 各分片当前落盘内容（每次全量读时重建、写时更新），保存时只重写内容真正变了的月份 */
const shardCache = new Map<string, string>()

function readMonthIndex(): string[] {
  const raw = Taro.getStorageSync(RECORD_MONTHS_KEY)
  return raw ? JSON.parse(raw) : []
}

/** 读全部账单行（含回收站行），月份倒序拼接；首次运行时把旧版单 key 数据迁到分片 */
function readAllRecordsSync(): RecordItem[] {
  const legacy = Taro.getStorageSync(LEGACY_RECORDS_KEY)
  if (legacy) {
    // 先写分片与索引、再删旧 key：中途被杀下次会从旧 key 整体重放（覆盖写，幂等）
    shardCache.clear()
    writeAllRecords(JSON.parse(legacy))
    Taro.removeStorageSync(LEGACY_RECORDS_KEY)
  }
  shardCache.clear()
  const list: RecordItem[] = []
  for (const m of readMonthIndex().reverse()) {
    const raw = Taro.getStorageSync(shardKey(m))
    if (!raw) continue
    shardCache.set(m, raw)
    list.push(...(JSON.parse(raw) as RecordItem[]))
  }
  return list
}

function writeAllRecords(list: RecordItem[]): void {
  const groups = new Map<string, RecordItem[]>()
  for (const r of list) {
    const m = shardOf(r)
    const g = groups.get(m)
    if (g) g.push(r)
    else groups.set(m, [r])
  }
  const prev = readMonthIndex()
  const months = [...groups.keys()].sort()
  // 先登记新月份再写分片：中途被杀最多留下空索引项（读时跳过），不会出现「有分片没索引」的隐形账
  const union = [...new Set([...prev, ...months])].sort()
  if (union.length !== prev.length) Taro.setStorageSync(RECORD_MONTHS_KEY, JSON.stringify(union))
  for (const m of months) {
    const json = JSON.stringify(groups.get(m))
    if (shardCache.get(m) === json) continue
    Taro.setStorageSync(shardKey(m), json)
    shardCache.set(m, json)
  }
  for (const m of prev) {
    if (groups.has(m)) continue
    Taro.removeStorageSync(shardKey(m))
    shardCache.delete(m)
  }
  if (union.length !== months.length) Taro.setStorageSync(RECORD_MONTHS_KEY, JSON.stringify(months))
}

/** 清空本机全部数据（含小票照片目录）；云端账本不受影响 */
export function clearAllLocalData(): void {
  Taro.clearStorageSync()
  shardCache.clear()
  try { Taro.getFileSystemManager().rmdirSync(`${Taro.env.USER_DATA_PATH}/photos`, true) } catch { /* 没拍过照 */ }
}

// ========== 记录 CRUD ==========

/** v0.8.7 提交时刻排序键：createdAt 优先，老数据退用毫秒 id（本地新增时 id 即时间戳），云端导入的 cloud_ id 退 0 */
function createdAtOf(r: RecordItem): number {
  return r.createdAt || Number(r.id) || 0
}

/** v0.8.7 统一账单排序：日期倒序 + 同一天按提交时间倒序（9 点记的排在 8 点上面） */
export function sortRecordsByTimeDesc(list: RecordItem[]): RecordItem[] {
  return list.sort((a, b) => b.date.localeCompare(a.date) || createdAtOf(b) - createdAtOf(a))
}

export async function getRecords(): Promise<RecordItem[]> {
  // 页面展示用：只返回未删除的记录（软删除对全页面自动生效），并按统一时间倒序
  return sortRecordsByTimeDesc(readAllRecordsSync().filter((r) => !(r.deleted || 0)))
}

/** 引擎内部用：返回全部行（含已标记删除的，笔数配对需要完整底数） */
async function getAllRecords(): Promise<RecordItem[]> {
  // 本地存储是读取的唯一来源（快、可离线），云端由 syncNow 增量合入
  return readAllRecordsSync()
}

/** 本地 id = 毫秒时间戳；同一毫秒连记多笔（周期账单批量补记）时顺延 1ms，保证不撞号 */
let lastLocalId = 0
function nextLocalId(): string {
  lastLocalId = Math.max(Date.now(), lastLocalId + 1)
  return String(lastLocalId)
}

/** 本地落一笔新账（不触发同步，由调用方 pushSoon） */
function insertRecordLocal(r: Omit<RecordItem, 'id'>): RecordItem {
  // v0.8.7 修正：基于全量列表（含回收站行）追加——只拿存活行回写会把本地回收站底单弄丢，
  // 导致同步时"已删的账"被当缺口从云端重新拉回复活
  const list = readAllRecordsSync()
  const id = nextLocalId()
  const record: RecordItem = { ...r, id, createdAt: r.createdAt || Number(id) }
  list.unshift(record)
  writeAllRecords(sortRecordsByTimeDesc(list))
  return record
}

export async function addRecord(r: Omit<RecordItem, 'id'>): Promise<string> {
  const record = insertRecordLocal(r)
  // v0.6.5 起不再单条直推云端，改交给同步引擎按"笔数配对"推送：
  // 否则双端同时记同一笔会在云端临时形成两条同键文档，引擎会误判成真有两笔而重复入账
  pushSoon()
  // v0.9.1 返回新记录 id：供记账页「撤销」定位刚记的这笔
  return record.id
}

// v0.6.6 软删除：删除 = 标记 + 同步（把"删除凭证"推上云，另一端同步后也跟着标删；本地数据留底可恢复）
export async function deleteRecord(id: string): Promise<void> {
  const list = readAllRecordsSync()
  const rec = list.find((r) => String(r.id) === String(id))
  if (!rec || rec.deleted) return
  rec.deleted = 1
  writeAllRecords(list)
  pushSoon()
}

// v0.6.8 回收站：读本地已删除记录（按日期倒序），供账单页「已删除」折叠区展示
export function getDeletedRecords(): RecordItem[] {
  return sortRecordsByTimeDesc(readAllRecordsSync().filter((r) => (r.deleted || 0) > 0))
}

// v0.6.8 从回收站恢复：deleted 归零 + reviveCount+1（作为"撤销凭条"配额，防旧删除凭证回灌），
// 再静默同步一次，恢复动作会跟到其它端（桌面回收站同步后也会跟着恢复）
export async function restoreRecord(id: string): Promise<void> {
  const list = readAllRecordsSync()
  const rec = list.find((r) => String(r.id) === String(id))
  if (!rec || !(rec.deleted || 0)) return
  rec.deleted = 0
  rec.reviveCount = (rec.reviveCount || 0) + 1
  writeAllRecords(sortRecordsByTimeDesc(list))
  pushSoon()
}

// 编辑 = 旧记录打删除凭证 + 新增一笔（两个动作都参与同步，金额/日期/备注/分类修改都能跨端生效）
export async function updateRecord(id: string, data: Partial<RecordItem>): Promise<void> {
  const list = readAllRecordsSync()
  const old = list.find((r) => String(r.id) === String(id))
  if (!old || old.deleted) return
  old.deleted = 1
  // 编辑产生的新行沿用旧行 createdAt（还是"那一笔"，排序位置不跳到最前）；老数据无此字段时退新行 id
  list.unshift({ ...old, ...data, id: nextLocalId(), createdAt: old.createdAt || Number(old.id) || 0, deleted: 0 } as RecordItem)
  writeAllRecords(sortRecordsByTimeDesc(list))
  pushSoon()
}

// ========== 统计 ==========

export async function getMonthTotal(month: string, type?: string): Promise<number> {
  const records = await getRecords()
  // v0.9.5 改走 sumAmounts（先转「分」取整再累加），消除 0.1+0.2 这类浮点累加误差；
  // 顺带跳过 NaN / Infinity 脏值，避免一个坏值把整月合计污染成科学计数法
  return sumAmounts(
    records.filter((r) => r.date.startsWith(month) && (!type || r.type === type)).map((r) => r.amount),
  )
}

/** v0.9.1 level='cat' 按一级分类汇总（默认）；level='sub' 按二级分类汇总 */
export async function getMonthStats(
  month: string,
  type?: string,
  level: 'cat' | 'sub' = 'cat',
): Promise<{ categoryKey: string; categoryName: string; total: number }[]> {
  const records = await getRecords()
  const map: Record<string, { categoryKey: string; categoryName: string; total: number }> = {}
  // v0.9.5 累加在「分」上做，最后一次性除回「元」，避免逐笔浮点累加漂移
  const cents: Record<string, number> = {}
  records
    .filter((r) => r.date.startsWith(month) && (!type || r.type === type))
    .forEach((r) => {
      const key = level === 'sub' ? r.subcategoryKey : r.categoryKey
      const name = level === 'sub' ? (r.subcategoryName || r.categoryName) : r.categoryName
      if (!key) return
      if (!map[key]) { map[key] = { categoryKey: key, categoryName: name, total: 0 }; cents[key] = 0 }
      if (typeof r.amount === 'number' && Number.isFinite(r.amount)) cents[key] += Math.round(r.amount * 100)
    })
  Object.keys(map).forEach((k) => { map[k].total = cents[k] / 100 })
  return Object.values(map).sort((a, b) => b.total - a.total)
}

export async function getDailyTrend(month: string, type?: string): Promise<{ date: string; total: number }[]> {
  const records = await getRecords()
  // v0.9.5 同上：按天在「分」上累加
  const cents: Record<string, number> = {}
  records
    .filter((r) => r.date.startsWith(month) && (!type || r.type === type))
    .forEach((r) => {
      if (typeof r.amount !== 'number' || !Number.isFinite(r.amount)) return
      cents[r.date] = (cents[r.date] || 0) + Math.round(r.amount * 100)
    })
  return Object.entries(cents).map(([date, c]) => ({ date, total: c / 100 })).sort((a, b) => a.date.localeCompare(b.date))
}

// ========== 分类数据 ==========

/** 一级分类及其二级小类（默认分类与自定义分类合并后的统一形态） */
export interface CategoryGroup {
  key: string
  name: string
  subs: { key: string; name: string }[]
}

export const DEFAULT_CATEGORIES: CategoryGroup[] = [
  { key: 'food', name: '餐饮饮食', subs: [
    { key: 'breakfast', name: '早餐' }, { key: 'lunch', name: '午餐' }, { key: 'dinner', name: '晚餐' },
    { key: 'snack', name: '零食饮料' }, { key: 'takeout', name: '外卖' }, { key: 'party', name: '聚餐聚会' },
  ]},
  { key: 'transport', name: '交通出行', subs: [
    { key: 'bus', name: '公交地铁' }, { key: 'taxi', name: '网约车' }, { key: 'fuel', name: '加油充电' },
    { key: 'parking', name: '停车费' }, { key: 'train', name: '火车高铁' }, { key: 'flight', name: '飞机' },
  ]},
  { key: 'shopping', name: '购物消费', subs: [
    { key: 'clothing', name: '服装鞋帽' }, { key: 'digital', name: '数码产品' }, { key: 'daily', name: '日用百货' },
    { key: 'beauty', name: '美妆护肤' }, { key: 'luxury', name: '奢侈品' },
  ]},
  { key: 'housing', name: '住房居家', subs: [
    { key: 'rent', name: '房租/房贷' }, { key: 'utility', name: '水电燃气' }, { key: 'property', name: '物业费' },
    { key: 'furniture', name: '家具家电' }, { key: 'repair', name: '维修保养' }, { key: 'household', name: '日用品' },
  ]},
  { key: 'entertainment', name: '娱乐休闲', subs: [
    { key: 'movie', name: '电影演出' }, { key: 'travel', name: '旅游度假' }, { key: 'fitness', name: '运动健身' },
    { key: 'game', name: '游戏充值' }, { key: 'bar', name: 'KTV酒吧' },
  ]},
  { key: 'medical', name: '医疗健康', subs: [
    { key: 'doctor', name: '看病就诊' }, { key: 'medicine', name: '药品购买' }, { key: 'checkup', name: '体检保健' },
  ]},
  { key: 'education', name: '教育学习', subs: [
    { key: 'course', name: '培训课程' }, { key: 'book', name: '书籍资料' }, { key: 'exam', name: '考试报名' }, { key: 'stationery', name: '文具用品' },
  ]},
  { key: 'social', name: '人情往来', subs: [
    { key: 'gift', name: '红包礼品' }, { key: 'treat', name: '请客吃饭' }, { key: 'wedding', name: '婚丧嫁娶' }, { key: 'donate', name: '捐款慈善' },
  ]},
  { key: 'finance', name: '金融保险', subs: [
    { key: 'insurance', name: '保险缴费' }, { key: 'invest', name: '投资理财' }, { key: 'loan', name: '贷款还款' }, { key: 'fee', name: '手续费' },
  ]},
  { key: 'pet', name: '宠物', subs: [
    { key: 'pet_food', name: '宠物食品' }, { key: 'pet_medical', name: '宠物医疗' }, { key: 'pet_supply', name: '宠物用品' },
    { key: 'pet_beauty', name: '美容洗护' }, { key: 'pet_boarding', name: '寄养服务' }, { key: 'pet_other', name: '其他宠物' },
  ]},
  { key: 'other', name: '其他杂项', subs: [
    { key: 'express', name: '快递邮寄' }, { key: 'misc', name: '其他' },
  ]},
]

export function getCategoryName(catKey: string): string {
  return DEFAULT_CATEGORIES.find((c) => c.key === catKey)?.name || catKey
}

export function getSubcategoryName(catKey: string, subKey: string): string {
  return DEFAULT_CATEGORIES.find((c) => c.key === catKey)?.subs.find((s) => s.key === subKey)?.name || subKey
}

// ========== 自定义分类（云端+本地混合）==========

type CustomCat = { categoryKey: string; categoryName: string; subcategoryKey: string; subcategoryName: string }

function readCustomCatsSync(): CustomCat[] {
  const raw = Taro.getStorageSync('custom_categories')
  return raw ? JSON.parse(raw) : []
}

function saveLocalCustomCats(list: CustomCat[]): void {
  Taro.setStorageSync('custom_categories', JSON.stringify(list))
}

function mergedCategoriesSync(): CategoryGroup[] {
  const merged = DEFAULT_CATEGORIES.map((c) => ({ ...c, subs: [...c.subs] }))
  for (const cc of readCustomCatsSync()) {
    let group = merged.find((m) => m.key === cc.categoryKey)
    if (!group) { group = { key: cc.categoryKey, name: cc.categoryName, subs: [] }; merged.push(group) }
    if (!group.subs.find((s) => s.key === cc.subcategoryKey)) {
      group.subs.push({ key: cc.subcategoryKey, name: cc.subcategoryName })
    }
  }
  return merged
}

export async function getMergedCategories(): Promise<CategoryGroup[]> {
  return mergedCategoriesSync()
}

export async function addCustomCategory(catKey: string, catName: string, subKey: string, subName: string): Promise<void> {
  const list = readCustomCatsSync()
  list.push({ categoryKey: catKey, categoryName: catName, subcategoryKey: subKey, subcategoryName: subName })
  saveLocalCustomCats(list)
}

export async function deleteCustomCategory(subKey: string): Promise<void> {
  saveLocalCustomCats(readCustomCatsSync().filter((c) => c.subcategoryKey !== subKey))
}

export async function isCustomCategory(subKey: string): Promise<boolean> {
  return readCustomCatsSync().some((c) => c.subcategoryKey === subKey)
}

type CatNamed = { categoryKey?: string; categoryName?: string; subcategoryKey?: string; subcategoryName?: string }

/** v0.9.6 桌面端推来的待办/周期账单快照只带分类 key、名字为空：落地时按分类表补全，
 *  否则列表显示空名、自动记出来的账在统计页也是空名 */
function fillCatNames<T extends CatNamed>(it: T, cats: CategoryGroup[]): T {
  if (!it.categoryKey || (it.categoryName && it.subcategoryName)) return it
  const c = cats.find((x) => x.key === it.categoryKey)
  const s = c?.subs.find((x) => x.key === it.subcategoryKey)
  return {
    ...it,
    categoryName: it.categoryName || c?.name || it.categoryKey,
    subcategoryName: it.subcategoryName || s?.name || it.subcategoryKey || '',
  }
}

// ========== 预算（本地存储）==========

export async function getBudget(): Promise<number> {
  const b = Taro.getStorageSync('budget')
  return b ? Number(b) : 0
}

export async function setBudget(val: number): Promise<void> {
  if (val === 0) { Taro.removeStorageSync('budget'); return }
  Taro.setStorageSync('budget', String(val))
}

// ========== 周期账单 ==========

export interface RecurringBill {
  id: string
  type: 'expense' | 'income'
  amount: number
  categoryKey: string
  categoryName: string
  subcategoryKey: string
  subcategoryName: string
  note: string
  cycle: 'daily' | 'weekly' | 'monthly' | 'yearly'
  nextDate: string
  isActive: boolean
  lastExecutedFor?: string  // v0.7.7 执行回执：已为哪个到期日自动记过账（跨端防双记）
  updatedAt?: number   // v0.7.3 云同步 LWW 依据：每次改动刷新
  deleted?: boolean    // v0.7.3 软删：防云端旧快照倒灌复活，页面自动过滤
}

/** 页面展示用：过滤已软删项 */
export async function getRecurringBills(): Promise<RecurringBill[]> {
  return readRecurringBillsSync().filter((b) => !b.deleted)
}

function readRecurringBillsSync(): RecurringBill[] {
  const raw = Taro.getStorageSync('recurring_bills')
  return raw ? JSON.parse(raw) : []
}

/** 同步引擎用：含软删项的全部底数 */
async function getAllRecurringBills(): Promise<RecurringBill[]> {
  return readRecurringBillsSync()
}

function saveRecurringBills(list: RecurringBill[]): void {
  Taro.setStorageSync('recurring_bills', JSON.stringify(list))
}

/** 应用云端周期账单快照：按 id 新增/覆盖（含 deleted 标记） */
async function applyCloudRecurringBills(items: Array<Record<string, any>>): Promise<number> {
  const cats = mergedCategoriesSync()
  const list = readRecurringBillsSync()
  let changed = 0
  for (const it of items) {
    const bill = fillCatNames(it as RecurringBill, cats)
    const i = list.findIndex((b) => b.id === it.id)
    if (i >= 0) list[i] = bill
    else list.push(bill)
    changed++
  }
  if (changed > 0) saveRecurringBills(list)
  return changed
}

export async function addRecurringBill(bill: Omit<RecurringBill, 'id'>): Promise<void> {
  const list = readRecurringBillsSync()
  list.push({ ...bill, id: Date.now().toString(), updatedAt: Date.now() })
  saveRecurringBills(list)
  pushSoon()
}

/** v0.7.3 删除改软删（同步靠 deleted:true 快照传播，其它端跟删） */
export async function deleteRecurringBill(id: string): Promise<void> {
  saveRecurringBills(readRecurringBillsSync().map((b) => (b.id === id ? { ...b, deleted: true, updatedAt: Date.now() } : b)))
  pushSoon()
}

export async function toggleRecurringBill(id: string, active: boolean): Promise<void> {
  saveRecurringBills(readRecurringBillsSync().map((b) => (b.id === id ? { ...b, isActive: active, updatedAt: Date.now() } : b)))
  pushSoon()
}

function recordFromBill(bill: RecurringBill, note: string, date: string): Omit<RecordItem, 'id'> {
  const b = fillCatNames(bill, mergedCategoriesSync())
  return {
    type: b.type, amount: b.amount,
    categoryKey: b.categoryKey, categoryName: b.categoryName,
    subcategoryKey: b.subcategoryKey, subcategoryName: b.subcategoryName,
    note, date,
  }
}

/** 执行周期账单：创建一笔记录，并自动更新下次日期（v0.7.7 写执行回执，防双端自动再记同一期）
 *  v0.9.6 账单与回执在同一拍落盘、同一趟同步上云：旧版先记账并同步、回执晚一步才写，
 *  另一端恰好在中间同步会看不到回执，把同一期再自动记一遍 */
export async function executeRecurringBill(id: string): Promise<void> {
  const bills = readRecurringBillsSync() // 全量底数（含软删），否则回写会把软删项冲掉
  const bill = bills.find((b) => b.id === id)
  if (!bill || bill.deleted || !bill.isActive) return
  insertRecordLocal(recordFromBill(bill, bill.note, localDateStr()))
  bill.lastExecutedFor = bill.nextDate
  bill.nextDate = advanceDate(bill.nextDate, bill.cycle)
  bill.updatedAt = Date.now()
  saveRecurringBills(bills)
  pushSoon()
}

/** 把日期快进到今天之后的第一个周期日（未知周期不推进时立即停，防死循环） */
function fastForwardPast(date: string, cycle: string, today: string): string {
  let next = advanceDate(date, cycle)
  let guard = 0
  while (next <= today && guard++ < 2000) {
    const prev = next
    next = advanceDate(next, cycle)
    if (next === prev) break
  }
  return next
}

/** v0.6.9 周期账单自动执行（与桌面端 checkRecurringBills 对齐，纯手机用户到期不再漏记）：
 * 进首页时检查到期账单 → 自动记一笔（日期=今天，备注 [周期]）→ 下次日期快进到今天之后；
 * 隔几个月没打开也只补记 1 笔不重复记历史；未知周期防死循环护栏；
 * v0.7.7 执行回执 lastExecutedFor：同一到期期只记一次，防电脑/手机双端各自自动记成两笔 */
export async function checkAndExecuteDueBills(): Promise<{ name: string; amount: number }[]> {
  const bills = readRecurringBillsSync() // 全量底数（含软删），否则回写会把软删项冲掉
  const today = localDateStr()
  const executed: { name: string; amount: number }[] = []
  let changed = false
  for (const bill of bills) {
    if (bill.deleted || !bill.isActive || bill.nextDate > today) continue
    changed = true
    if (bill.lastExecutedFor === bill.nextDate) {
      // 本期已被另一端执行并同步回来：只快进日期，不重复记账
      bill.nextDate = fastForwardPast(bill.nextDate, bill.cycle, today)
      bill.updatedAt = Date.now()
      continue
    }
    const rec = insertRecordLocal(recordFromBill(bill, `[周期] ${bill.note || ''}`, today))
    bill.lastExecutedFor = bill.nextDate // 回执：本期已记
    bill.nextDate = fastForwardPast(bill.nextDate, bill.cycle, today)
    bill.updatedAt = Date.now()
    executed.push({ name: rec.subcategoryName || rec.categoryName, amount: bill.amount })
  }
  if (changed) {
    saveRecurringBills(bills)
    pushSoon()
  }
  return executed
}

// ========== 待办事项 ==========

export interface Todo {
  id: string
  title: string
  cycle: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'once'
  nextDate: string
  time?: string          // HH:mm，可选的具体时间
  isActive: boolean
  // 可选关联记账
  amount?: number
  categoryKey?: string
  categoryName?: string
  subcategoryKey?: string
  subcategoryName?: string
  note?: string
  completedDates: string[]
  createdAt: string
  updatedAt?: number   // v0.7.3 云同步 LWW 依据
  deleted?: boolean    // v0.7.3 软删：防云端旧快照倒灌复活
}

/** 页面展示用：过滤已软删项 */
export async function getTodos(): Promise<Todo[]> {
  return readTodosSync().filter((t) => !t.deleted)
}

function readTodosSync(): Todo[] {
  const raw = Taro.getStorageSync('todos')
  return raw ? JSON.parse(raw) : []
}

/** 同步引擎用：含软删项的全部底数 */
async function getAllTodos(): Promise<Todo[]> {
  return readTodosSync()
}

function saveTodos(list: Todo[]): void {
  Taro.setStorageSync('todos', JSON.stringify(list))
}

/** 应用云端待办快照：按 id 新增/覆盖（含 deleted 标记） */
async function applyCloudTodos(items: Array<Record<string, any>>): Promise<number> {
  const cats = mergedCategoriesSync()
  const list = readTodosSync()
  let changed = 0
  for (const it of items) {
    const todo = fillCatNames({ ...it, completedDates: it.completedDates || [] } as Todo, cats)
    const i = list.findIndex((t) => t.id === it.id)
    if (i >= 0) list[i] = todo
    else list.push(todo)
    changed++
  }
  if (changed > 0) saveTodos(list)
  return changed
}

/** v0.7.2 方案B App 内强提醒：统计今天到期/已逾期未完成的待办数（周期账单已自动补记，无需提醒） */
export async function getDueSummary(): Promise<{ due: number; overdue: number }> {
  const todos = await getTodos()
  const today = localDateStr()
  let due = 0
  let overdue = 0
  for (const t of todos) {
    if (!t.isActive || t.completedDates.includes(today)) continue
    if (t.nextDate === today) due++
    else if (t.nextDate < today) overdue++
  }
  return { due, overdue }
}

export async function addTodo(todo: Omit<Todo, 'id' | 'completedDates' | 'createdAt'>): Promise<void> {
  const list = readTodosSync()
  list.unshift({
    ...todo,
    id: Date.now().toString(),
    completedDates: [],
    createdAt: localDateStr(),
    updatedAt: Date.now(),
  })
  saveTodos(list)
  pushSoon()
}

/** v0.7.3 删除改软删（同步靠 deleted:true 快照传播，其它端跟删） */
export async function deleteTodo(id: string): Promise<void> {
  saveTodos(readTodosSync().map((t) => (t.id === id ? { ...t, deleted: true, updatedAt: Date.now() } : t)))
  pushSoon()
}

export async function toggleTodo(id: string, active: boolean): Promise<void> {
  saveTodos(readTodosSync().map((t) => (t.id === id ? { ...t, isActive: active, updatedAt: Date.now() } : t)))
  pushSoon()
}

/** 完成待办：记录完成日期，自动推算下一周期，有关联金额则自动记账 */
export async function completeTodo(id: string): Promise<void> {
  const list = readTodosSync()
  const todo = list.find((t) => t.id === id)
  if (!todo || todo.deleted) return

  const today = localDateStr()
  if (todo.completedDates.includes(today)) return // 防重复：今天已完成过则忽略（与桌面端对齐，防界面误判后重复记账）
  todo.completedDates.push(today)

  // 有关联金额 → 自动创建记账记录
  if (todo.amount && todo.amount > 0 && todo.categoryKey && todo.subcategoryKey) {
    const t = fillCatNames(todo, mergedCategoriesSync())
    insertRecordLocal({
      type: 'expense',
      amount: todo.amount,
      categoryKey: todo.categoryKey,
      categoryName: t.categoryName || '',
      subcategoryKey: todo.subcategoryKey,
      subcategoryName: t.subcategoryName || '',
      note: `[待办] ${todo.title}${todo.note ? ' · ' + todo.note : ''}`,
      date: today,
    })
  }

  // 推算下一周期或停用（与桌面端一致：每完成一次只向后推一个周期）
  if (todo.cycle === 'once') todo.isActive = false
  else todo.nextDate = advanceDate(todo.nextDate, todo.cycle)

  todo.updatedAt = Date.now()
  saveTodos(list)
  pushSoon()
}
