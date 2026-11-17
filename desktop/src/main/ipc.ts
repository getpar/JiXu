import { ipcMain } from 'electron'
import { db, queryAll, queryOne, saveDatabase, oldToNew } from './db'
import { registerShortcut } from './windows'
import { registerRecurringIpc } from './recurring'
import { registerTodosIpc } from './todos'
import { registerSavingsIpc } from './savings'
import { registerBackupIpc } from './backup'

function registerCoreIpc(): void {
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
    created_at?: number // v0.8.7 同步导入时携带对端提交时刻（毫秒时间戳）；本机新记不传 = 用当前时间
  }) => {
    // 毫秒时间戳转本地 'YYYY-MM-DD HH:mm:ss'（与 datetime('now','localtime') 同格式，可字典序比较）
    let createdAtSql = ''
    if (data.created_at && Number.isFinite(data.created_at) && data.created_at > 0) {
      const d = new Date(data.created_at)
      const pad = (n: number): string => String(n).padStart(2, '0')
      createdAtSql = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    }
    if (createdAtSql) {
      db!.run(
        'INSERT INTO records (type, amount, category_key, subcategory_key, note, record_date, person, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [data.type || 'expense', data.amount, data.category_key, data.subcategory_key, data.note, data.record_date, data.person || '', createdAtSql]
      )
    } else {
      db!.run(
        'INSERT INTO records (type, amount, category_key, subcategory_key, note, record_date, person) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [data.type || 'expense', data.amount, data.category_key, data.subcategory_key, data.note, data.record_date, data.person || '']
      )
    }
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
    // v0.8.7 新行沿用旧行 created_at：编辑不改变"提交时间"，列表排序位置不跳
    db!.run(
      'INSERT INTO records (type, amount, category_key, subcategory_key, note, record_date, person, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [data.type, data.amount, data.category_key, data.subcategory_key, data.note, data.record_date, data.person || '', old.created_at || '']
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

  // v0.8.6 一键清空第 1 步：全部存活记录软删除（等同用户把它们全部删进回收站，
  // 随后同步会上云删除凭证；与"逐笔删除"的同步链路完全一致）
  ipcMain.handle('records:softDeleteAll', () => {
    const res = db!.exec('SELECT COUNT(*) FROM records WHERE deleted = 0')
    const marked = (res[0]?.values?.[0]?.[0] as number) || 0
    if (marked > 0) {
      db!.run('UPDATE records SET deleted = 1 WHERE deleted = 0')
      saveDatabase()
    }
    return { marked }
  })

  // v0.8.6 一键清空第 2 步：物理删除全部记录（含回收站），按指纹聚合生成注销凭条入待上传队列。
  // 每行的核销量与逐笔彻底删除同公式：1 张账单 +（回收站行再加 1+V 张凭证、V 张撤销凭条）
  ipcMain.handle('records:purgeAll', () => {
    const res = db!.exec('SELECT record_date, amount, subcategory_key, type, revive_count, deleted FROM records')
    const rows = (res[0]?.values || []) as [string, number, string, string, number, number][]
    const agg = new Map<string, { rec: number; tomb: number; rev: number; label: string }>()
    for (const [date, amount, subcat, type, reviveCount, deleted] of rows) {
      const key = `${date}|${amount}|${subcat || ''}|${type}`
      const a = agg.get(key) || { rec: 0, tomb: 0, rev: 0, label: `${date} ¥${amount}` }
      a.rec += 1
      if (deleted > 0) { a.tomb += 1 + (reviveCount || 0); a.rev += reviveCount || 0 }
      agg.set(key, a)
    }
    const ts = Date.now()
    let i = 0
    for (const [key, a] of agg) {
      db!.run(
        'INSERT OR REPLACE INTO sync_purges (pid, target_key, cancel_rec, cancel_tomb, cancel_rev, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [`ca_${ts}_${i++}`, key, a.rec, a.tomb, a.rev, `清空: ${a.label}`, ts],
      )
    }
    const cntRes = db!.exec('SELECT COUNT(*) FROM records')
    const removed = (cntRes[0]?.values?.[0]?.[0] as number) || 0
    db!.run('DELETE FROM records')
    if (removed > 0 || agg.size > 0) saveDatabase()
    return { removed, purgeKeys: agg.size }
  })

  // v0.8.5 同步引擎消费对端注销凭条：按指纹物理删除本地行（不产生新凭条，凭条已在云端）
  // v0.8.6 优先删回收站行，不够再删同号存活行 —— 堵住"对端离线错过删除→收到注销凭条后诈尸回传"的窗口
  ipcMain.handle('records:purgeLocal', (_event, parts: {
    date: string; amount: number; subcategoryKey: string; type: string
  }, count: number) => {
    db!.run(
      `DELETE FROM records WHERE id IN (
         SELECT id FROM records
         WHERE record_date = ? AND amount = ? AND subcategory_key = ? AND type = ?
         ORDER BY deleted DESC, id ASC
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
      `SELECT r.category_key, c.category_name, SUM(ROUND(r.amount * 100)) / 100.0 as total
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
    const row = queryOne(`SELECT COALESCE(SUM(ROUND(amount * 100)), 0) / 100.0 as total FROM records ${where}`, params)
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
      `SELECT record_date as date, SUM(ROUND(amount * 100)) / 100.0 as total FROM records ${where} GROUP BY record_date ORDER BY record_date`,
      params
    )
  })

  // 月度对比
  ipcMain.handle('stats:compareMonths', (_event, month1: string, month2: string) => {
    const m1 = queryAll(
      `SELECT r.category_key, c.category_name, SUM(ROUND(r.amount * 100)) / 100.0 as total
       FROM records r LEFT JOIN categories c ON r.category_key = c.category_key AND r.subcategory_key = c.subcategory_key
       WHERE r.deleted = 0 AND strftime('%Y-%m', r.record_date) = ? AND r.type = 'expense'
       GROUP BY r.category_key ORDER BY total DESC`, [month1]
    )
    const m2 = queryAll(
      `SELECT r.category_key, c.category_name, SUM(ROUND(r.amount * 100)) / 100.0 as total
       FROM records r LEFT JOIN categories c ON r.category_key = c.category_key AND r.subcategory_key = c.subcategory_key
       WHERE r.deleted = 0 AND strftime('%Y-%m', r.record_date) = ? AND r.type = 'expense'
       GROUP BY r.category_key ORDER BY total DESC`, [month2]
    )
    const t1 = queryOne("SELECT COALESCE(SUM(ROUND(amount * 100)),0) / 100.0 as total FROM records WHERE deleted=0 AND strftime('%Y-%m', record_date)=? AND type='expense'", [month1])?.total || 0
    const t2 = queryOne("SELECT COALESCE(SUM(ROUND(amount * 100)),0) / 100.0 as total FROM records WHERE deleted=0 AND strftime('%Y-%m', record_date)=? AND type='expense'", [month2])?.total || 0
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
}

// 添加快捷键设置 IPC（需要在 db 初始化之后）
export function registerShortcutIpc(): void {
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
}

export function registerIpcHandlers(): void {
  registerCoreIpc()
  registerSavingsIpc()
  registerBackupIpc()
  registerRecurringIpc()
  registerTodosIpc()
}
