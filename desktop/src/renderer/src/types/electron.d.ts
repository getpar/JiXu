/** v0.7.3 待办/周期账单的云同步快照（camelCase，与小程序端字段格式一致；
 * id = 跨端稳定标识 cloud_id，updatedAt = LWW 毫秒戳，deleted = 软删标记） */
type EntitySnapshot = Record<string, any> & {
  id: string
  updatedAt?: number
  deleted?: boolean
}

interface Category {
  id: number
  category_key: string
  subcategory_key: string
  category_name: string
  subcategory_name: string
  sort_order: number
  is_default: number
}

interface RecordItem {
  id: number
  type: string
  amount: number
  category_key: string
  subcategory_key: string
  category_name: string
  subcategory_name: string
  note: string
  record_date: string
  expense_date: string  // 兼容旧字段
  person?: string       // v0.8.0 记录人（谁花的，可选，随云同步跨端）
  created_at: string
  updated_at: string
  deleted?: number      // v0.6.6 软删除：1 = 已删（数据留底）；页面查询默认已过滤
  revive_count?: number // v0.6.7 被恢复次数（同步配对用）
}

interface MonthlyStat {
  category_key: string
  category_name: string
  total: number
}

interface RecordListResult {
  rows: RecordItem[]
  total: number
  page: number
  pageSize: number
}

interface RecurringBill {
  id: number
  type: string
  amount: number
  category_key: string
  subcategory_key: string
  category_name: string
  subcategory_name: string
  note: string
  cycle: string
  next_date: string
  is_active: number
}

interface MonthCompareResult {
  month1: { rows: MonthlyStat[]; total: number }
  month2: { rows: MonthlyStat[]; total: number }
}

interface TodoItem {
  id: number
  title: string
  cycle: string            // daily | weekly | monthly | yearly | once
  next_date: string
  time: string             // HH:mm，空字符串 = 不限
  is_active: number
  amount: number           // 关联金额，0 = 不自动记账
  category_key: string
  subcategory_key: string
  category_name: string | null
  subcategory_name: string | null
  note: string
  completed_dates: string[]
  created_at: string
}

interface ElectronAPI {
  // 分类
  getCategories: () => Promise<Category[]>
  addCategory: (data: { category_key: string; category_name: string; subcategory_key: string; subcategory_name: string }) => Promise<{ success: boolean; error?: string }>
  deleteCategory: (categoryKey: string, subcategoryKey: string) => Promise<{ success: boolean; error?: string }>

  // 记录
  addRecord: (data: { type: string; amount: number; category_key: string; subcategory_key: string; note: string; record_date: string; person?: string }) => Promise<{ id: number }>
  getRecordList: (filters?: { page?: number; pageSize?: number; month?: string; category_key?: string; type?: string; keyword?: string; includeDeleted?: boolean; onlyDeleted?: boolean }) => Promise<RecordListResult>
  deleteRecord: (id: number) => Promise<{ success: boolean }>
  markRecordByFingerprint: (parts: { date: string; amount: number; subcategoryKey: string; type: string }, count: number) => Promise<{ marked: number }>
  restoreRecord: (id: number) => Promise<{ restored: number }>
  restoreRecordByFingerprint: (parts: { date: string; amount: number; subcategoryKey: string; type: string }, count: number) => Promise<{ restored: number }>
  purgeRecordById: (id: number) => Promise<{ ok: boolean; pid?: string }>
  purgeLocalRecords: (parts: { date: string; amount: number; subcategoryKey: string; type: string }, count: number) => Promise<{ removed: number }>
  listPurges: () => Promise<{ pid: string; target_key: string; cancel_rec: number; cancel_tomb: number; cancel_rev: number; label?: string }[]>
  clearPurges: (pids: string[]) => Promise<{ cleared: number }>
  updateRecord: (id: number, data: { type: string; amount: number; category_key: string; subcategory_key: string; note: string; record_date: string; person?: string }) => Promise<{ success: boolean }>

  // 统计
  getMonthlyStats: (month: string, type?: string) => Promise<MonthlyStat[]>
  getMonthlyTotal: (month: string, type?: string) => Promise<number>
  getDailyTrend: (month: string, type?: string) => Promise<{ date: string; total: number }[]>
  compareMonths: (month1: string, month2: string) => Promise<MonthCompareResult>

  // 设置
  getSetting: (key: string) => Promise<string | null>
  setSetting: (key: string, value: string) => Promise<{ success: boolean }>

  // 导出
  exportAll: (month?: string, type?: string) => Promise<Record<string, any>[]>
  saveFile: (defaultName: string, buffer: number[]) => Promise<{ success: boolean; path?: string }>

  // 备份恢复
  createBackup: () => Promise<{ success: boolean; path?: string }>
  restoreBackup: () => Promise<{ success: boolean; error?: string }>

  // 周期性账单
  getRecurringBills: () => Promise<RecurringBill[]>
  addRecurring: (data: { type: string; amount: number; category_key: string; subcategory_key: string; note: string; cycle: string; next_date: string }) => Promise<{ id: number }>
  deleteRecurring: (id: number) => Promise<{ success: boolean }>
  toggleRecurring: (id: number, active: boolean) => Promise<{ success: boolean }>
  executeRecurring: (id: number) => Promise<{ success: boolean; error?: string }>
  // v0.7.3 云同步实体快照（camelCase，含软删项）
  getRecurringForSync: () => Promise<EntitySnapshot[]>
  applyCloudRecurring: (items: EntitySnapshot[]) => Promise<{ changed: number }>
  onRecurringAutoRun: (callback: (list: { name: string; amount: number; type: string; nextDate: string }[]) => void) => void

  // 待办事项
  getTodos: () => Promise<TodoItem[]>
  addTodo: (data: { title: string; cycle: string; next_date: string; time?: string; amount?: number; category_key?: string; subcategory_key?: string; note?: string }) => Promise<{ id: number }>
  deleteTodo: (id: number) => Promise<{ success: boolean }>
  toggleTodo: (id: number, active: boolean) => Promise<{ success: boolean }>
  completeTodo: (id: number) => Promise<{ success: boolean; recorded?: { amount: number; date: string } | null; error?: string }>
  // v0.7.3 云同步实体快照（camelCase，含软删项）
  getTodosForSync: () => Promise<EntitySnapshot[]>
  applyCloudTodos: (items: EntitySnapshot[]) => Promise<{ changed: number }>
  getShortcut: () => Promise<string>
  setShortcut: (accelerator: string) => Promise<{ success: boolean }>

  // 云同步
  getCloudStatus: () => Promise<{ enabled: boolean; envId: string; manifest: { lastSyncAt: string; recordCount: number; envId: string } | null }>
  setCloudEnvId: (envId: string) => Promise<{ success: boolean }>
  cloudSync: () => Promise<{ success: boolean; uploaded: number; downloaded: number; error?: string }>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export type { Category, RecordItem, MonthlyStat, RecordListResult, RecurringBill, MonthCompareResult, TodoItem }
export {}
