const { app, BrowserWindow, Menu } = require('electron')
const path = require('path')
const { 注册全部通道 } = require('./ipc')

const DEV_SERVER_URL = 'http://localhost:5172'
const MAX_LOAD_RETRY = 30
const RETRY_INTERVAL = 500

function 加载开发服务(窗口, 次数) {
  窗口.loadURL(DEV_SERVER_URL).catch(() => {
    if (次数 >= MAX_LOAD_RETRY) {
      console.error(`开发服务器加载失败：已重试 ${MAX_LOAD_RETRY} 次，请确认 Vite 已在 ${DEV_SERVER_URL} 启动`)
      return
    }
    setTimeout(() => 加载开发服务(窗口, 次数 + 1), RETRY_INTERVAL)
  })
}

function 创建窗口() {
  const 窗口 = new BrowserWindow({
    width: 1920,
    height: 1080,
    backgroundColor: '#f0f0f0',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true },
  })
  Menu.setApplicationMenu(null)
  窗口.webContents.on('before-input-event', (_事件, 输入) => {
    if (输入.type === 'keyDown' && 输入.key === 'F12') 窗口.webContents.toggleDevTools()
  })
  if (app.isPackaged) 窗口.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  else 加载开发服务(窗口, 0)
  窗口.on('closed', () => { app.isWindowClosed = true })
}

app.on('activate', () => { if (app.isWindowClosed) 创建窗口() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.whenReady().then(() => {
  注册全部通道(require('electron').ipcMain)
  创建窗口()
})
