const { app, BrowserWindow, Menu, dialog } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')
const { 注册全部通道 } = require('./ipc')
const { 获取未保存风险数量 } = require('./ipc/systemChannel')

const DEV_SERVER_URL = 'http://localhost:5172'
const MAX_LOAD_RETRY = 30
const RETRY_INTERVAL = 500

// 单实例锁：二次启动唤起已有窗口，避免同一文档被两个实例并发打开
const 获得单实例锁 = app.requestSingleInstanceLock()
let 主窗口 = null

function 加载开发服务(窗口, 次数) {
  窗口.loadURL(DEV_SERVER_URL).catch(() => {
    if (次数 >= MAX_LOAD_RETRY) {
      console.error(`开发服务器加载失败：已重试 ${MAX_LOAD_RETRY} 次，请确认 Vite 已在 ${DEV_SERVER_URL} 启动`)
      return
    }
    setTimeout(() => 加载开发服务(窗口, 次数 + 1), RETRY_INTERVAL)
  })
}

function 安装关闭保护(窗口) {
  let 已确认退出 = false
  窗口.on('close', (事件) => {
    if (已确认退出) return
    const 数量 = 获取未保存风险数量(窗口)
    if (数量 === 0) return
    事件.preventDefault()
    const 选择 = dialog.showMessageBoxSync(窗口, {
      type: 'warning',
      title: '确认退出',
      message: `还有 ${数量} 个文档可能包含未保存的修改`,
      detail: '放弃修改并退出后，未保存的内容可能丢失。',
      buttons: ['取消', '放弃修改并退出'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })
    if (选择 !== 1) return
    已确认退出 = true
    窗口.close()
  })
}

function 安装导航保护(窗口) {
  const 应用地址 = new URL(app.isPackaged
    ? pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).href
    : DEV_SERVER_URL)
  窗口.webContents.on('will-navigate', (事件, 目标地址) => {
    try {
      const 目标 = new URL(目标地址)
      if (目标.protocol === 应用地址.protocol && 目标.origin === 应用地址.origin &&
        目标.pathname === 应用地址.pathname && 目标.search === 应用地址.search) return
    } catch {
      // 无效地址与外部地址统一阻止，避免远端页面获得应用预加载桥接。
    }
    事件.preventDefault()
  })
  窗口.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
}

function 创建窗口() {
  const 窗口 = new BrowserWindow({
    width: 1920,
    height: 1080,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#f0f0f0',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true },
  })
  主窗口 = 窗口
  安装关闭保护(窗口)
  安装导航保护(窗口)
  Menu.setApplicationMenu(null)
  窗口.webContents.on('before-input-event', (_事件, 输入) => {
    if (输入.type !== 'keyDown') return
    // F12 保留给 WPS 惯例的「另存为」；DevTools 仅在开发态经 F12 / Ctrl+Shift+I 打开
    const 是开发态 = !app.isPackaged
    if (是开发态 && 输入.key === 'F12') 窗口.webContents.toggleDevTools()
    if (是开发态 && 输入.key === 'I' && (输入.control || 输入.metaKey) && 输入.shift) 窗口.webContents.toggleDevTools()
  })
  if (app.isPackaged) 窗口.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  else 加载开发服务(窗口, 0)
  窗口.on('closed', () => {
    if (主窗口 === 窗口) 主窗口 = null
    app.isWindowClosed = true
  })
}

app.on('second-instance', () => {
  if (主窗口 !== null) {
    if (主窗口.isMinimized()) 主窗口.restore()
    主窗口.focus()
  }
})

app.on('activate', () => { if (app.isWindowClosed) 创建窗口() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.whenReady().then(() => {
  注册全部通道(require('electron').ipcMain)
  创建窗口()
})

if (!获得单实例锁) {
  app.quit()
}

module.exports = { 安装关闭保护, 安装导航保护 }
