import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import initSqlJs, { Database, SqlJsStatic } from 'sql.js'
import { newEntityId } from './util'

export let db: Database | null = null
export let SQL: SqlJsStatic | null = null
export let DB_PATH = ''

// ========== 数据库初始化 ==========

export async function initDatabase(): Promise<void> {
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

  // v0.9.1 默认分类：首次建库全量写入；已有库启动时补齐后来新增的默认分类（如「宠物」）
  ensureDefaultCategories()

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

  // 存钱罐表（需求评估-02）：完全独立的小账本，不参与 records 统计
  db.run(`
    CREATE TABLE IF NOT EXISTS savings (
      id TEXT PRIMARY KEY,
      direction TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      revive_count INTEGER NOT NULL DEFAULT 0
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

/**
 * v1.0 落盘改成「合并写」：sql.js 每次 db.export() 会把整库序列化一遍，
 * 原来每写一条记录就同步写盘一次（批量同步 N 条 = N 次全库重写，主进程直接卡死）。
 * 现在只标脏 + 150ms 后合并写一次；退出/备份前用 saveDatabase(true) 强制落盘。
 */
let saveTimer: ReturnType<typeof setTimeout> | null = null
let dbDirty = false

function flushDatabase(): void {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  if (!db || !dbDirty) return
  dbDirty = false
  const data = db.export()
  fs.writeFileSync(DB_PATH, Buffer.from(data))
}

export function saveDatabase(immediate = false): void {
  if (!db) return
  dbDirty = true
  if (immediate) { flushDatabase(); return }
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushDatabase, 150)
  if (typeof saveTimer.unref === 'function') saveTimer.unref()
}

/** 备份恢复后替换内存中的数据库实例 */
export function setDatabase(next: Database | null): void {
  db = next
}

/** 默认分类种子（v0.9.1 起「宠物」独立为一级大类）。
 *  以后新增默认分类只往这里追加；已有用户的库由 ensureDefaultCategories 启动时自动补齐。 */
const DEFAULT_CATEGORY_SEED = [
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
    { ck: 'pet', cname: '宠物', sk: 'pet_food', sname: '宠物食品', sort: 84 },
    { ck: 'pet', cname: '宠物', sk: 'pet_medical', sname: '宠物医疗', sort: 85 },
    { ck: 'pet', cname: '宠物', sk: 'pet_supply', sname: '宠物用品', sort: 86 },
    { ck: 'pet', cname: '宠物', sk: 'pet_beauty', sname: '美容洗护', sort: 87 },
    { ck: 'pet', cname: '宠物', sk: 'pet_boarding', sname: '寄养服务', sort: 88 },
    { ck: 'pet', cname: '宠物', sk: 'pet_other', sname: '其他宠物', sort: 89 },
    { ck: 'other', cname: '其他杂项', sk: 'express', sname: '快递邮寄', sort: 90 },
    { ck: 'other', cname: '其他杂项', sk: 'misc', sname: '其他', sort: 92 },
]

/** 首次建库写入全部默认分类；已有库启动时补齐后来新增的默认分类（幂等：按 category_key+subcategory_key 判重）。
 *  注意：只新增、不删除 —— 老库里的 (other, pet) 等历史行要保留，否则旧账单 LEFT JOIN 取不到分类名。 */
function ensureDefaultCategories(): void {
  if (!db) return
  const existing = new Set<string>()
  const res = db.exec('SELECT category_key, subcategory_key FROM categories')
  if (res[0]) for (const row of res[0].values) existing.add(`${row[0]}|${row[1]}`)
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO categories (category_key, subcategory_key, category_name, subcategory_name, sort_order, is_default) VALUES (?, ?, ?, ?, ?, 1)'
  )
  let added = 0
  for (const c of DEFAULT_CATEGORY_SEED) {
    if (existing.has(`${c.ck}|${c.sk}`)) continue
    stmt.run([c.ck, c.sk, c.cname, c.sname, c.sort])
    added++
  }
  stmt.free()
  if (added > 0) saveDatabase()
}

// 兼容：确保旧 expenses 表的 API 仍可工作（字段名映射）
export function oldToNew(row: any): any {
  if (!row) return row
  return {
    ...row,
    expense_date: row.record_date || row.expense_date,
    record_date: row.record_date || row.expense_date,
  }
}

export function queryAll(sql: string, params?: any[]): any[] {
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

export function queryOne(sql: string, params?: any[]): any {
  const rows = queryAll(sql, params)
  return rows[0] || null
}
