const { 注册文件通道 } = require('./fileChannel')
const { 注册Office通道 } = require('./officeChannel')
const { 注册Pdf通道 } = require('./pdfChannel')
const { 注册系统通道 } = require('./systemChannel')
const { 注册智能助手通道 } = require('./aiChannel')
const { 注册演示通道 } = require('./presentationChannel')

function 注册全部通道(ipcMain) {
  注册文件通道(ipcMain)
  注册Office通道(ipcMain)
  注册Pdf通道(ipcMain)
  注册系统通道(ipcMain)
  注册智能助手通道(ipcMain)
  注册演示通道(ipcMain)
}

module.exports = { 注册全部通道 }
