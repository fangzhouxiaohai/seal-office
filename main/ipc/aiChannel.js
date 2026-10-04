const path = require('path')
const { app, safeStorage } = require('electron')
const { 创建助手服务 } = require('../ai/assistant')
const { randomUUID } = require('crypto')

function 注册智能助手通道(ipcMain, { 助手服务 } = {}) {
  const 服务 = 助手服务 || 创建助手服务({
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
  const 进行中 = new Map()
  ipcMain.handle('ai.chat', async (事件, 输入) => {
    const 发送者 = 事件.sender
    const 标识 = 输入?.请求标识 ?? randomUUID()
    if (typeof 标识 !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(标识)) return { 成功: false, 错误: '助手请求标识无效' }
    if (进行中.has(发送者.id)) return { 成功: false, 错误: '请等待当前任务完成或停止后重试' }
    const 控制器 = new AbortController()
    进行中.set(发送者.id, { 标识, 控制器 })
    const 停止 = () => 控制器.abort()
    发送者.once('destroyed', 停止)
    发送者.once('render-process-gone', 停止)
    try {
      const 数据 = await 服务.对话(输入, {
        信号: 控制器.signal,
        推送: (片段) => { if (!发送者.isDestroyed() && !控制器.signal.aborted) 发送者.send('ai.stream', { 请求标识: 标识, ...片段 }) },
      })
      return { 成功: true, 数据 }
    } catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '智能助手处理失败' } }
    finally {
      进行中.delete(发送者.id)
      发送者.removeListener('destroyed', 停止)
      发送者.removeListener('render-process-gone', 停止)
    }
  })
  ipcMain.handle('ai.cancel', (事件, 标识) => {
    const 任务 = 进行中.get(事件.sender.id)
    if (!任务 || 任务.标识 !== 标识) return { 成功: false, 错误: '当前任务已结束或请求标识不一致' }
    任务.控制器.abort()
    return { 成功: true }
  })
}

module.exports = { 注册智能助手通道 }
