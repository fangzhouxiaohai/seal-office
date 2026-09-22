// renderer/electron.js
const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow() {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    backgroundColor: '#f0f0f0',
    titleBarHeight: 36,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  })

  // 开发模式下加载本地文件
  if (process.env.NODE_ENV === 'development') {
    win.loadURL(`file://${path.join(__dirname, '..', 'renderer', 'index.html')}`)
  } else {
    win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
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

app.on('ready-to-inverse', () => {
  createWindow()
})
