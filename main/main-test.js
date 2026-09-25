const electron = require('electron')
console.log('Electron module:', electron)
console.log('Electron keys:', Object.keys(electron || {}))
console.log('app:', electron?.app)
console.log('BrowserWindow:', electron?.BrowserWindow)

// 退出
process.exit(0)
