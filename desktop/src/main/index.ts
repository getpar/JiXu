import { app, BrowserWindow } from 'electron'
import path from 'path'
import { initDatabase, queryOne, saveDatabase } from './db'
import { registerIpcHandlers, registerShortcutIpc } from './ipc'
import { createWindow, createTray, registerShortcut, getMainWindow, setQuitting } from './windows'
import { checkRecurringBills } from './recurring'

// 固定数据目录为 daily-notes：应用改名（productName 由「每日小记」改为「计序」）后，
// 若不固定，打包版会去新的目录找数据，用户的旧账本会"凭空消失"。这里锁死老目录，保证数据不丢。
app.setPath('userData', path.join(app.getPath('appData'), 'daily-notes'))

// ========== 生命周期 ==========

// 单实例锁：确保只有一个程序实例运行
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // 用户尝试打开第二个实例时，激活第一个窗口
    const mainWindow = getMainWindow()
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
  await initDatabase()
  registerIpcHandlers()

  // 添加快捷键设置 IPC（需要在 db 初始化之后）
  registerShortcutIpc()

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
    else {
      const mainWindow = getMainWindow()
      if (mainWindow) { mainWindow.show(); mainWindow.focus() }
    }
  })
})

// 标记真正的退出
app.on('before-quit', () => {
  setQuitting(true)
  saveDatabase(true)
})

app.on('window-all-closed', () => {
  // 有托盘时不退出，保持后台运行
  // macOS 特殊处理，其他平台托盘运行时不退出
})
}  // 结束 else 块（单实例锁）
