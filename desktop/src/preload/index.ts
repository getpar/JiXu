import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // 分类
  getCategories: () => ipcRenderer.invoke('categories:getAll'),
  addCategory: (data: { category_key: string; category_name: string; subcategory_key: string; subcategory_name: string }) =>
    ipcRenderer.invoke('categories:add', data),
  deleteCategory: (categoryKey: string, subcategoryKey: string) =>
    ipcRenderer.invoke('categories:delete', categoryKey, subcategoryKey),

  // 流水记录
  addRecord: (data: { type: string; amount: number; category_key: string; subcategory_key: string; note: string; record_date: string }) =>
    ipcRenderer.invoke('records:add', data),
  getRecordList: (filters?: { page?: number; pageSize?: number; month?: string; category_key?: string; type?: string; keyword?: string; includeDeleted?: boolean; onlyDeleted?: boolean }) =>
    ipcRenderer.invoke('records:getList', filters),
  deleteRecord: (id: number) => ipcRenderer.invoke('records:delete', id),
  updateRecord: (id: number, data: { type: string; amount: number; category_key: string; subcategory_key: string; note: string; record_date: string }) =>
    ipcRenderer.invoke('records:update', id, data),
  markRecordByFingerprint: (parts: { date: string; amount: number; subcategoryKey: string; type: string }, count: number) =>
    ipcRenderer.invoke('records:markByFingerprint', parts, count),
  restoreRecord: (id: number) => ipcRenderer.invoke('records:restore', id),
  restoreRecordByFingerprint: (parts: { date: string; amount: number; subcategoryKey: string; type: string }, count: number) =>
    ipcRenderer.invoke('records:restoreByFingerprint', parts, count),
  // v0.8.5 彻底删除：回收站行物理删除+注销凭条入队 / 引擎消费对端凭条 / 凭条队列读写
  purgeRecordById: (id: number) => ipcRenderer.invoke('records:purgeById', id),
  purgeLocalRecords: (parts: { date: string; amount: number; subcategoryKey: string; type: string }, count: number) =>
    ipcRenderer.invoke('records:purgeLocal', parts, count),
  listPurges: () => ipcRenderer.invoke('purges:list'),
  clearPurges: (pids: string[]) => ipcRenderer.invoke('purges:clear', pids),

  // 统计
  getMonthlyStats: (month: string, type?: string) => ipcRenderer.invoke('stats:getMonthlyStats', month, type),
  getMonthlyTotal: (month: string, type?: string) => ipcRenderer.invoke('stats:getMonthlyTotal', month, type),
  getDailyTrend: (month: string, type?: string) => ipcRenderer.invoke('stats:getDailyTrend', month, type),
  compareMonths: (month1: string, month2: string) => ipcRenderer.invoke('stats:compareMonths', month1, month2),

  // 设置
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),

  // 导出
  exportAll: (month?: string, type?: string) => ipcRenderer.invoke('records:exportAll', month, type),
  saveFile: (defaultName: string, buffer: number[]) => ipcRenderer.invoke('dialog:saveFile', defaultName, buffer),

  // 备份恢复
  createBackup: () => ipcRenderer.invoke('backup:create'),
  restoreBackup: () => ipcRenderer.invoke('backup:restore'),

  // 周期性账单
  getRecurringBills: () => ipcRenderer.invoke('recurring:getAll'),
  addRecurring: (data: { type: string; amount: number; category_key: string; subcategory_key: string; note: string; cycle: string; next_date: string }) =>
    ipcRenderer.invoke('recurring:add', data),
  deleteRecurring: (id: number) => ipcRenderer.invoke('recurring:delete', id),
  toggleRecurring: (id: number, active: boolean) => ipcRenderer.invoke('recurring:toggle', id, active),
  executeRecurring: (id: number) => ipcRenderer.invoke('recurring:executeNow', id),
  // v0.7.3 周期账单云同步（标准化快照，含软删项）
  getRecurringForSync: () => ipcRenderer.invoke('recurring:getAllForSync'),
  applyCloudRecurring: (items: Record<string, unknown>[]) => ipcRenderer.invoke('recurring:applyCloud', items),
  // 主进程到期自动入账后推送提醒（启动时积压的会在界面加载完后补发）
  onRecurringAutoRun: (callback: (list: { name: string; amount: number; type: string; nextDate: string }[]) => void) => {
    ipcRenderer.on('recurring:autoExecuted', (_event, list) => callback(list))
  },

  // 待办事项
  getTodos: () => ipcRenderer.invoke('todos:getAll'),
  addTodo: (data: { title: string; cycle: string; next_date: string; time?: string; amount?: number; category_key?: string; subcategory_key?: string; note?: string }) =>
    ipcRenderer.invoke('todos:add', data),
  deleteTodo: (id: number) => ipcRenderer.invoke('todos:delete', id),
  toggleTodo: (id: number, active: boolean) => ipcRenderer.invoke('todos:toggle', id, active),
  completeTodo: (id: number) => ipcRenderer.invoke('todos:complete', id),
  // v0.7.3 待办云同步（标准化快照，含软删项）
  getTodosForSync: () => ipcRenderer.invoke('todos:getAllForSync'),
  applyCloudTodos: (items: Record<string, unknown>[]) => ipcRenderer.invoke('todos:applyCloud', items),

  // 快捷键
  getShortcut: () => ipcRenderer.invoke('shortcut:get'),
  setShortcut: (accelerator: string) => ipcRenderer.invoke('shortcut:set', accelerator),

  // 云同步
  getCloudStatus: () => ipcRenderer.invoke('cloud:getStatus'),
  setCloudEnvId: (envId: string) => ipcRenderer.invoke('cloud:setEnvId', envId),
  cloudSync: () => ipcRenderer.invoke('cloud:sync'),
})
