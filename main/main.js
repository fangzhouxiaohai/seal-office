// main/main.js
const { app, BrowserWindow, Menu } = require('electron')
const path = require('path')

// 引入 IPC 处理器
require('./ipcHandle')

// Vite 开发服务器地址，需与 vite.config.js 中的 server 配置保持一致
const DEV_SERVER_URL = 'http://localhost:5172'
// 开发模式下等待 Vite 就绪的最大重试次数
const MAX_LOAD_RETRY = 30
// 每次重试的间隔毫秒数
const RETRY_INTERVAL = 500

/**
 * 加载开发服务器地址；若 Vite 尚未启动完成导致连接失败，则按间隔重试
 */
function loadDevServer(win, attempt) {
  win.loadURL(DEV_SERVER_URL).catch(() => {
    if (attempt >= MAX_LOAD_RETRY) {
      console.error(`开发服务器加载失败：已重试 ${MAX_LOAD_RETRY} 次，请确认 Vite 已在 ${DEV_SERVER_URL} 启动`)
      return
    }
    setTimeout(() => loadDevServer(win, attempt + 1), RETRY_INTERVAL)
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    backgroundColor: '#f0f0f0',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  // 移除 Electron 默认的英文菜单栏，界面文案不出现外文，观感与 WPS 保持一致
  Menu.setApplicationMenu(null)

  // 菜单栏已移除，单独保留 F12 打开开发者工具的能力，便于排查问题
  win.webContents.on('before-input-event', (事件, 输入) => {
    if (输入.type === 'keyDown' && 输入.key === 'F12') {
      win.webContents.toggleDevTools()
    }
  })

  // 未打包时运行的是源码，加载 Vite 开发服务器；打包后加载构建产物
  if (app.isPackaged) {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  } else {
    loadDevServer(win, 0)
  }

  win.on('closed', () => {
    app.isWindowClosed = true
  })
}

app.on('activate', () => {
  if (app.isWindowClosed) {
    createWindow()
  }
})

app.on('window-all-closed', () => {
  // Windows 与 Linux 下关闭全部窗口即退出应用
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('ready', () => {
  createWindow()
})
