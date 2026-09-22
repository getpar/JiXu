import { app, BrowserWindow, ipcMain, dialog, globalShortcut, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'
import initSqlJs, { Database, SqlJsStatic } from 'sql.js'

let mainWindow: BrowserWindow | null = null
let quickAddWindow: BrowserWindow | null = null
let tray: Tray | null = null
let db: Database | null = null
let SQL: SqlJsStatic | null = null
let DB_PATH = ''
let isQuitting = false  // 标记是否真正退出

// ---- 周期账单自动执行 → 渲染进程通知 ----

interface AutoBillInfo {
  name: string     // 分类名，用于提示文案
  amount: number
  type: string
  nextDate: string // 自动推算出的下次到期日
}

let rendererReady = false
let pendingAutoNotify: AutoBillInfo[] = []

function notifyAutoBills(list: AutoBillInfo[]): void {
  if (list.length === 0) return
  if (mainWindow && !mainWindow.isDestroyed() && rendererReady) {
    mainWindow.webContents.send('recurring:autoExecuted', list)
  } else {
    // 界面还没加载完，先排队，did-finish-load 后补发
    pendingAutoNotify.push(...list)
  }
}

// ========== 数据库初始化 ==========

async function initDatabase(): Promise<void> {
  DB_PATH = path.join(app.getPath('userData'), 'daily-notes.db')
  SQL = await initSqlJs()

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  // 流水记录表 — 支持支出和收入；v0.6.6 软删除：deleted=1 的行页面不显示但数据留底可恢复
  db.run(`
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'expense',
      amount REAL NOT NULL,
      category_key TEXT NOT NULL,
      subcategory_key TEXT NOT NULL,
      note TEXT DEFAULT '',
      record_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      deleted INTEGER NOT NULL DEFAULT 0,
      revive_count INTEGER NOT NULL DEFAULT 0
    )
  `)

  // 老库兼容：缺列时自动补列（用户无需删库重装）
  const recCols = db.exec("PRAGMA table_info(records)")
  const colNames = new Set((recCols[0]?.values || []).map((v) => v[1]))
  if (!colNames.has('deleted')) {
    db.run('ALTER TABLE records ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0')
    saveDatabase()
  }
  // v0.6.7：被恢复次数（同步配对：历史删除凭证数 = 已删行 + 累计恢复次数）
  if (!colNames.has('revive_count')) {
    db.run('ALTER TABLE records ADD COLUMN revive_count INTEGER NOT NULL DEFAULT 0')
    saveDatabase()
  }
  // v0.8.5 彻底删除：本地待上传的"注销凭条"队列（离线删除也不丢，同步上传成功后按 pid 清除）
  db.run(`
    CREATE TABLE IF NOT EXISTS sync_purges (
      pid TEXT PRIMARY KEY,
      target_key TEXT NOT NULL,
      cancel_rec INTEGER NOT NULL DEFAULT 1,
      cancel_tomb INTEGER NOT NULL DEFAULT 1,
      cancel_rev INTEGER NOT NULL DEFAULT 0,
      label TEXT DEFAULT '',
      created_at INTEGER NOT NULL
    )
  `)
  // v0.8.0：记录人（谁花的，可选，随云同步跨端）
  if (!colNames.has('person')) {
    db.run("ALTER TABLE records ADD COLUMN person TEXT DEFAULT ''")
    saveDatabase()
  }

  // 兼容旧表：如果存在旧 expenses 表，迁移数据
  const hasOldTable = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='expenses'")
  if (hasOldTable.length > 0 && hasOldTable[0].values.length > 0) {
    const oldRecords = db.exec('SELECT * FROM expenses')
    if (oldRecords.length > 0 && oldRecords[0].values.length > 0) {
      for (const row of oldRecords[0].values) {
        db.run(
          'INSERT OR IGNORE INTO records (id, type, amount, category_key, subcategory_key, note, record_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [row[0], 'expense', row[1], row[2], row[3], row[4] || '', row[5], row[6] || '', row[7] || '']
        )
      }
    }
    db.run('DROP TABLE expenses')
    saveDatabase()
  }

  // 分类表 — 支持用户自定义
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_key TEXT NOT NULL,
      subcategory_key TEXT NOT NULL,
      category_name TEXT NOT NULL,
      subcategory_name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      is_default INTEGER DEFAULT 1,
      UNIQUE(category_key, subcategory_name)
    )
  `)

  const countResult = db.exec('SELECT COUNT(*) as cnt FROM categories')
  const cnt = countResult[0]?.values[0]?.[0] || 0
  if (cnt === 0) {
    insertDefaultCategories()
    saveDatabase()
  }

  // 周期性账单表
  db.run(`
    CREATE TABLE IF NOT EXISTS recurring_bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'expense',
      amount REAL NOT NULL,
      category_key TEXT NOT NULL,
      subcategory_key TEXT NOT NULL,
      note TEXT DEFAULT '',
      cycle TEXT NOT NULL DEFAULT 'monthly',
      next_date TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `)

  // 设置表
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  // 待办事项表（与小程序端 todos 功能对齐）
  db.run(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      cycle TEXT NOT NULL DEFAULT 'daily',
      next_date TEXT NOT NULL,
      time TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      amount REAL DEFAULT 0,
      category_key TEXT DEFAULT '',
      subcategory_key TEXT DEFAULT '',
      note TEXT DEFAULT '',
      completed_dates TEXT DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `)

  // v0.7.3 待办/周期账单云同步：两表补列 — updated_at(LWW 毫秒戳)、deleted(软删)、cloud_id(跨端稳定标识)
  for (const tbl of ['todos', 'recurring_bills']) {
    const cols = new Set((db.exec(`PRAGMA table_info(${tbl})`)[0]?.values || []).map((v) => v[1]))
    if (!cols.has('updated_at')) db.run(`ALTER TABLE ${tbl} ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0`)
    if (!cols.has('deleted')) db.run(`ALTER TABLE ${tbl} ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0`)
    if (!cols.has('cloud_id')) db.run(`ALTER TABLE ${tbl} ADD COLUMN cloud_id TEXT DEFAULT ''`)
    // v0.7.7 周期账单执行回执：已为哪个到期日记过账（跨端防双记，随快照同步）
    if (tbl === 'recurring_bills' && !cols.has('last_executed_for')) {
      db.run(`ALTER TABLE ${tbl} ADD COLUMN last_executed_for TEXT DEFAULT ''`)
    }
    // 存量行补随机 cloud_id（软删后 id 不再物理复用，但独立标识更稳，换库/恢复备份也不串户）
    const missing = queryAll(`SELECT id FROM ${tbl} WHERE cloud_id = '' OR cloud_id IS NULL`)
    for (const row of missing) db.run(`UPDATE ${tbl} SET cloud_id = ? WHERE id = ?`, [newEntityId(), row.id])
    saveDatabase()
  }
}

function saveDatabase(): void {
  if (!db) return
  const data = db.export()
  fs.writeFileSync(DB_PATH, Buffer.from(data))
}

/** v0.7.3 实体云同步标识：d_ + 时间戳 + 随机段（与小程序端字符串 id 同属不透明串，不冲突） */
function newEntityId(): string {
  return `d_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function insertDefaultCategories(): void {
  if (!db) return
  const categories = [
    { ck: 'food', cname: '餐饮饮食', sk: 'breakfast', sname: '早餐', sort: 1 },
    { ck: 'food', cname: '餐饮饮食', sk: 'lunch', sname: '午餐', sort: 2 },
    { ck: 'food', cname: '餐饮饮食', sk: 'dinner', sname: '晚餐', sort: 3 },
    { ck: 'food', cname: '餐饮饮食', sk: 'snack', sname: '零食饮料', sort: 4 },
    { ck: 'food', cname: '餐饮饮食', sk: 'takeout', sname: '外卖', sort: 5 },
    { ck: 'food', cname: '餐饮饮食', sk: 'party', sname: '聚餐聚会', sort: 6 },
    { ck: 'transport', cname: '交通出行', sk: 'bus', sname: '公交地铁', sort: 10 },
    { ck: 'transport', cname: '交通出行', sk: 'taxi', sname: '出租车/网约车', sort: 11 },
    { ck: 'transport', cname: '交通出行', sk: 'fuel', sname: '加油充电', sort: 12 },
    { ck: 'transport', cname: '交通出行', sk: 'parking', sname: '停车费', sort: 13 },
    { ck: 'transport', cname: '交通出行', sk: 'train', sname: '火车/高铁', sort: 14 },
    { ck: 'transport', cname: '交通出行', sk: 'flight', sname: '飞机', sort: 15 },
    { ck: 'shopping', cname: '购物消费', sk: 'clothing', sname: '服装鞋帽', sort: 20 },
    { ck: 'shopping', cname: '购物消费', sk: 'digital', sname: '数码产品', sort: 21 },
    { ck: 'shopping', cname: '购物消费', sk: 'daily', sname: '日用百货', sort: 22 },
    { ck: 'shopping', cname: '购物消费', sk: 'beauty', sname: '美妆护肤', sort: 23 },
    { ck: 'shopping', cname: '购物消费', sk: 'luxury', sname: '奢侈品类', sort: 24 },
    { ck: 'housing', cname: '住房居家', sk: 'rent', sname: '房租/房贷', sort: 30 },
    { ck: 'housing', cname: '住房居家', sk: 'utility', sname: '水电燃气', sort: 31 },
    { ck: 'housing', cname: '住房居家', sk: 'property', sname: '物业费', sort: 32 },
    { ck: 'housing', cname: '住房居家', sk: 'furniture', sname: '家具家电', sort: 33 },
    { ck: 'housing', cname: '住房居家', sk: 'repair', sname: '维修保养', sort: 34 },
    { ck: 'housing', cname: '住房居家', sk: 'household', sname: '日用品', sort: 35 },
    { ck: 'entertainment', cname: '娱乐休闲', sk: 'movie', sname: '电影演出', sort: 40 },
    { ck: 'entertainment', cname: '娱乐休闲', sk: 'travel', sname: '旅游度假', sort: 41 },
    { ck: 'entertainment', cname: '娱乐休闲', sk: 'fitness', sname: '运动健身', sort: 42 },
    { ck: 'entertainment', cname: '娱乐休闲', sk: 'game', sname: '游戏充值', sort: 43 },
    { ck: 'entertainment', cname: '娱乐休闲', sk: 'bar', sname: 'KTV/酒吧', sort: 44 },
    { ck: 'medical', cname: '医疗健康', sk: 'doctor', sname: '看病就诊', sort: 50 },
    { ck: 'medical', cname: '医疗健康', sk: 'medicine', sname: '药品购买', sort: 51 },
    { ck: 'medical', cname: '医疗健康', sk: 'checkup', sname: '体检保健', sort: 52 },
    { ck: 'education', cname: '教育学习', sk: 'course', sname: '培训课程', sort: 60 },
    { ck: 'education', cname: '教育学习', sk: 'book', sname: '书籍资料', sort: 61 },
    { ck: 'education', cname: '教育学习', sk: 'exam', sname: '考试报名', sort: 62 },
    { ck: 'education', cname: '教育学习', sk: 'stationery', sname: '文具用品', sort: 63 },
    { ck: 'social', cname: '人情往来', sk: 'gift', sname: '红包礼品', sort: 70 },
    { ck: 'social', cname: '人情往来', sk: 'treat', sname: '请客吃饭', sort: 71 },
    { ck: 'social', cname: '人情往来', sk: 'wedding', sname: '婚丧嫁娶', sort: 72 },
    { ck: 'social', cname: '人情往来', sk: 'donate', sname: '捐款慈善', sort: 73 },
    { ck: 'finance', cname: '金融保险', sk: 'insurance', sname: '保险缴费', sort: 80 },
    { ck: 'finance', cname: '金融保险', sk: 'invest', sname: '投资理财', sort: 81 },
    { ck: 'finance', cname: '金融保险', sk: 'loan', sname: '贷款还款', sort: 82 },
    { ck: 'finance', cname: '金融保险', sk: 'fee', sname: '手续费', sort: 83 },
    { ck: 'other', cname: '其他杂项', sk: 'express', sname: '快递邮寄', sort: 90 },
    { ck: 'other', cname: '其他杂项', sk: 'pet', sname: '宠物开销', sort: 91 },
    { ck: 'other', cname: '其他杂项', sk: 'misc', sname: '其他', sort: 92 },
  ]

  const stmt = db.prepare(
    'INSERT INTO categories (category_key, subcategory_key, category_name, subcategory_name, sort_order, is_default) VALUES (?, ?, ?, ?, ?, 1)'
  )
  for (const c of categories) {
    stmt.run([c.ck, c.sk, c.cname, c.sname, c.sort])
  }
  stmt.free()
}

// 兼容：确保旧 expenses 表的 API 仍可工作（字段名映射）
function oldToNew(row: any): any {
  if (!row) return row
  return {
    ...row,
    expense_date: row.record_date || row.expense_date,
    record_date: row.record_date || row.expense_date,
  }
}

function queryAll(sql: string, params?: any[]): any[] {
  if (!db) return []
  const stmt = db.prepare(sql)
  if (params) stmt.bind(params)
  const rows: any[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

function queryOne(sql: string, params?: any[]): any {
  const rows = queryAll(sql, params)
  return rows[0] || null
}

// 待办完成日期列表（JSON 字符串 → 字符串数组，脏数据降级为空数组）
function parseDateArray(v: unknown): string[] {
  try {
    const arr = JSON.parse(typeof v === 'string' && v ? v : '[]')
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

// ========== IPC 通信处理 ==========

function setupIPC(): void {
  // ---- 分类 ----
  ipcMain.handle('categories:getAll', () => {
    return queryAll('SELECT * FROM categories ORDER BY sort_order')
  })

  ipcMain.handle('categories:add', (_event, data: {
    category_key: string; category_name: string
    subcategory_key: string; subcategory_name: string
  }) => {
    try {
      db!.run(
        'INSERT INTO categories (category_key, subcategory_key, category_name, subcategory_name, sort_order, is_default) VALUES (?, ?, ?, ?, 999, 0)',
        [data.category_key, data.subcategory_key, data.category_name, data.subcategory_name]
      )
      saveDatabase()
      return { success: true }
    } catch { return { success: false, error: '分类已存在' } }
  })

  ipcMain.handle('categories:delete', (_event, categoryKey: string, subcategoryKey: string) => {
    const cat = queryOne('SELECT is_default FROM categories WHERE category_key=? AND subcategory_key=?', [categoryKey, subcategoryKey])
    if (cat?.is_default === 1) return { success: false, error: '默认分类不可删除' }
    db!.run('DELETE FROM categories WHERE category_key=? AND subcategory_key=?', [categoryKey, subcategoryKey])
    saveDatabase()
    return { success: true }
  })

  // ---- 流水记录 ----
  ipcMain.handle('records:add', (_event, data: {
    type: string; amount: number; category_key: string
    subcategory_key: string; note: string; record_date: string; person?: string
  }) => {
    db!.run(
      'INSERT INTO records (type, amount, category_key, subcategory_key, note, record_date, person) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [data.type || 'expense', data.amount, data.category_key, data.subcategory_key, data.note, data.record_date, data.person || '']
    )
    const result = db!.exec('SELECT last_insert_rowid() as id')
    const id = result[0]?.values[0]?.[0] || 0
    saveDatabase()
    return { id }
  })

  ipcMain.handle('records:getList', (_event, filters?: {
    page?: number; pageSize?: number; month?: string
    category_key?: string; type?: string; keyword?: string
    includeDeleted?: boolean   // v0.6.6：同步引擎需要含已删除行的全量底数；页面默认不传 = 只看正常记录
    onlyDeleted?: boolean      // v0.6.7 回收站：只看已删除的记录
  }) => {
    const { page = 1, pageSize = 20, month, category_key, type, keyword, includeDeleted, onlyDeleted } = filters || {}
    let where = onlyDeleted ? 'WHERE r.deleted = 1' : includeDeleted ? 'WHERE 1=1' : 'WHERE r.deleted = 0'
    const params: any[] = []

    if (month) {
      where += ' AND strftime(\'%Y-%m\', r.record_date) = ?'
      params.push(month)
    }
    if (category_key) {
      where += ' AND r.category_key = ?'
      params.push(category_key)
    }
    if (type) {
      where += ' AND r.type = ?'
      params.push(type)
    }
    if (keyword) {
      where += ' AND (r.note LIKE ? OR c.category_name LIKE ? OR c.subcategory_name LIKE ? OR r.person LIKE ?)'
      const kw = `%${keyword}%`
      params.push(kw, kw, kw, kw)
    }

    const offset = (page - 1) * pageSize
    const rows = queryAll(
      `SELECT r.*, c.category_name, c.subcategory_name
       FROM records r
       LEFT JOIN categories c ON r.category_key = c.category_key AND r.subcategory_key = c.subcategory_key
       ${where}
       ORDER BY r.record_date DESC, r.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )
    const countRow = queryOne(
      `SELECT COUNT(*) as cnt FROM records r
       LEFT JOIN categories c ON r.category_key = c.category_key AND r.subcategory_key = c.subcategory_key
       ${where}`,
      params
    )
    const total = countRow?.cnt || 0
    return { rows: rows.map(oldToNew), total, page, pageSize }
  })

  // v0.6.6 软删除：不再物理删行，标记 deleted=1（数据留底可恢复；同步时由引擎上传"删除凭证"告知其它设备）
  ipcMain.handle('records:delete', (_event, id: number) => {
    db!.run("UPDATE records SET deleted = 1, updated_at = datetime('now','localtime') WHERE id = ?", [id])
    saveDatabase()
    return { success: true }
  })

  // v0.6.6 编辑 = 旧行打删除标记 + 新增一笔（删除凭证 + 新记录一起同步，跨端生效）
  ipcMain.handle('records:update', (_event, id: number, data: {
    type: string; amount: number; category_key: string
    subcategory_key: string; note: string; record_date: string; person?: string
  }) => {
    const old = queryOne('SELECT * FROM records WHERE id = ?', [id])
    if (!old) return { success: false }
    db!.run("UPDATE records SET deleted = 1, updated_at = datetime('now','localtime') WHERE id = ?", [id])
    db!.run(
      'INSERT INTO records (type, amount, category_key, subcategory_key, note, record_date, person) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [data.type, data.amount, data.category_key, data.subcategory_key, data.note, data.record_date, data.person || '']
    )
    const result = db!.exec('SELECT last_insert_rowid() as id')
    const newId = result[0]?.values[0]?.[0] || 0
    saveDatabase()
    return { success: true, id: newId }
  })

  // v0.6.6 同步引擎拉到云端"删除凭证"后，按指纹把本地存活记录标删（不重复上传凭证，凭证已在云端）
  ipcMain.handle('records:markByFingerprint', (_event, parts: {
    date: string; amount: number; subcategoryKey: string; type: string
  }, count: number) => {
    db!.run(
      `UPDATE records SET deleted = 1 WHERE id IN (
         SELECT id FROM records
         WHERE deleted = 0 AND record_date = ? AND amount = ? AND subcategory_key = ? AND type = ?
         LIMIT ?
       )`,
      [parts.date, parts.amount, parts.subcategoryKey, parts.type, count]
    )
    const changed = db!.exec('SELECT changes()')
    const marked = changed[0]?.values[0]?.[0] || 0
    if (marked) saveDatabase()
    return { marked }
  })

  // v0.6.7 回收站恢复（按行 id）：复活那一笔并累计恢复次数（恢复动作同步时上云"撤销凭条"，防凭证回灌）
  ipcMain.handle('records:restore', (_event, id: number) => {
    db!.run("UPDATE records SET deleted = 0, revive_count = revive_count + 1, updated_at = datetime('now','localtime') WHERE id = ? AND deleted = 1", [id])
    const changed = db!.exec('SELECT changes()')
    const restored = changed[0]?.values[0]?.[0] || 0
    if (restored) saveDatabase()
    return { restored }
  })

  // v0.8.5 彻底删除（回收站行）：本地物理删除 + 生成"注销凭条"入待上传队列。
  // 核销量 = 该行完整生命周期：1 张账单 + (1+V) 张删除凭证 + V 张撤销凭条，保证云端计数配平不回流
  ipcMain.handle('records:purgeById', (_event, id: number) => {
    const res = db!.exec(
      'SELECT record_date, amount, subcategory_key, type, revive_count, note FROM records WHERE id = ? AND deleted = 1',
      [id],
    )
    const v = res[0]?.values?.[0] as [string, number, string, string, number, string] | undefined
    if (!v) return { ok: false }
    const [date, amount, subcat, type, reviveCount, note] = v
    const targetKey = `${date}|${amount}|${subcat || ''}|${type}`
    const pid = `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    const label = `${date} ¥${amount}${note ? ' 备注:' + note : ''}`
    db!.run('DELETE FROM records WHERE id = ? AND deleted = 1', [id])
    db!.run(
      'INSERT OR REPLACE INTO sync_purges (pid, target_key, cancel_rec, cancel_tomb, cancel_rev, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [pid, targetKey, 1, 1 + (reviveCount || 0), reviveCount || 0, label, Date.now()],
    )
    saveDatabase()
    return { ok: true, pid }
  })

  // v0.8.5 同步引擎消费对端注销凭条：按指纹物理删除回收站行（不产生新凭条，凭条已在云端）
  ipcMain.handle('records:purgeLocal', (_event, parts: {
    date: string; amount: number; subcategoryKey: string; type: string
  }, count: number) => {
    db!.run(
      `DELETE FROM records WHERE id IN (
         SELECT id FROM records
         WHERE deleted = 1 AND record_date = ? AND amount = ? AND subcategory_key = ? AND type = ?
         LIMIT ?
       )`,
      [parts.date, parts.amount, parts.subcategoryKey, parts.type, count]
    )
    const changed = db!.exec('SELECT changes()')
    const removed = changed[0]?.values[0]?.[0] || 0
    if (removed) saveDatabase()
    return { removed }
  })

  // v0.8.5 注销凭条队列：同步时读取待上传项 / 上传成功后按 pid 清除
  ipcMain.handle('purges:list', () => {
    const res = db!.exec('SELECT pid, target_key, cancel_rec, cancel_tomb, cancel_rev, label FROM sync_purges ORDER BY created_at')
    if (!res.length) return []
    const cols = res[0].columns
    return res[0].values.map((v) => Object.fromEntries(cols.map((c, i) => [c, v[i]])))
  })

  ipcMain.handle('purges:clear', (_event, pids: string[]) => {
    for (const pid of pids || []) db!.run('DELETE FROM sync_purges WHERE pid = ?', [pid])
    if (pids?.length) saveDatabase()
    return { cleared: pids.length }
  })

  // v0.6.7 同步引擎拉到云端"撤销凭条"后，按指纹把本地已删记录恢复存活（优先恢复恢复次数少的行）
  ipcMain.handle('records:restoreByFingerprint', (_event, parts: {
    date: string; amount: number; subcategoryKey: string; type: string
  }, count: number) => {
    db!.run(
      `UPDATE records SET deleted = 0, revive_count = revive_count + 1 WHERE id IN (
         SELECT id FROM records
         WHERE deleted = 1 AND record_date = ? AND amount = ? AND subcategory_key = ? AND type = ?
         ORDER BY revive_count ASC LIMIT ?
       )`,
      [parts.date, parts.amount, parts.subcategoryKey, parts.type, count]
    )
    const changed = db!.exec('SELECT changes()')
    const restored = changed[0]?.values[0]?.[0] || 0
    if (restored) saveDatabase()
    return { restored }
  })

  // ---- 统计 ----（v0.6.6：全部只统计未删除记录）
  ipcMain.handle('stats:getMonthlyStats', (_event, month: string, recordType?: string) => {
    let where = "WHERE r.deleted = 0 AND strftime('%Y-%m', r.record_date) = ?"
    const params: any[] = [month]
    if (recordType) {
      where += ' AND r.type = ?'
      params.push(recordType)
    }
    return queryAll(
      `SELECT r.category_key, c.category_name, SUM(r.amount) as total
       FROM records r
       LEFT JOIN categories c ON r.category_key = c.category_key AND r.subcategory_key = c.subcategory_key
       ${where}
       GROUP BY r.category_key, c.category_name
       ORDER BY total DESC`,
      params
    )
  })

  ipcMain.handle('stats:getMonthlyTotal', (_event, month: string, recordType?: string) => {
    let where = "WHERE deleted = 0 AND strftime('%Y-%m', record_date) = ?"
    const params: any[] = [month]
    if (recordType) {
      where += ' AND type = ?'
      params.push(recordType)
    }
    const row = queryOne(`SELECT COALESCE(SUM(amount), 0) as total FROM records ${where}`, params)
    return row?.total || 0
  })

  ipcMain.handle('stats:getDailyTrend', (_event, month: string, recordType?: string) => {
    let where = "WHERE deleted = 0 AND strftime('%Y-%m', record_date) = ?"
    const params: any[] = [month]
    if (recordType) {
      where += ' AND type = ?'
      params.push(recordType)
    }
    return queryAll(
      `SELECT record_date as date, SUM(amount) as total FROM records ${where} GROUP BY record_date ORDER BY record_date`,
      params
    )
  })

  // 月度对比
  ipcMain.handle('stats:compareMonths', (_event, month1: string, month2: string) => {
    const m1 = queryAll(
      `SELECT r.category_key, c.category_name, SUM(r.amount) as total
       FROM records r LEFT JOIN categories c ON r.category_key = c.category_key AND r.subcategory_key = c.subcategory_key
       WHERE r.deleted = 0 AND strftime('%Y-%m', r.record_date) = ? AND r.type = 'expense'
       GROUP BY r.category_key ORDER BY total DESC`, [month1]
    )
    const m2 = queryAll(
      `SELECT r.category_key, c.category_name, SUM(r.amount) as total
       FROM records r LEFT JOIN categories c ON r.category_key = c.category_key AND r.subcategory_key = c.subcategory_key
       WHERE r.deleted = 0 AND strftime('%Y-%m', r.record_date) = ? AND r.type = 'expense'
       GROUP BY r.category_key ORDER BY total DESC`, [month2]
    )
    const t1 = queryOne("SELECT COALESCE(SUM(amount),0) as total FROM records WHERE deleted=0 AND strftime('%Y-%m', record_date)=? AND type='expense'", [month1])?.total || 0
    const t2 = queryOne("SELECT COALESCE(SUM(amount),0) as total FROM records WHERE deleted=0 AND strftime('%Y-%m', record_date)=? AND type='expense'", [month2])?.total || 0
    return { month1: { rows: m1, total: t1 }, month2: { rows: m2, total: t2 } }
  })

  // ---- 设置（预算等）----
  ipcMain.handle('settings:get', (_event, key: string) => {
    const row = queryOne('SELECT value FROM settings WHERE key = ?', [key])
    return row?.value || null
  })

  ipcMain.handle('settings:set', (_event, key: string, value: string) => {
    db!.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value])
    saveDatabase()
    return { success: true }
  })

  // ---- 导出 Excel ----
  ipcMain.handle('records:exportAll', (_event, month?: string, recordType?: string) => {
    let where = ''
    const params: any[] = []
    const conditions: string[] = ['r.deleted = 0']
    if (month) { conditions.push("strftime('%Y-%m', r.record_date) = ?"); params.push(month) }
    if (recordType) { conditions.push("r.type = ?"); params.push(recordType) }
    if (conditions.length > 0) where = ' WHERE ' + conditions.join(' AND ')

    return queryAll(
      `SELECT r.record_date as 日期, r.type as 类型, c.category_name as 一级分类, c.subcategory_name as 二级分类,
              r.amount as 金额, r.person as 记录人, r.note as 备注
       FROM records r
       LEFT JOIN categories c ON r.category_key = c.category_key AND r.subcategory_key = c.subcategory_key
       ${where}
       ORDER BY r.record_date DESC, r.created_at DESC`,
      params
    )
  })

  // ---- 文件保存 ----
  ipcMain.handle('dialog:saveFile', async (_event, defaultName: string, buffer: number[]) => {
    if (!mainWindow) return { success: false }
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: [{ name: 'Excel文件', extensions: ['xlsx'] }],
    })
    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, Buffer.from(buffer))
      return { success: true, path: result.filePath }
    }
    return { success: false }
  })

  // ---- 备份恢复 ----
  ipcMain.handle('backup:create', async () => {
    if (!mainWindow) return { success: false }
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `每日小记_备份_${localDateStr()}.db`,
      filters: [{ name: '数据库文件', extensions: ['db'] }],
    })
    if (!result.canceled && result.filePath) {
      fs.copyFileSync(DB_PATH, result.filePath)
      return { success: true, path: result.filePath }
    }
    return { success: false }
  })

  ipcMain.handle('backup:restore', async () => {
    if (!mainWindow) return { success: false }
    const result = await dialog.showOpenDialog(mainWindow, {
      filters: [{ name: '数据库文件', extensions: ['db'] }],
      properties: ['openFile'],
    })
    if (!result.canceled && result.filePaths.length > 0) {
      try {
        const buffer = fs.readFileSync(result.filePaths[0])
        // 验证是否为有效的 SQLite 数据库
        const testDb = new SQL!.Database(buffer)
        testDb.close()
        // 替换当前数据库
        fs.copyFileSync(result.filePaths[0], DB_PATH)
        if (db) db.close()
        const newBuffer = fs.readFileSync(DB_PATH)
        db = new SQL!.Database(newBuffer)
        return { success: true }
      } catch {
        return { success: false, error: '文件无效或已损坏' }
      }
    }
    return { success: false }
  })

  // ---- 周期性账单 ----
  ipcMain.handle('recurring:getAll', () => {
    return queryAll(
      `SELECT r.*, c.category_name, c.subcategory_name
       FROM recurring_bills r
       LEFT JOIN categories c ON r.category_key = c.category_key AND r.subcategory_key = c.subcategory_key
       WHERE r.deleted = 0
       ORDER BY r.next_date`
    )
  })

  // v0.7.3 同步引擎用：含软删项的标准化快照（camelCase，与小程序端字段格式一致）
  ipcMain.handle('recurring:getAllForSync', () => {
    return queryAll('SELECT * FROM recurring_bills').map((r) => ({
      id: r.cloud_id, type: r.type, amount: r.amount,
      categoryKey: r.category_key, subcategoryKey: r.subcategory_key,
      categoryName: '', subcategoryName: '', note: r.note || '',
      cycle: r.cycle, nextDate: r.next_date, isActive: !!r.is_active,
      lastExecutedFor: r.last_executed_for || '',
      updatedAt: r.updated_at || 0, deleted: !!r.deleted,
    }))
  })

  // v0.7.3 应用云端周期账单快照：按 cloud_id upsert（含 deleted 标记）
  ipcMain.handle('recurring:applyCloud', (_event, items: Array<Record<string, any>>) => {
    let changed = 0
    for (const it of items) {
      if (!it.id) continue
      const existing = queryOne('SELECT id FROM recurring_bills WHERE cloud_id = ?', [it.id])
      if (existing) {
        db!.run(
          'UPDATE recurring_bills SET type=?, amount=?, category_key=?, subcategory_key=?, note=?, cycle=?, next_date=?, is_active=?, updated_at=?, deleted=?, last_executed_for=? WHERE id=?',
          [it.type || 'expense', it.amount || 0, it.categoryKey || '', it.subcategoryKey || '', it.note || '',
           it.cycle || 'monthly', it.nextDate || '', it.isActive ? 1 : 0, it.updatedAt || 0, it.deleted ? 1 : 0,
           it.lastExecutedFor || '', existing.id]
        )
      } else {
        db!.run(
          'INSERT INTO recurring_bills (type, amount, category_key, subcategory_key, note, cycle, next_date, is_active, updated_at, deleted, cloud_id, last_executed_for) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [it.type || 'expense', it.amount || 0, it.categoryKey || '', it.subcategoryKey || '', it.note || '',
           it.cycle || 'monthly', it.nextDate || '', it.isActive ? 1 : 0, it.updatedAt || 0, it.deleted ? 1 : 0, it.id,
           it.lastExecutedFor || '']
        )
      }
      changed++
    }
    if (changed > 0) saveDatabase()
    return { changed }
  })

  ipcMain.handle('recurring:add', (_event, data: {
    type: string; amount: number; category_key: string
    subcategory_key: string; note: string; cycle: string; next_date: string
  }) => {
    const cid = newEntityId()
    db!.run(
      'INSERT INTO recurring_bills (type, amount, category_key, subcategory_key, note, cycle, next_date, updated_at, cloud_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [data.type || 'expense', data.amount, data.category_key, data.subcategory_key, data.note, data.cycle, data.next_date, Date.now(), cid]
    )
    saveDatabase()
    return { id: (db!.exec('SELECT last_insert_rowid() as id'))[0]?.values[0]?.[0] || 0 }
  })

  // v0.7.3 删除改软删（同步靠 deleted 快照传播，其它端跟删）
  ipcMain.handle('recurring:delete', (_event, id: number) => {
    db!.run('UPDATE recurring_bills SET deleted = 1, updated_at = ? WHERE id = ?', [Date.now(), id])
    saveDatabase()
    return { success: true }
  })

  ipcMain.handle('recurring:toggle', (_event, id: number, active: boolean) => {
    db!.run('UPDATE recurring_bills SET is_active = ?, updated_at = ? WHERE id = ?', [active ? 1 : 0, Date.now(), id])
    saveDatabase()
    return { success: true }
  })

  // 手动执行周期账单：立即生成一条记录
  ipcMain.handle('recurring:executeNow', (_event, id: number) => {
    const bill = queryOne('SELECT * FROM recurring_bills WHERE id = ? AND deleted = 0', [id])
    if (!bill) return { success: false, error: '账单不存在' }
    const today = localDateStr()
    db!.run(
      'INSERT INTO records (type, amount, category_key, subcategory_key, note, record_date) VALUES (?, ?, ?, ?, ?, ?)',
      [bill.type, bill.amount, bill.category_key, bill.subcategory_key,
       `[周期] ${bill.note || ''}`, today]
    )
    const next = getNextDate(bill.next_date, bill.cycle)
    // v0.7.7 手动执行也盖回执：随后自动检查不会为同一期再记一笔
    db!.run('UPDATE recurring_bills SET next_date = ?, updated_at = ?, last_executed_for = ? WHERE id = ?',
      [next, Date.now(), bill.next_date, id])
    saveDatabase()
    return { success: true }
  })

  // ---- 待办事项（与小程序端功能对齐：5 种周期 + 可选时间 + 关联金额自动记账）----
  ipcMain.handle('todos:getAll', () => {
    return queryAll(
      `SELECT t.*, c.category_name, c.subcategory_name
       FROM todos t
       LEFT JOIN categories c ON t.category_key = c.category_key AND t.subcategory_key = c.subcategory_key
       WHERE t.deleted = 0
       ORDER BY t.is_active DESC, t.next_date`
    ).map((t) => ({ ...t, completed_dates: parseDateArray(t.completed_dates) }))
  })

  // v0.7.3 同步引擎用：含软删项的标准化快照（camelCase，与小程序端 Todo 字段格式一致）
  ipcMain.handle('todos:getAllForSync', () => {
    return queryAll('SELECT * FROM todos').map((t) => ({
      id: t.cloud_id, title: t.title, cycle: t.cycle, nextDate: t.next_date, time: t.time || '',
      isActive: !!t.is_active, amount: t.amount || 0,
      categoryKey: t.category_key || '', subcategoryKey: t.subcategory_key || '',
      categoryName: '', subcategoryName: '', note: t.note || '',
      completedDates: parseDateArray(t.completed_dates), createdAt: String(t.created_at || ''),
      updatedAt: t.updated_at || 0, deleted: !!t.deleted,
    }))
  })

  // v0.7.3 应用云端待办快照：按 cloud_id upsert（含 deleted 标记）
  ipcMain.handle('todos:applyCloud', (_event, items: Array<Record<string, any>>) => {
    let changed = 0
    for (const it of items) {
      if (!it.id) continue
      const existing = queryOne('SELECT id FROM todos WHERE cloud_id = ?', [it.id])
      const doneJson = JSON.stringify(it.completedDates || [])
      if (existing) {
        db!.run(
          'UPDATE todos SET title=?, cycle=?, next_date=?, time=?, is_active=?, amount=?, category_key=?, subcategory_key=?, note=?, completed_dates=?, updated_at=?, deleted=? WHERE id=?',
          [it.title || '', it.cycle || 'daily', it.nextDate || '', it.time || '', it.isActive ? 1 : 0,
           it.amount || 0, it.categoryKey || '', it.subcategoryKey || '', it.note || '',
           doneJson, it.updatedAt || 0, it.deleted ? 1 : 0, existing.id]
        )
      } else {
        db!.run(
          `INSERT INTO todos (title, cycle, next_date, time, is_active, amount, category_key, subcategory_key, note, completed_dates, updated_at, deleted, cloud_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [it.title || '', it.cycle || 'daily', it.nextDate || '', it.time || '', it.isActive ? 1 : 0,
           it.amount || 0, it.categoryKey || '', it.subcategoryKey || '', it.note || '',
           doneJson, it.updatedAt || 0, it.deleted ? 1 : 0, it.id]
        )
      }
      changed++
    }
    if (changed > 0) saveDatabase()
    return { changed }
  })

  ipcMain.handle('todos:add', (_event, data: {
    title: string; cycle: string; next_date: string; time?: string
    amount?: number; category_key?: string; subcategory_key?: string; note?: string
  }) => {
    const cid = newEntityId()
    db!.run(
      `INSERT INTO todos (title, cycle, next_date, time, is_active, amount, category_key, subcategory_key, note, updated_at, cloud_id)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
      [data.title, data.cycle || 'daily', data.next_date, data.time || '',
       data.amount || 0, data.category_key || '', data.subcategory_key || '', data.note || '', Date.now(), cid]
    )
    saveDatabase()
    return { id: db!.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] || 0 }
  })

  // v0.7.3 删除改软删（同步靠 deleted 快照传播，其它端跟删）
  ipcMain.handle('todos:delete', (_event, id: number) => {
    db!.run('UPDATE todos SET deleted = 1, updated_at = ? WHERE id = ?', [Date.now(), id])
    saveDatabase()
    return { success: true }
  })

  ipcMain.handle('todos:toggle', (_event, id: number, active: boolean) => {
    db!.run('UPDATE todos SET is_active = ?, updated_at = ? WHERE id = ?', [active ? 1 : 0, Date.now(), id])
    saveDatabase()
    return { success: true }
  })

  // 完成待办：记录完成日期；有关联金额则自动记一笔支出；单次型自动停用，周期型自动推算下次日期
  ipcMain.handle('todos:complete', (_event, id: number) => {
    const todo = queryOne('SELECT * FROM todos WHERE id = ? AND deleted = 0', [id])
    if (!todo) return { success: false, error: '待办不存在' }
    const today = localDateStr()
    const done = parseDateArray(todo.completed_dates)
    if (!done.includes(today)) done.push(today)
    let recorded: { amount: number; date: string } | null = null
    if (todo.amount > 0 && todo.category_key && todo.subcategory_key) {
      db!.run(
        'INSERT INTO records (type, amount, category_key, subcategory_key, note, record_date) VALUES (?, ?, ?, ?, ?, ?)',
        ['expense', todo.amount, todo.category_key, todo.subcategory_key,
         `[待办] ${todo.title}${todo.note ? ' · ' + todo.note : ''}`, today]
      )
      recorded = { amount: todo.amount, date: today }
    }
    let nextDate = todo.next_date
    let active = todo.is_active
    if (todo.cycle === 'once') {
      active = 0 // 单次待办完成后自动停用，沉底到已完成区
    } else {
      // 与小程序端一致：每完成一次仅向后推一个周期
      nextDate = getNextDate(todo.next_date, todo.cycle)
    }
    db!.run(
      'UPDATE todos SET completed_dates = ?, next_date = ?, is_active = ?, updated_at = ? WHERE id = ?',
      [JSON.stringify(done), nextDate, active, Date.now(), id]
    )
    saveDatabase()
    return { success: true, recorded }
  })

  // ---- 云同步（状态查询，实际同步在渲染进程 cloudbase.ts 中执行）----
  ipcMain.handle('cloud:getStatus', () => ({
    enabled: false,  // 由渲染进程 cloudbase.ts 管理连接状态
    envId: '',
    manifest: null,
  }))

  ipcMain.handle('cloud:setEnvId', (_event, _envId: string) => {
    return { success: true }
  })

  ipcMain.handle('cloud:sync', async () => {
    return { success: false, uploaded: 0, downloaded: 0, error: '请在侧边栏使用云同步功能' }
  })
}

// 检查周期性账单到期（启动延时 + 运行期定时调用）
// v0.7.7 执行回执 last_executed_for：本期已被另一端执行并同步回来时只快进日期、不重复记账
function checkRecurringBills(): void {
  if (!db) return
  const today = localDateStr()
  const due = queryAll(
    `SELECT r.*, c.category_name, c.subcategory_name
     FROM recurring_bills r
     LEFT JOIN categories c ON r.category_key = c.category_key AND r.subcategory_key = c.subcategory_key
     WHERE r.is_active = 1 AND r.deleted = 0 AND r.next_date <= ?`,
    [today]
  )
  if (due.length === 0) return
  const executed: AutoBillInfo[] = []
  for (const bill of due) {
    if (bill.last_executed_for === bill.next_date) {
      // 回执显示本期已记过：只把日期快进到今天之后，不记账
      let skip = getNextDate(bill.next_date, bill.cycle)
      let g = 0
      while (skip <= today && g++ < 2000) {
        const prev = skip
        skip = getNextDate(skip, bill.cycle)
        if (skip === prev) break
      }
      db.run('UPDATE recurring_bills SET next_date = ?, updated_at = ? WHERE id = ?', [skip, Date.now(), bill.id])
      continue
    }
    // 到期即自动记一笔（日期 = 今天，备注加 [周期] 标记，与手动触发一致）
    db.run(
      'INSERT INTO records (type, amount, category_key, subcategory_key, note, record_date) VALUES (?, ?, ?, ?, ?, ?)',
      [bill.type, bill.amount, bill.category_key, bill.subcategory_key,
       `[周期] ${bill.note || ''}`, today]
    )
    // 快进所有已过期周期，推算到今天之后的第一个未来日期；
    // 隔几个月才打开软件也只为本次到期记 1 笔，不重复补记历史账
    let next = getNextDate(bill.next_date, bill.cycle)
    let guard = 0
    while (next <= today && guard++ < 2000) {
      const prev = next
      next = getNextDate(next, bill.cycle)
      if (next === prev) break // 未知周期导致日期不推进，防死循环
    }
    db.run('UPDATE recurring_bills SET next_date = ?, updated_at = ?, last_executed_for = ? WHERE id = ?',
      [next, Date.now(), bill.next_date, bill.id])
    executed.push({
      name: bill.subcategory_name || bill.category_name || '周期账单',
      amount: bill.amount, type: bill.type, nextDate: next,
    })
  }
  saveDatabase()
  notifyAutoBills(executed)
}

function getNextDate(current: string, cycle: string): string {
  const d = new Date(current)
  switch (cycle) {
    case 'daily': d.setDate(d.getDate() + 1); break
    case 'weekly': d.setDate(d.getDate() + 7); break
    case 'monthly': d.setMonth(d.getMonth() + 1); break
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break
  }
  return localDateStr(d)
}

/** 本地时区的 YYYY-MM-DD（v0.6.8 修时区 bug：toISOString 是 UTC 日期，凌晨 0~8 点会算成昨天） */
function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ========== 窗口 ==========

function getIconPath(): string {
  const devPath = path.join(__dirname, '../../build/icon.png')
  const prodPath = path.join(process.resourcesPath, 'icon.png')
  return fs.existsSync(devPath) ? devPath : prodPath
}

// ========== 自定义关闭弹窗 ==========

function showCloseDialog(): void {
  const dialogWin = new BrowserWindow({
    width: 400, height: 220,
    resizable: false, frame: false,
    parent: mainWindow!, modal: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Microsoft YaHei', sans-serif; background:#fff; overflow:hidden; user-select:none; }
.header { padding:20px 24px 0; display:flex; align-items:center; gap:12px; }
.header .icon { font-size:28px; }
.header .title { font-size:15px; font-weight:600; color:#1a1a1a; }
.body { padding:12px 24px 20px; color:#666; font-size:13px; line-height:1.6; }
.footer { display:flex; justify-content:flex-end; gap:8px; padding:0 24px 20px; }
.btn { padding:7px 20px; border-radius:6px; font-size:13px; cursor:pointer; border:none; transition:all 0.2s; }
.btn-tray { background:#1677ff; color:#fff; }
.btn-tray:hover { background:#4096ff; }
.btn-quit { background:#fff; color:#ff4d4f; border:1px solid #ff4d4f; }
.btn-quit:hover { background:#fff1f0; }
.btn-cancel { background:#fff; color:#666; border:1px solid #d9d9d9; }
.btn-cancel:hover { background:#fafafa; }
</style></head><body>
<div class="header"><span class="icon">📒</span><span class="title">每日小记</span></div>
<div class="body">关闭窗口后应用会在后台继续运行，<br/>快捷键 <b>Ctrl+Shift+N</b> 仍然可以记账。</div>
<div class="footer">
<button class="btn btn-cancel" onclick="choose('cancel')">取消</button>
<button class="btn btn-quit" onclick="choose('quit')">直接退出</button>
<button class="btn btn-tray" onclick="choose('tray')" autofocus>最小化到托盘</button>
</div>
<script>const{ipcRenderer}=require('electron');function choose(a){ipcRenderer.send('close-dialog-choice',a)}</script>
</body></html>`

  dialogWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

  const handler = (_event: any, action: string) => {
    dialogWin.close()
    ipcMain.removeListener('close-dialog-choice' as any, handler)
    if (action === 'tray') { mainWindow!.hide() }
    else if (action === 'quit') { isQuitting = true; app.quit() }
  }
  ipcMain.on('close-dialog-choice' as any, handler)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 900, minHeight: 600,
    title: '每日小记',
    icon: getIconPath(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  })

  // 点击 X 时弹窗询问：最小化到托盘 or 直接退出
  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    showCloseDialog()
  })

  // 界面加载完成后，补发启动期间积压的周期账单自动入账通知
  mainWindow.webContents.on('did-finish-load', () => {
    rendererReady = true
    if (pendingAutoNotify.length > 0) {
      notifyAutoBills(pendingAutoNotify)
      pendingAutoNotify = []
    }
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_RENDERER_URL
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// 退出前标记，用于区分"关闭窗口"和"退出应用"
isQuitting = false

function createQuickAddWindow(): void {
  if (quickAddWindow) {
    quickAddWindow.focus()
    return
  }
  quickAddWindow = new BrowserWindow({
    width: 480, height: 520, resizable: false, frame: true,
    title: '快速记账',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_RENDERER_URL
  if (devServerUrl) {
    quickAddWindow.loadURL(devServerUrl + '#/quick-add')
  } else {
    quickAddWindow.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: '/quick-add' })
  }
  quickAddWindow.on('closed', () => { quickAddWindow = null })
}

// ========== 托盘图标 ==========

function createTray(): void {
  const iconPath = getIconPath()
  const trayIcon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty()
  tray = new Tray(trayIcon)
  tray.setToolTip('每日小记 — 双击打开主窗口')

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus() } } },
    { type: 'separator' },
    { label: '退出每日小记', click: () => { app.exit(0) } },
  ])
  tray.setContextMenu(contextMenu)

  // 双击托盘图标显示窗口
  tray.on('double-click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus() }
  })
}

// ========== 快捷键管理 ==========

let currentShortcut = 'CommandOrControl+Shift+N'

function registerShortcut(accelerator: string): void {
  globalShortcut.unregisterAll()
  try {
    globalShortcut.register(accelerator, () => createQuickAddWindow())
    currentShortcut = accelerator
  } catch {
    // 无效的快捷键，回退到默认
    globalShortcut.register('CommandOrControl+Shift+N', () => createQuickAddWindow())
    currentShortcut = 'CommandOrControl+Shift+N'
  }
}

// ========== 生命周期 ==========

// 单实例锁：确保只有一个程序实例运行
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // 用户尝试打开第二个实例时，激活第一个窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
  await initDatabase()
  setupIPC()

  // 添加快捷键设置 IPC（需要在 db 初始化之后）
  ipcMain.handle('shortcut:get', () => {
    const row = queryOne('SELECT value FROM settings WHERE key = ?', ['shortcut_key'])
    return row?.value || 'CommandOrControl+Shift+N'
  })

  ipcMain.handle('shortcut:set', (_event, accelerator: string) => {
    db!.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['shortcut_key', accelerator])
    saveDatabase()
    registerShortcut(accelerator)
    return { success: true }
  })

  createWindow()
  createTray()

  // 周期账单自动执行：v0.7.7 启动检查延后 60 秒——给渲染端启动后的云同步留时间，
  // 先拉回另一端的执行回执再判断到期，避免手机已记过、电脑开机又补一笔；
  // 之后每 30 分钟检查一次，覆盖软件整日常驻不关时“跨午夜到期”的场景
  setTimeout(checkRecurringBills, 60 * 1000)
  setInterval(() => checkRecurringBills(), 30 * 60 * 1000)

  // 注册全局快捷键
  const savedShortcut = queryOne('SELECT value FROM settings WHERE key = ?', ['shortcut_key'])
  registerShortcut(savedShortcut?.value || 'CommandOrControl+Shift+N')

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else if (mainWindow) { mainWindow.show(); mainWindow.focus() }
  })
})

// 标记真正的退出
app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  // 有托盘时不退出，保持后台运行
  // macOS 特殊处理，其他平台托盘运行时不退出
})
}  // 结束 else 块（单实例锁）
