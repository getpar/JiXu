import { ipcMain, dialog } from 'electron'
import fs from 'fs'
import { db, SQL, DB_PATH, queryAll, saveDatabase, setDatabase } from './db'
import { localDateStr } from './util'
import { getMainWindow } from './windows'

export function registerBackupIpc(): void {
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
    const mainWindow = getMainWindow()
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
    const mainWindow = getMainWindow()
    if (!mainWindow) return { success: false }
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `计序_备份_${localDateStr()}.db`,
      filters: [{ name: '数据库文件', extensions: ['db'] }],
    })
    if (!result.canceled && result.filePath) {
      saveDatabase(true)
      fs.copyFileSync(DB_PATH, result.filePath)
      return { success: true, path: result.filePath }
    }
    return { success: false }
  })

  ipcMain.handle('backup:restore', async () => {
    const mainWindow = getMainWindow()
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
        setDatabase(new SQL!.Database(newBuffer))
        return { success: true }
      } catch {
        return { success: false, error: '文件无效或已损坏' }
      }
    }
    return { success: false }
  })
}
