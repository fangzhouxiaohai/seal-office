const 普通对象 = (值) => 值 !== null && typeof 值 === 'object' && !Array.isArray(值)
const 工具格式错误 = () => new Error('模型服务返回的工具调用格式无效，请检查模型能力及工具参数')

function 校验工具调用(调用) {
  if (!普通对象(调用) || typeof 调用.id !== 'string' || !调用.id || /[\s\u0000-\u001f\u007f]/u.test(调用.id)
    || 调用.type !== 'function' || !普通对象(调用.function)
    || typeof 调用.function.name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(调用.function.name)
    || typeof 调用.function.arguments !== 'string') throw 工具格式错误()
  return { id: 调用.id, type: 'function', function: { name: 调用.function.name, arguments: 调用.function.arguments } }
}

/** 按 SSE 事件解析，网络分块边界不等于文字或事件边界。 */
async function 读取模型响应(响应, 推送 = () => {}, 信号, 收到字节 = () => {}) {
  const 流式 = 响应.headers?.get?.('content-type')?.includes('text/event-stream')
  let 内容 = '', 思考 = '', 缓冲 = '', 已结束 = false, 工具结束 = false
  const 工具增量 = new Map()
  const 收集工具调用 = (调用列表, 流) => {
    if (调用列表 === undefined || 调用列表 === null) return
    if (!Array.isArray(调用列表)) throw 工具格式错误()
    调用列表.forEach((调用, 序号) => {
      if (!流) { 工具增量.set(序号, 校验工具调用(调用)); return }
      if (!普通对象(调用) || !Number.isSafeInteger(调用.index) || 调用.index < 0) throw 工具格式错误()
      const 合并 = 工具增量.get(调用.index) ?? { id: '', function: {} }
      if (调用.id != null) {
        if (typeof 调用.id !== 'string') throw 工具格式错误()
        合并.id += 调用.id
      }
      if (调用.type != null) {
        if (调用.type !== 'function') throw 工具格式错误()
        合并.type = 调用.type
      }
      if (调用.function != null) {
        if (!普通对象(调用.function)) throw 工具格式错误()
        for (const 字段 of ['name', 'arguments']) {
          if (调用.function[字段] == null) continue
          if (typeof 调用.function[字段] !== 'string') throw 工具格式错误()
          合并.function[字段] = (合并.function[字段] ?? '') + 调用.function[字段]
        }
      }
      工具增量.set(调用.index, 合并)
    })
  }
  const 处理消息 = (数据, 流 = true) => {
    if (数据?.error) throw new Error('模型服务返回流式错误，请检查模型权限、参数及服务状态')
    const 选项 = 数据?.choices?.[0]
    if (!选项) return
    if (选项.finish_reason && !['stop', 'tool_calls'].includes(选项.finish_reason)) throw new Error('模型服务回复被截断或拦截，未生成完整候选，请缩小范围或调整服务限制')
    const 消息 = 流 ? 选项.delta : 选项.message
    if (消息) {
      收集工具调用(消息.tool_calls, 流)
      const 推理 = 消息.reasoning_content ?? 消息.reasoning
      if (typeof 推理 === 'string' && 推理) { 思考 += 推理; 推送({ 类型: '思考', 内容: 推理 }) }
      if (typeof 消息.content === 'string' && 消息.content) { 内容 += 消息.content; 推送({ 类型: '正文', 内容: 消息.content }) }
    }
    if (选项.finish_reason === 'tool_calls') 工具结束 = true
    if (选项.finish_reason === 'stop' || 工具结束) 已结束 = true
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
    if (已结束) return
    缓冲 += 文本
    if (!流式) return
    let 边界
    while (!已结束 && (边界 = /\r?\n\r?\n/.exec(缓冲))) {
      const 帧 = 缓冲.slice(0, 边界.index)
      缓冲 = 缓冲.slice(边界.index + 边界[0].length)
      处理事件(帧)
    }
    if (已结束) 缓冲 = ''
  }
  if (信号?.aborted) throw new Error('已停止生成')
  if (响应.body?.getReader) {
    const 读取器 = 响应.body.getReader()
    const 解码 = new TextDecoder('utf-8', { fatal: true })
    const 解码分块 = (字节) => {
      if (!流式) { 接收(解码.decode(字节, { stream: true })); return }
      // 逐行解码以便完成事件到达后直接丢弃剩余字节，避免后续垃圾污染有效回复。
      let 起点 = 0
      for (let 位置 = 0; 位置 < 字节.byteLength; 位置 += 1) {
        if (字节[位置] !== 10) continue
        接收(解码.decode(字节.subarray(起点, 位置 + 1), { stream: true }))
        if (已结束 || 信号?.aborted) return
        起点 = 位置 + 1
      }
      if (起点 < 字节.byteLength) 接收(解码.decode(字节.subarray(起点), { stream: true }))
    }
    const 停止 = () => { void 读取器.cancel().catch(() => {}) }
    信号?.addEventListener('abort', 停止, { once: true })
    try {
      while (true) {
        if (信号?.aborted) throw new Error('已停止生成')
        const { value, done } = await 读取器.read()
        if (信号?.aborted) throw new Error('已停止生成')
        if (done) break
        收到字节()
        if (信号?.aborted) throw new Error('已停止生成')
        解码分块(value)
        if (信号?.aborted) throw new Error('已停止生成')
        if (已结束) { await 读取器.cancel().catch(() => {}); break }
      }
      if (!已结束) 接收(解码.decode())
    } catch (错误) {
      await 读取器.cancel().catch(() => {})
      if (错误?.name === 'TypeError') throw new Error('模型服务流式连接中断或文字编码无效')
      throw 错误
    } finally { 信号?.removeEventListener('abort', 停止); 读取器.releaseLock() }
  } else {
    const 文本 = await 响应.text()
    if (信号?.aborted) throw new Error('已停止生成')
    接收(文本)
  }
  if (流式) {
    if (!已结束 && 缓冲.trim()) 处理事件(缓冲)
    if (!已结束) throw new Error('模型服务流式连接中断，未收到完成标识')
  } else {
    let 数据
    try { 数据 = JSON.parse(缓冲) } catch { throw new Error('模型服务返回的数据格式无效') }
    处理消息(数据, false)
  }
  if (信号?.aborted) throw new Error('已停止生成')
  const 工具调用 = [...工具增量.entries()].sort(([甲], [乙]) => 甲 - 乙).map(([, 调用]) => 校验工具调用(调用))
  if (工具结束 && !工具调用.length) throw 工具格式错误()
  if (!内容.trim() && !工具调用.length) throw new Error('模型服务未返回有效回复')
  return 工具调用.length ? { 内容, 思考, 工具调用 } : { 内容, 思考 }
}
module.exports = { 读取模型响应 }
