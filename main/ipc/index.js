const { app } = require('electron')
const { 注册文件通道 } = require('./fileChannel')
const { 注册Office通道 } = require('./officeChannel')
const { 注册Pdf通道 } = require('./pdfChannel')
const { 注册系统通道 } = require('./systemChannel')
const { 注册智能助手通道 } = require('./aiChannel')
const { 注册演示通道 } = require('./presentationChannel')
const { 注册演示智能通道 } = require('./presentationAiChannel')
const { 注册演示生成通道 } = require('./presentationGenerationChannel')

function 注册全部通道(ipcMain) {
  注册文件通道(ipcMain)
  注册Office通道(ipcMain)
  注册Pdf通道(ipcMain)
  注册系统通道(ipcMain)
  // 演示智能服务复用同一个助手服务实例，避免出现两套互不一致的模型设置。
  const 助手服务 = 注册智能助手通道(ipcMain)
  注册演示通道(ipcMain)
  注册演示智能通道(ipcMain, { 助手服务, 用户数据目录: app.getPath('userData') })
  注册演示生成通道(ipcMain, { 助手服务, 用户数据目录: app.getPath('userData') })
}

module.exports = { 注册全部通道 }
