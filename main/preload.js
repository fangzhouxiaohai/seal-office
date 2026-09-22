const { contextBridge, ipcMain } = require('electron')

// Expose IPC handlers to the renderer
contextBridge.exposeInMainWorld('ipcHandlers', {
  openFile: (filePath) => {
    // Handle file open request from renderer
    console.log('openFile:', filePath)
    return filePath
  }
})