const 最大回复字节 = 1024 * 1024

/** 按 SSE 事件解析，网络分块边界不等于文字或事件边界。 */
async function 读取模型响应(响应, 推送 = () => {}, 信号, 收到字节 = () => {}) {
  if (Number(响应.headers?.get?.('content-length')) > 最大回复字节) throw new Error('模型服务回复过大，已停止处理')
  const 流式 = 响应.headers?.get?.('content-type')?.includes('text/event-stream')
  let 内容 = '', 思考 = '', 缓冲 = '', 总字节 = 0, 已结束 = false
  const 处理消息 = (数据, 流 = true) => {
    if (数据?.error) throw new Error('模型服务返回流式错误，请检查模型权限、参数及服务状态')
    const 选项 = 数据?.choices?.[0]
    if (!选项) return
    if (选项.finish_reason && !['stop', 'tool_calls'].includes(选项.finish_reason)) throw new Error('模型服务回复被截断或拦截，未生成完整候选，请缩小范围或调整服务限制')
    if (选项.finish_reason === 'tool_calls') throw new Error('模型服务返回了不支持的工具调用，请使用聊天补全模型')
    if (选项.finish_reason === 'stop') 已结束 = true
    const 消息 = 流 ? 选项.delta : 选项.message
    if (!消息) return
    const 推理 = 消息.reasoning_content ?? 消息.reasoning
    if (typeof 推理 === 'string' && 推理) { 思考 += 推理; 推送({ 类型: '思考', 内容: 推理 }) }
    if (typeof 消息.content === 'string' && 消息.content) { 内容 += 消息.content; 推送({ 类型: '正文', 内容: 消息.content }) }
  }
  const 处理事件 = (帧) => {
    const 数据文本 = 帧.split(/\r?\n/).filter((行) => 行.startsWith('data:')).map((行) => 行.slice(5).trimStart()).join('\n').trim()
    if (!数据文本) return
    if (数据文本 === '[DONE]') { 已结束 = true; return }
    let 数据
    try { 数据 = JSON.parse(数据文本) } catch { throw new Error('模型服务流式数据格式无效') }
    处理消息(数据)
  }
  const 接收 = (文本) => {
    缓冲 += 文本
    if (!流式) return
    let 边界
    while ((边界 = /\r?\n\r?\n/.exec(缓冲))) {
      const 帧 = 缓冲.slice(0, 边界.index)
      缓冲 = 缓冲.slice(边界.index + 边界[0].length)
      处理事件(帧)
    }
  }
  if (响应.body?.getReader) {
    const 读取器 = 响应.body.getReader()
    const 解码 = new TextDecoder('utf-8', { fatal: true })
    const 停止 = () => { void 读取器.cancel().catch(() => {}) }
    信号?.addEventListener('abort', 停止, { once: true })
    try {
      while (true) {
        if (信号?.aborted) throw new Error('已停止生成')
        const { value, done } = await 读取器.read()
        if (信号?.aborted) throw new Error('已停止生成')
        if (done) break
        总字节 += value.byteLength
        if (总字节 > 最大回复字节) throw new Error('模型服务回复过大，已停止处理')
        收到字节()
        接收(解码.decode(value, { stream: true }))
        if (已结束) { await 读取器.cancel().catch(() => {}); break }
      }
      接收(解码.decode())
    } catch (错误) {
      await 读取器.cancel().catch(() => {})
      if (错误?.name === 'TypeError') throw new Error('模型服务流式连接中断或文字编码无效')
      throw 错误
    } finally { 信号?.removeEventListener('abort', 停止); 读取器.releaseLock() }
  } else {
    const 文本 = await 响应.text()
    if (Buffer.byteLength(文本, 'utf8') > 最大回复字节) throw new Error('模型服务回复过大，已停止处理')
    接收(文本)
  }
  if (流式) {
    if (缓冲.trim()) 处理事件(缓冲)
    if (!已结束) throw new Error('模型服务流式连接中断，未收到完成标识')
  } else {
    let 数据
    try { 数据 = JSON.parse(缓冲) } catch { throw new Error('模型服务返回的数据格式无效') }
    处理消息(数据, false)
  }
  if (!内容.trim()) throw new Error('模型服务未返回有效回复')
  return { 内容, 思考 }
}
module.exports = { 读取模型响应 }
