import Taro from '@tarojs/taro'
import { getCloudCollection, getOwnerId, taroStore } from './cloud'
import { runSync, recordKey, parseRecordKey, SyncableRecord, SyncResult } from './cloudCore'

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
  photo?: string        // v0.8.1 拍照凭证：本机持久文件路径（仅存手机，不上云）
  deleted?: number      // v0.6.6 软删除：1 = 已删（页面不显示，数据留底可恢复）；undefined/0 = 正常
  reviveCount?: number  // v0.6.7 被恢复过的次数（同步用：历史删除凭证配额 = 已删 + 恢复次数）
}

/** 本地时区的 YYYY-MM-DD（v0.6.8 修 iOS/安卓通用时区 bug：
 * toISOString 是 UTC 日期，中国每天 0~8 点会算成"昨天"，导致记账/周期推算日期错位） */
export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ========== 云同步（本地为主 + 云端双向增量同步） ==========

/**
 * 执行一次双向同步：本地新记录上传云端，云端（桌面端等其他设备）新记录/删除凭证拉回本地。
 * 只同步同一个“同步码”（ownerId）的文档 — 多用户隔离的关键。
 * 未配置云环境 ID 时走「本地模拟云」，逻辑完全一致，接真云零改动。
 * v0.6.6：删除/编辑通过"删除凭证 + 新增"参与同步（软删除，集合权限不变、无需云函数）。
 */
export async function syncNow(): Promise<SyncResult> {
  // v0.8.3 并发锁：冷启动时 app.tsx + 首页 show + 周期检查会几乎同时触发多路同步，
  // 并发跑会互相"看不见"对方在传的数据导致同一笔重复上传，这里合并为同一趟
  if (syncInFlight) return syncInFlight
  syncInFlight = runSync({
    cloud: getCloudCollection(),
    source: 'miniapp',
    ownerId: getOwnerId(),
    getLocal: getAllRecords,
    addLocal: mergeLocalRecords,
    markLocal: markLocalDeleted,
    markAlive: markLocalAlive,
    store: taroStore,
    // v0.7.3 待办/周期账单参与云同步（LWW 快照，与账单链路互不干扰）
    todos: { getLocal: getAllTodos, apply: applyCloudTodos },
    recurring: { getLocal: getAllRecurringBills, apply: applyCloudRecurringBills },
  }).finally(() => { syncInFlight = null })
  return syncInFlight
}
let syncInFlight: Promise<SyncResult> | null = null

/** 把云端记录写入本地（笔数配对由引擎算好，这里只防同一条云端记录重复入账），返回实际新增条数 */
async function mergeLocalRecords(records: SyncableRecord[]): Promise<number> {
  const list = await getAllRecords()
  const seenIds = new Set(list.map((r) => String(r.id)))
  let added = 0
  for (const r of records) {
    if (r.id && seenIds.has(String(r.id))) continue // 同一条云端记录不重复导入
    list.push({ ...r, id: r.id || `c_${Date.now()}_${added}` } as RecordItem)
    if (r.id) seenIds.add(String(r.id))
    added++
  }
  if (added > 0) {
    list.sort((a, b) => b.date.localeCompare(a.date))
    saveLocalRecords(list)
  }
  return added
}

/** 按去重键把 count 笔本地存活记录标删（引擎拉到云端删除凭证时调用） */
async function markLocalDeleted(key: string, count: number): Promise<number> {
  const parts = parseRecordKey(key)
  if (!parts) return 0
  const list = await getAllRecords()
  let marked = 0
  for (const r of list) {
    if (marked >= count) break
    if (!r.deleted && recordKey(r) === key) {
      r.deleted = 1
      marked++
    }
  }
  if (marked > 0) saveLocalRecords(list)
  return marked
}

/** v0.6.7 按去重键把 count 笔本地已删记录复活（引擎拉到云端撤销凭条时调用；reviveCount+1 防凭证回灌） */
async function markLocalAlive(key: string, count: number): Promise<number> {
  const parts = parseRecordKey(key)
  if (!parts) return 0
  const list = await getAllRecords()
  let revived = 0
  for (const r of list) {
    if (revived >= count) break
    if (r.deleted && recordKey(r) === key) {
      r.deleted = 0
      r.reviveCount = (r.reviveCount || 0) + 1
      revived++
    }
  }
  if (revived > 0) saveLocalRecords(list)
  return revived
}

// ========== 记录 CRUD ==========

export async function getRecords(): Promise<RecordItem[]> {
  // 页面展示用：只返回未删除的记录（软删除对全页面自动生效）
  return (await getAllRecords()).filter((r) => !(r.deleted || 0))
}

/** 引擎内部用：返回全部行（含已标记删除的，笔数配对需要完整底数） */
async function getAllRecords(): Promise<RecordItem[]> {
  // 本地存储是读取的唯一来源（快、可离线），云端由 syncNow 增量合入
  const raw = Taro.getStorageSync('daily_records')
  return raw ? JSON.parse(raw) : []
}

function saveLocalRecords(list: RecordItem[]): void {
  Taro.setStorageSync('daily_records', JSON.stringify(list))
}

export async function addRecord(r: Omit<RecordItem, 'id'>): Promise<void> {
  const list = await getRecords()
  const record: RecordItem = { ...r, id: Date.now().toString() }
  list.unshift(record)
  saveLocalRecords(list)
  // v0.6.5 起不再单条直推云端，改交给同步引擎按"笔数配对"推送：
  // 否则双端同时记同一笔会在云端临时形成两条同键文档，引擎会误判成真有两笔而重复入账
  try {
    await syncNow()
  } catch { /* 失败不阻塞，下次进页的 syncNow 会兜底补传 */ }
}

// v0.6.6 软删除：删除 = 标记 + 同步（把"删除凭证"推上云，另一端同步后也跟着标删；本地数据留底可恢复）
export async function deleteRecord(id: string): Promise<void> {
  const list = await getAllRecords()
  const rec = list.find((r) => String(r.id) === String(id))
  if (!rec || rec.deleted) return
  rec.deleted = 1
  saveLocalRecords(list)
  try {
    await syncNow() // 把删除凭证同步上云（失败不阻塞，下次同步会补传）
  } catch { /* ignore */ }
}

// v0.6.8 回收站：读本地已删除记录（按日期倒序），供账单页「已删除」折叠区展示
export function getDeletedRecords(): RecordItem[] {
  return readDeletedSync().sort((a, b) => b.date.localeCompare(a.date))
}

function readDeletedSync(): RecordItem[] {
  const raw = Taro.getStorageSync('daily_records')
  const list: RecordItem[] = raw ? JSON.parse(raw) : []
  return list.filter((r) => (r.deleted || 0) > 0)
}

// v0.6.8 从回收站恢复：deleted 归零 + reviveCount+1（作为"撤销凭条"配额，防旧删除凭证回灌），
// 再静默同步一次，恢复动作会跟到其它端（桌面回收站同步后也会跟着恢复）
export async function restoreRecord(id: string): Promise<void> {
  const list = await getAllRecords()
  const rec = list.find((r) => String(r.id) === String(id))
  if (!rec || !(rec.deleted || 0)) return
  rec.deleted = 0
  rec.reviveCount = (rec.reviveCount || 0) + 1
  list.sort((a, b) => b.date.localeCompare(a.date))
  saveLocalRecords(list)
  try {
    await syncNow() // 把撤销凭条同步上云（失败不阻塞，下次同步会补传）
  } catch { /* ignore */ }
}

// 编辑 = 旧记录打删除凭证 + 新增一笔（两个动作都参与同步，金额/日期/备注/分类修改都能跨端生效）
export async function updateRecord(id: string, data: Partial<RecordItem>): Promise<void> {
  const list = await getAllRecords()
  const old = list.find((r) => String(r.id) === String(id))
  if (!old || old.deleted) return
  old.deleted = 1
  list.unshift({ ...old, ...data, id: `${Date.now()}`, deleted: 0 } as RecordItem)
  list.sort((a, b) => b.date.localeCompare(a.date))
  saveLocalRecords(list)
  try {
    await syncNow()
  } catch { /* ignore */ }
}

// ========== 统计 ==========

export async function getMonthTotal(month: string, type?: string): Promise<number> {
  const records = await getRecords()
  return records
    .filter((r) => r.date.startsWith(month) && (!type || r.type === type))
    .reduce((s, r) => s + r.amount, 0)
}

export async function getMonthStats(month: string, type?: string): Promise<{ categoryKey: string; categoryName: string; total: number }[]> {
  const records = await getRecords()
  const map: Record<string, { categoryKey: string; categoryName: string; total: number }> = {}
  records
    .filter((r) => r.date.startsWith(month) && (!type || r.type === type))
    .forEach((r) => {
      if (!map[r.categoryKey]) map[r.categoryKey] = { categoryKey: r.categoryKey, categoryName: r.categoryName, total: 0 }
      map[r.categoryKey].total += r.amount
    })
  return Object.values(map).sort((a, b) => b.total - a.total)
}

export async function getDailyTrend(month: string, type?: string): Promise<{ date: string; total: number }[]> {
  const records = await getRecords()
  const map: Record<string, number> = {}
  records
    .filter((r) => r.date.startsWith(month) && (!type || r.type === type))
    .forEach((r) => { map[r.date] = (map[r.date] || 0) + r.amount })
  return Object.entries(map).map(([date, total]) => ({ date, total })).sort((a, b) => a.date.localeCompare(b.date))
}

// ========== 分类数据 ==========

export const DEFAULT_CATEGORIES = [
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
  { key: 'other', name: '其他杂项', subs: [
    { key: 'express', name: '快递邮寄' }, { key: 'pet', name: '宠物开销' }, { key: 'misc', name: '其他' },
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

async function getCustomCategories(): Promise<CustomCat[]> {
  const raw = Taro.getStorageSync('custom_categories')
  return raw ? JSON.parse(raw) : []
}

function saveLocalCustomCats(list: CustomCat[]): void {
  Taro.setStorageSync('custom_categories', JSON.stringify(list))
}

export async function getMergedCategories(): Promise<typeof DEFAULT_CATEGORIES> {
  const customs = await getCustomCategories()
  const merged = DEFAULT_CATEGORIES.map((c) => ({ ...c, subs: [...c.subs] }))
  for (const cc of customs) {
    let group = merged.find((m) => m.key === cc.categoryKey)
    if (!group) { group = { key: cc.categoryKey, name: cc.categoryName, subs: [] }; merged.push(group) }
    if (!group.subs.find((s) => s.key === cc.subcategoryKey)) {
      group.subs.push({ key: cc.subcategoryKey, name: cc.subcategoryName })
    }
  }
  return merged
}

export async function addCustomCategory(catKey: string, catName: string, subKey: string, subName: string): Promise<void> {
  const list = await getCustomCategories()
  list.push({ categoryKey: catKey, categoryName: catName, subcategoryKey: subKey, subcategoryName: subName })
  saveLocalCustomCats(list)
}

export async function deleteCustomCategory(subKey: string): Promise<void> {
  saveLocalCustomCats((await getCustomCategories()).filter((c) => c.subcategoryKey !== subKey))
}

export async function isCustomCategory(subKey: string): Promise<boolean> {
  return (await getCustomCategories()).some((c) => c.subcategoryKey === subKey)
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
  return (await getAllRecurringBills()).filter((b) => !b.deleted)
}

/** 同步引擎用：含软删项的全部底数 */
async function getAllRecurringBills(): Promise<RecurringBill[]> {
  const raw = Taro.getStorageSync('recurring_bills')
  return raw ? JSON.parse(raw) : []
}

function saveRecurringBills(list: RecurringBill[]): void {
  Taro.setStorageSync('recurring_bills', JSON.stringify(list))
}

/** 应用云端周期账单快照：按 id 新增/覆盖（含 deleted 标记） */
async function applyCloudRecurringBills(items: Array<Record<string, any>>): Promise<number> {
  const list = await getAllRecurringBills()
  let changed = 0
  for (const it of items) {
    const i = list.findIndex((b) => b.id === it.id)
    if (i >= 0) list[i] = it as RecurringBill
    else list.push(it as RecurringBill)
    changed++
  }
  if (changed > 0) saveRecurringBills(list)
  return changed
}

export async function addRecurringBill(bill: Omit<RecurringBill, 'id'>): Promise<void> {
  const list = await getAllRecurringBills()
  list.push({ ...bill, id: Date.now().toString(), updatedAt: Date.now() })
  saveRecurringBills(list)
}

/** v0.7.3 删除改软删（同步靠 deleted:true 快照传播，其它端跟删） */
export async function deleteRecurringBill(id: string): Promise<void> {
  saveRecurringBills((await getAllRecurringBills()).map((b) => (b.id === id ? { ...b, deleted: true, updatedAt: Date.now() } : b)))
}

export async function toggleRecurringBill(id: string, active: boolean): Promise<void> {
  saveRecurringBills((await getAllRecurringBills()).map((b) => (b.id === id ? { ...b, isActive: active, updatedAt: Date.now() } : b)))
}

/** 向后推一个周期（纯日期计算，手动/自动执行共用；v0.6.9 提取自 executeRecurringBill） */
function advanceDate(current: string, cycle: RecurringBill['cycle']): string {
  const next = new Date(current)
  switch (cycle) {
    case 'daily': next.setDate(next.getDate() + 1); break
    case 'weekly': next.setDate(next.getDate() + 7); break
    case 'monthly': next.setMonth(next.getMonth() + 1); break
    case 'yearly': next.setFullYear(next.getFullYear() + 1); break
  }
  return localDateStr(next)
}

/** 执行周期账单：创建一笔记录，并自动更新下次日期（v0.7.7 写执行回执，防双端自动再记同一期） */
export async function executeRecurringBill(id: string): Promise<void> {
  const bills = await getAllRecurringBills() // 全量底数（含软删），否则回写会把软删项冲掉
  const bill = bills.find((b) => b.id === id)
  if (!bill || bill.deleted || !bill.isActive) return

  // 1. 创建记账记录
  await addRecord({
    type: bill.type,
    amount: bill.amount,
    categoryKey: bill.categoryKey,
    categoryName: bill.categoryName,
    subcategoryKey: bill.subcategoryKey,
    subcategoryName: bill.subcategoryName,
    note: bill.note,
    date: localDateStr(),
  })

  // 2. 推算下一个周期 + 盖回执（本期已记，自动执行不再重复）
  bill.lastExecutedFor = bill.nextDate
  bill.nextDate = advanceDate(bill.nextDate, bill.cycle)
  bill.updatedAt = Date.now()

  saveRecurringBills(bills)
}

/** v0.6.9 周期账单自动执行（与桌面端 checkRecurringBills 对齐，纯手机用户到期不再漏记）：
 * 进首页时检查到期账单 → 自动记一笔（日期=今天，备注 [周期]）→ 下次日期快进到今天之后；
 * 隔几个月没打开也只补记 1 笔不重复记历史；未知周期防死循环护栏；
 * v0.7.7 执行回执 lastExecutedFor：同一到期期只记一次，防电脑/手机双端各自自动记成两笔 */
export async function checkAndExecuteDueBills(): Promise<{ name: string; amount: number }[]> {
  const bills = await getAllRecurringBills() // 全量底数（含软删），否则回写会把软删项冲掉
  const today = localDateStr()
  const executed: { name: string; amount: number }[] = []
  let changed = false
  for (const bill of bills) {
    if (bill.deleted || !bill.isActive || bill.nextDate > today) continue
    if (bill.lastExecutedFor === bill.nextDate) {
      // 本期已被另一端执行并同步回来：只快进日期，不重复记账
      let skip = advanceDate(bill.nextDate, bill.cycle)
      let g = 0
      while (skip <= today && g++ < 2000) {
        const prev = skip
        skip = advanceDate(skip, bill.cycle)
        if (skip === prev) break
      }
      bill.nextDate = skip
      bill.updatedAt = Date.now()
      changed = true
      continue
    }
    await addRecord({
      type: bill.type, amount: bill.amount,
      categoryKey: bill.categoryKey, categoryName: bill.categoryName,
      subcategoryKey: bill.subcategoryKey, subcategoryName: bill.subcategoryName,
      note: `[周期] ${bill.note || ''}`, date: today,
    })
    let next = advanceDate(bill.nextDate, bill.cycle)
    let guard = 0
    while (next <= today && guard++ < 2000) {
      const prev = next
      next = advanceDate(next, bill.cycle)
      if (next === prev) break // 防死循环
    }
    bill.lastExecutedFor = bill.nextDate // 回执：本期已记
    bill.nextDate = next
    bill.updatedAt = Date.now()
    changed = true
    executed.push({ name: bill.subcategoryName || bill.categoryName, amount: bill.amount })
  }
  if (changed) saveRecurringBills(bills)
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
  return (await getAllTodos()).filter((t) => !t.deleted)
}

/** 同步引擎用：含软删项的全部底数 */
async function getAllTodos(): Promise<Todo[]> {
  const raw = Taro.getStorageSync('todos')
  return raw ? JSON.parse(raw) : []
}

function saveTodos(list: Todo[]): void {
  Taro.setStorageSync('todos', JSON.stringify(list))
}

/** 应用云端待办快照：按 id 新增/覆盖（含 deleted 标记） */
async function applyCloudTodos(items: Array<Record<string, any>>): Promise<number> {
  const list = await getAllTodos()
  let changed = 0
  for (const it of items) {
    const i = list.findIndex((t) => t.id === it.id)
    if (i >= 0) list[i] = it as Todo
    else list.push(it as Todo)
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
  const list = await getAllTodos()
  list.unshift({
    ...todo,
    id: Date.now().toString(),
    completedDates: [],
    createdAt: localDateStr(),
    updatedAt: Date.now(),
  })
  saveTodos(list)
}

/** v0.7.3 删除改软删（同步靠 deleted:true 快照传播，其它端跟删） */
export async function deleteTodo(id: string): Promise<void> {
  saveTodos((await getAllTodos()).map((t) => (t.id === id ? { ...t, deleted: true, updatedAt: Date.now() } : t)))
}

export async function toggleTodo(id: string, active: boolean): Promise<void> {
  saveTodos((await getAllTodos()).map((t) => (t.id === id ? { ...t, isActive: active, updatedAt: Date.now() } : t)))
}

/** 完成待办：记录完成日期，自动推算下一周期，有关联金额则自动记账 */
export async function completeTodo(id: string): Promise<void> {
  const list = await getAllTodos()
  const todo = list.find((t) => t.id === id)
  if (!todo || todo.deleted) return

  const today = localDateStr()
  if (todo.completedDates.includes(today)) return // 防重复：今天已完成过则忽略（与桌面端对齐，防界面误判后重复记账）
  todo.completedDates.push(today)

  // 有关联金额 → 自动创建记账记录
  if (todo.amount && todo.amount > 0 && todo.categoryKey && todo.subcategoryKey) {
    await addRecord({
      type: 'expense',
      amount: todo.amount,
      categoryKey: todo.categoryKey,
      categoryName: todo.categoryName || '',
      subcategoryKey: todo.subcategoryKey,
      subcategoryName: todo.subcategoryName || '',
      note: `[待办] ${todo.title}${todo.note ? ' · ' + todo.note : ''}`,
      date: today,
    })
  }

  // 推算下一周期或停用
  if (todo.cycle === 'once') {
    todo.isActive = false
  } else {
    const next = new Date(todo.nextDate)
    switch (todo.cycle) {
      case 'daily': next.setDate(next.getDate() + 1); break
      case 'weekly': next.setDate(next.getDate() + 7); break
      case 'monthly': next.setMonth(next.getMonth() + 1); break
      case 'yearly': next.setFullYear(next.getFullYear() + 1); break
    }
    todo.nextDate = localDateStr(next)
  }

  todo.updatedAt = Date.now()
  saveTodos(list)
}
