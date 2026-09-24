const { contextBridge, ipcRenderer } = require('electron')

// Expose protected APIs to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // 原有 API
  openFile: (args) => ipcRenderer.invoke('open-file', args),
  
  // 文件操作 API
  showSaveDialog: (默认文件名) => ipcRenderer.invoke('file.showSaveDialog', 默认文件名),
  showOpenDialog: () => ipcRenderer.invoke('file.showOpenDialog'),
  saveToFile: (filePath, 内容) => ipcRenderer.invoke('file.saveToFile', filePath, 内容),
  readFile: (filePath) => ipcRenderer.invoke('file.readFile', filePath),
  
  // PDF 导出 API
  exportToPdf: (html内容, 默认文件名) => ipcRenderer.invoke('pdf.export', html内容, 默认文件名),
  
  // 系统 API
  setDefaultApp: () => ipcRenderer.invoke('system.setDefaultApp'),
  
  // 帮助文档 API
  getHelpContent: () => ipcRenderer.invoke('help.getContent'),
  
  // 获取应用信息
  getAppInfo: () => ipcRenderer.invoke('app.getInfo'),
})

// 监听来自主进程的消息
contextBridge.exposeInMainWorld('electronListener', {
  on: (channel, callback) => {
    const subscriptions = {
      'window-focus': () => ipcRenderer.on('window-focus', (_, ...args) => callback(...args)),
      'window-blur': () => ipcRenderer.on('window-blur', (_, ...args) => callback(...args)),
    }
    if (subscriptions[channel]) {
      return subscriptions[channel]()
    }
  },
  off: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback)
  }
})
