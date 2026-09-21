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
  deleted?: number      // v0.6.6 软删除：1 = 已删（页面不显示，数据留底可恢复）；undefined/0 = 正常
}

// ========== 云同步（本地为主 + 云端双向增量同步） ==========

/**
 * 执行一次双向同步：本地新记录上传云端，云端（桌面端等其他设备）新记录/删除凭证拉回本地。
 * 只同步同一个“同步码”（ownerId）的文档 — 多用户隔离的关键。
 * 未配置 CLOUD_ENV_ID 时走「本地模拟云」，逻辑完全一致，接真云零改动。
 * v0.6.6：删除/编辑通过"删除凭证 + 新增"参与同步（软删除，集合权限不变、无需云函数）。
 */
export async function syncNow(): Promise<SyncResult> {
  return runSync({
    cloud: getCloudCollection(),
    source: 'miniapp',
    ownerId: getOwnerId(),
    getLocal: getAllRecords,
    addLocal: mergeLocalRecords,
    markLocal: markLocalDeleted,
    store: taroStore,
  })
}

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
}

export async function getRecurringBills(): Promise<RecurringBill[]> {
  const raw = Taro.getStorageSync('recurring_bills')
  return raw ? JSON.parse(raw) : []
}

function saveRecurringBills(list: RecurringBill[]): void {
  Taro.setStorageSync('recurring_bills', JSON.stringify(list))
}

export async function addRecurringBill(bill: Omit<RecurringBill, 'id'>): Promise<void> {
  const list = await getRecurringBills()
  list.push({ ...bill, id: Date.now().toString() })
  saveRecurringBills(list)
}

export async function deleteRecurringBill(id: string): Promise<void> {
  saveRecurringBills((await getRecurringBills()).filter((b) => b.id !== id))
}

export async function toggleRecurringBill(id: string, active: boolean): Promise<void> {
  saveRecurringBills((await getRecurringBills()).map((b) => (b.id === id ? { ...b, isActive: active } : b)))
}

/** 执行周期账单：创建一笔记录，并自动更新下次日期 */
export async function executeRecurringBill(id: string): Promise<void> {
  const bills = await getRecurringBills()
  const bill = bills.find((b) => b.id === id)
  if (!bill || !bill.isActive) return

  // 1. 创建记账记录
  await addRecord({
    type: bill.type,
    amount: bill.amount,
    categoryKey: bill.categoryKey,
    categoryName: bill.categoryName,
    subcategoryKey: bill.subcategoryKey,
    subcategoryName: bill.subcategoryName,
    note: bill.note,
    date: new Date().toISOString().slice(0, 10),
  })

  // 2. 计算下一个日期
  const next = new Date(bill.nextDate)
  switch (bill.cycle) {
    case 'daily': next.setDate(next.getDate() + 1); break
    case 'weekly': next.setDate(next.getDate() + 7); break
    case 'monthly': next.setMonth(next.getMonth() + 1); break
    case 'yearly': next.setFullYear(next.getFullYear() + 1); break
  }
  bill.nextDate = next.toISOString().slice(0, 10)

  saveRecurringBills(bills)
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
}

export async function getTodos(): Promise<Todo[]> {
  const raw = Taro.getStorageSync('todos')
  return raw ? JSON.parse(raw) : []
}

function saveTodos(list: Todo[]): void {
  Taro.setStorageSync('todos', JSON.stringify(list))
}

export async function addTodo(todo: Omit<Todo, 'id' | 'completedDates' | 'createdAt'>): Promise<void> {
  const list = await getTodos()
  list.unshift({
    ...todo,
    id: Date.now().toString(),
    completedDates: [],
    createdAt: new Date().toISOString().slice(0, 10),
  })
  saveTodos(list)
}

export async function deleteTodo(id: string): Promise<void> {
  saveTodos((await getTodos()).filter((t) => t.id !== id))
}

export async function toggleTodo(id: string, active: boolean): Promise<void> {
  saveTodos((await getTodos()).map((t) => (t.id === id ? { ...t, isActive: active } : t)))
}

/** 完成待办：记录完成日期，自动推算下一周期，有关联金额则自动记账 */
export async function completeTodo(id: string): Promise<void> {
  const list = await getTodos()
  const todo = list.find((t) => t.id === id)
  if (!todo) return

  const today = new Date().toISOString().slice(0, 10)
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
    todo.nextDate = next.toISOString().slice(0, 10)
  }

  saveTodos(list)
}
