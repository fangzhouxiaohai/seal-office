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
  ipcMain.handle('ai.getSession', 包装(async (标识) => {
    const 会话 = await 服务.读取会话(标识)
    if (!会话) return null
    return { 显示消息: 会话.显示消息, 摘要: 会话.摘要, 计划: 会话.计划, 压缩次数: 会话.压缩次数, 待确认候选: 会话.待确认候选 ?? null }
  }))
  ipcMain.handle('ai.clearSession', async (事件, 标识) => {
    if (进行中.has(事件.sender.id)) return { 成功: false, 错误: '请先停止当前任务再新建对话' }
    try { await 服务.清除会话(标识); return { 成功: true } }
    catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '对话记忆清除失败' } }
  })
  ipcMain.handle('ai.updateSessionPlan', async (事件, 标识, 计划) => {
    if (进行中.has(事件.sender.id)) return { 成功: false, 错误: '请等待当前任务完成再确认计划' }
    try { await 服务.更新会话计划(标识, 计划); return { 成功: true } }
    catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '计划状态保存失败' } }
  })
  ipcMain.handle('ai.submitToolResult', (事件, 结果) => {
    const 任务 = 进行中.get(事件.sender.id)
    if (!结果 || typeof 结果.成功 !== 'boolean' || !任务 || 任务.标识 !== 结果.请求标识 || 任务.控制器.signal.aborted) return { 成功: false, 错误: '工具结果不属于当前窗口的执行任务' }
    const 等待 = 任务.工具.get(结果.调用标识)
    if (!等待) return { 成功: false, 错误: '工具调用已经结束或标识不一致' }
    等待.完成({ 成功: 结果.成功, ...(结果.成功 ? { 数据: 结果.数据 } : { 错误: typeof 结果.错误 === 'string' ? 结果.错误 : '文件修改验证失败' }) })
    return { 成功: true }
  })
  ipcMain.handle('ai.bindSession', async (事件, 来源, 目标) => {
    if (进行中.has(事件.sender.id)) return { 成功: false, 错误: '请等待当前任务完成再绑定已保存文件的记忆' }
    try { await 服务.绑定会话(来源, 目标); return { 成功: true } }
    catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '文件对话记忆绑定失败' } }
  })
  ipcMain.handle('ai.discardSessionProposal', async (事件, 标识) => {
    if (进行中.has(事件.sender.id)) return { 成功: false, 错误: '请先停止当前任务再放弃候选' }
    try { await 服务.放弃会话候选(标识); return { 成功: true } }
    catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '候选记忆更新失败' } }
  })
  ipcMain.handle('ai.chat', async (事件, 输入) => {
    const 发送者 = 事件.sender
    const 标识 = 输入?.请求标识 ?? randomUUID()
    if (typeof 标识 !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(标识)) return { 成功: false, 错误: '助手请求标识无效' }
    if (进行中.has(发送者.id)) return { 成功: false, 错误: '请等待当前任务完成或停止后重试' }
    const 控制器 = new AbortController()
    const 任务 = { 标识, 控制器, 工具: new Map() }
    进行中.set(发送者.id, 任务)
    const 停止 = () => 控制器.abort()
    发送者.once('destroyed', 停止)
    发送者.once('render-process-gone', 停止)
    try {
      const 数据 = await 服务.对话(输入, {
        信号: 控制器.signal,
        推送: (片段) => { if (!发送者.isDestroyed() && !控制器.signal.aborted) 发送者.send('ai.stream', { 请求标识: 标识, ...片段 }) },
        执行工具: (输入工具) => new Promise((完成, 拒绝) => {
          if (控制器.signal.aborted || 发送者.isDestroyed()) return 拒绝(new Error('已停止生成'))
          if (输入工具.工具 !== 'propose_changes' || typeof 输入工具.调用标识 !== 'string' || !输入工具.调用标识 || 任务.工具.has(输入工具.调用标识)) return 拒绝(new Error('文件工具调用无效'))
          const 清理 = () => { clearTimeout(计时); 控制器.signal.removeEventListener('abort', 中止); 任务.工具.delete(输入工具.调用标识) }
          const 中止 = () => { 清理(); 拒绝(new Error('已停止生成')) }
          const 计时 = setTimeout(() => { 清理(); 拒绝(new Error('文件修改验证超时，请检查当前文件和窗口状态')) }, 300000)
          任务.工具.set(输入工具.调用标识, { 完成: (结果) => { 清理(); 完成(结果) }, 拒绝: (错误) => { 清理(); 拒绝(错误) } })
          控制器.signal.addEventListener('abort', 中止, { once: true })
          try { 发送者.send('ai.toolCall', { 请求标识: 标识, ...输入工具 }) }
          catch { 清理(); 拒绝(new Error('无法向当前窗口提交文件修改工具')) }
        }),
      })
      return { 成功: true, 数据 }
    } catch (错误) { return { 成功: false, 错误: 错误 instanceof Error ? 错误.message : '智能助手处理失败' } }
    finally {
      for (const 等待 of 任务.工具.values()) 等待.拒绝(new Error('助手任务已经结束'))
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
  return 服务
}

module.exports = { 注册智能助手通道 }
