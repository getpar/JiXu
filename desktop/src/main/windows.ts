import { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage } from 'electron'
import path from 'path'
import fs from 'fs'

let mainWindow: BrowserWindow | null = null
let quickAddWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false  // 标记是否真正退出

// ---- 周期账单自动执行 → 渲染进程通知 ----

export interface AutoBillInfo {
  name: string     // 分类名，用于提示文案
  amount: number
  type: string
  nextDate: string // 自动推算出的下次到期日
}

let rendererReady = false
let pendingAutoNotify: AutoBillInfo[] = []

export function notifyAutoBills(list: AutoBillInfo[]): void {
  if (list.length === 0) return
  if (mainWindow && !mainWindow.isDestroyed() && rendererReady) {
    mainWindow.webContents.send('recurring:autoExecuted', list)
  } else {
    // 界面还没加载完，先排队，did-finish-load 后补发
    pendingAutoNotify.push(...list)
  }
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function setQuitting(v: boolean): void {
  isQuitting = v
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
<div class="header"><span class="icon">📒</span><span class="title">计序</span></div>
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

export function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280, height: 840, minWidth: 960, minHeight: 640,
    title: '计序',
    icon: getIconPath(),
    show: false,                 // 先建好、内容就绪再显示：消除「白屏一闪」
    backgroundColor: '#0A0B0D',  // 与深色主题同色，首帧不跳
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false,
    },
  })

  mainWindow.once('ready-to-show', () => { mainWindow?.show() })

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
    if (process.env.JIXU_DEVTOOLS === '1') mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

export function createQuickAddWindow(): void {
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

export function createTray(): void {
  const iconPath = getIconPath()
  const trayIcon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty()
  tray = new Tray(trayIcon)
  tray.setToolTip('计序 — 双击打开主窗口')

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus() } } },
    { type: 'separator' },
    { label: '退出计序', click: () => { app.exit(0) } },
  ])
  tray.setContextMenu(contextMenu)

  // 双击托盘图标显示窗口
  tray.on('double-click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus() }
  })
}

// ========== 快捷键管理 ==========

let currentShortcut = 'CommandOrControl+Shift+N'

export function registerShortcut(accelerator: string): void {
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
