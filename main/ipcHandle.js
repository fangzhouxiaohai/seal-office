const ipcHandlers = require('./preload')

// Handle IPC messages from renderer
ipcMain.handle('open-file', (event, args) => {
  const { filePath } = args
  console.log('ipcHandle open-file:', filePath)
  return filePath
})