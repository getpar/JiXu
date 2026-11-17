import { ipcMain } from 'electron'
import { db, queryAll, queryOne, saveDatabase } from './db'
import { localDateStr } from './util'

/** 存钱记录稳定 id：s_ + 时间戳 + 随机段（与安卓/小程序同格式） */
function newSavingsId(): string {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function savingsRowToItem(row: any): any {
  return {
    id: row.id,
    direction: row.direction,
    amount: Number(row.amount) || 0,
    date: row.date,
    note: row.note || '',
    created_at: Number(row.created_at) || 0,
    updated_at: Number(row.updated_at) || 0,
    deleted: Number(row.deleted) || 0,
    revive_count: Number(row.revive_count) || 0,
  }
}

export function registerSavingsIpc(): void {
  // ---- 存钱罐（独立小账本，不参与 records / 统计 / 预算） ----
  ipcMain.handle('savings:getAll', () => {
    return queryAll('SELECT * FROM savings WHERE deleted = 0 ORDER BY date DESC, created_at DESC')
      .map(savingsRowToItem)
  })

  ipcMain.handle('savings:getDeleted', () => {
    return queryAll('SELECT * FROM savings WHERE deleted > 0 ORDER BY date DESC, created_at DESC')
      .map(savingsRowToItem)
  })

  ipcMain.handle('savings:getSummary', () => {
    const rows = queryAll('SELECT direction, amount, date FROM savings WHERE deleted = 0')
    const month = localDateStr().slice(0, 7)
    const cents = (x: number): number => Math.round((Number(x) || 0) * 100)
    let totalIn = 0
    let totalOut = 0
    let monthIn = 0
    let monthOut = 0
    for (const r of rows) {
      const n = cents(r.amount)
      if (r.direction === 'in') {
        totalIn += n
        if (String(r.date || '').startsWith(month)) monthIn += n
      } else if (r.direction === 'out') {
        totalOut += n
        if (String(r.date || '').startsWith(month)) monthOut += n
      }
    }
    return {
      total: (totalIn - totalOut) / 100,
      totalIn: totalIn / 100,
      totalOut: totalOut / 100,
      monthIn: monthIn / 100,
      monthOut: monthOut / 100,
    }
  })

  ipcMain.handle('savings:add', (_event, data: {
    direction: string; amount: number; date: string; note?: string
  }) => {
    if (data.direction !== 'in' && data.direction !== 'out') return { success: false, error: '方向不合法' }
    const now = Date.now()
    const id = newSavingsId()
    db!.run(
      'INSERT INTO savings (id, direction, amount, date, note, created_at, updated_at, deleted, revive_count) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0)',
      [id, data.direction, Number(data.amount) || 0, data.date, data.note || '', now, now],
    )
    saveDatabase()
    return { success: true, id }
  })

  ipcMain.handle('savings:update', (_event, id: string, data: {
    amount: number; date: string; note?: string
  }) => {
    const now = Date.now()
    db!.run(
      'UPDATE savings SET amount = ?, date = ?, note = ?, updated_at = ? WHERE id = ? AND deleted = 0',
      [Number(data.amount) || 0, data.date, data.note || '', now, id],
    )
    saveDatabase()
    return { success: true }
  })

  ipcMain.handle('savings:delete', (_event, id: string) => {
    db!.run('UPDATE savings SET deleted = 1, updated_at = ? WHERE id = ? AND deleted = 0', [Date.now(), id])
    saveDatabase()
    return { success: true }
  })

  ipcMain.handle('savings:restore', (_event, id: string) => {
    db!.run(
      'UPDATE savings SET deleted = 0, revive_count = revive_count + 1, updated_at = ? WHERE id = ? AND deleted > 0',
      [Date.now(), id],
    )
    saveDatabase()
    return { success: true }
  })

  // 独立云同步：取本地全部（含已删除），格式与安卓/小程序 savings 快照一致
  ipcMain.handle('savings:getAllForSync', () => {
    return queryAll('SELECT * FROM savings').map((row) => {
      const r = savingsRowToItem(row)
      return {
        id: r.id,
        direction: r.direction,
        amount: r.amount,
        date: r.date,
        note: r.note,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        deleted: r.deleted > 0,
        reviveCount: r.revive_count,
      }
    })
  })

  ipcMain.handle('savings:applyCloud', (_event, items: any[]) => {
    let changed = 0
    for (const it of items || []) {
      const id = String(it?.id || '')
      if (!id) continue
      const updatedAt = Number(it.updatedAt) || 0
      const existing = queryOne('SELECT updated_at FROM savings WHERE id = ?', [id])
      if (existing && Number(existing.updated_at) >= updatedAt) continue
      const deleted = it.deleted ? 1 : 0
      if (!existing && deleted) continue
      db!.run(
        `INSERT OR REPLACE INTO savings (id, direction, amount, date, note, created_at, updated_at, deleted, revive_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          it.direction === 'out' ? 'out' : 'in',
          Number(it.amount) || 0,
          String(it.date || ''),
          String(it.note || ''),
          Number(it.createdAt) || updatedAt || Date.now(),
          updatedAt || Date.now(),
          deleted,
          Number(it.reviveCount) || 0,
        ],
      )
      changed++
    }
    if (changed > 0) saveDatabase()
    return { changed }
  })
}
