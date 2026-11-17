import { ipcMain } from 'electron'
import { db, queryAll, queryOne, saveDatabase } from './db'
import { localDateStr, getNextDate, newEntityId } from './util'
import { notifyAutoBills } from './windows'
import type { AutoBillInfo } from './windows'

export function registerRecurringIpc(): void {
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
}

// 检查周期性账单到期（启动延时 + 运行期定时调用）
// v0.7.7 执行回执 last_executed_for：本期已被另一端执行并同步回来时只快进日期、不重复记账
export function checkRecurringBills(): void {
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
