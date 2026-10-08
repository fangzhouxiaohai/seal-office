const path = require('path')
const { app, safeStorage } = require('electron')
const { 注册文件通道 } = require('./fileChannel')
const { 注册Office通道 } = require('./officeChannel')
const { 注册Pdf通道 } = require('./pdfChannel')
const { 注册系统通道 } = require('./systemChannel')
const { 注册智能助手通道 } = require('./aiChannel')
const { 注册演示通道 } = require('./presentationChannel')
const { 注册演示智能通道 } = require('./presentationAiChannel')
const { 创建助手服务 } = require('../ai/assistant')
const { 创建录制服务 } = require('../ppt/recording')
const { 创建识别服务 } = require('../ppt/recognition')
const { 注册演示生成通道 } = require('./presentationGenerationChannel')
const { 注册云端通道 } = require('./cloudChannel')

/** 助手服务在同一个进程内只创建一次，演示识别与其他智能功能共用同一份设置与密钥。 */
function 创建共用助手服务(依赖 = {}) {
  if (依赖.助手服务) return 依赖.助手服务
  return 创建助手服务({
    配置路径: path.join(app.getPath('userData'), 'assistant-config.secure'),
    安全存储: safeStorage,
  })
}

function 注册全部通道(ipcMain, 依赖 = {}) {
  const 助手服务 = 创建共用助手服务(依赖)
  注册文件通道(ipcMain)
  注册Office通道(ipcMain)
  注册Pdf通道(ipcMain)
  注册系统通道(ipcMain, 依赖)
  // 演示智能与识别服务复用同一个助手服务实例，避免出现两套互不一致的模型设置。
  注册智能助手通道(ipcMain, { 助手服务 })
  注册演示通道(ipcMain, 依赖.资源存储, {
    会话: 依赖.会话,
    广播: 依赖.广播,
    录制服务: 依赖.录制服务 ?? 创建录制服务(),
    识别服务: 依赖.识别服务 ?? 创建识别服务({ 助手服务 }),
  })
  注册演示智能通道(ipcMain, { 助手服务, 用户数据目录: app.getPath('userData') })
  注册演示生成通道(ipcMain, { 助手服务, 用户数据目录: app.getPath('userData') })
  注册云端通道(ipcMain, { 助手服务 })
}

module.exports = { 注册全部通道, 创建共用助手服务 }
