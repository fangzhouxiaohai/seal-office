const path = require('path')
const { app, safeStorage } = require('electron')
const { 创建助手服务 } = require('../ai/assistant')

function 注册智能助手通道(ipcMain) {
  const 服务 = 创建助手服务({
    配置路径: path.join(app.getPath('userData'), 'assistant-config.secure'),
    安全存储: safeStorage,
  })
  const 包装 = (处理) => async (_事件, 输入) => {
    try { return { 成功: true, 数据: await 处理(输入) } }
    catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '智能助手操作失败' } }
  }
  ipcMain.handle('ai.getConfig', 包装(() => 服务.读取配置()))
  ipcMain.handle('ai.saveConfig', 包装((输入) => 服务.保存配置(输入)))
  ipcMain.handle('ai.clearConfig', 包装(() => 服务.清除配置()))
  ipcMain.handle('ai.chat', 包装((输入) => 服务.对话(输入)))
}

module.exports = { 注册智能助手通道 }
