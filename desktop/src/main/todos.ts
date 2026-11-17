import { ipcMain } from 'electron'
import { db, queryAll, queryOne, saveDatabase } from './db'
import { localDateStr, getNextDate, newEntityId } from './util'

// 待办完成日期列表（JSON 字符串 → 字符串数组，脏数据降级为空数组）
function parseDateArray(v: unknown): string[] {
  try {
    const arr = JSON.parse(typeof v === 'string' && v ? v : '[]')
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function registerTodosIpc(): void {
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
}
