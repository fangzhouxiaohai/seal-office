const { 读取模型响应 } = require('./streamResponse')

function 流响应(文本, 步长 = 7) {
  const 字节 = new TextEncoder().encode(文本)
  let 位置 = 0
  return new Response(new ReadableStream({ pull(控制) {
    if (位置 >= 字节.length) return 控制.close()
    控制.enqueue(字节.slice(位置, 位置 += 步长))
  } }), { headers: { 'Content-Type': 'text/event-stream' } })
}
const 事件 = (数据) => `data: ${JSON.stringify(数据)}\r\n\r\n`
const 完整事件 = (增量, 结束 = null) => 事件({ id: 'chatcmpl-20261004-long-stream-response', object: 'chat.completion.chunk', created: 1791086400, model: 'deepseek-flash', choices: [{ index: 0, delta: 增量, finish_reason: 结束 }], usage: null, system_fingerprint: 'fp-long-stream' })

describe('模型流式响应', () => {
  it.each([false, true])('完整字段的长思考流不会因传输包装超过 1 MB 中止（长度头：%s）', async (包含长度头) => {
    const 思考片段 = '检查。'
    const 次数 = 6000
    const 正文 = JSON.stringify({ 回复: '已核对当前文件。', 修改: [] })
    const 文本 = 完整事件({ reasoning_content: 思考片段 }).repeat(次数) + 完整事件({ content: 正文 }, 'stop') + 'data: [DONE]\n\n'
    expect(Buffer.byteLength(文本)).toBeGreaterThan(1024 * 1024)
    expect(Buffer.byteLength(思考片段.repeat(次数))).toBeLessThan(100000)
    const 原响应 = 流响应(文本, 8192)
    const 响应 = 包含长度头 ? new Response(原响应.body, { headers: { 'Content-Type': 'text/event-stream', 'Content-Length': String(Buffer.byteLength(文本)) } }) : 原响应
    const 结果 = await 读取模型响应(响应)
    expect(结果).toEqual({ 内容: 正文, 思考: 思考片段.repeat(次数) })
  })

  it('心跳传输超过 1 MB 仍继续接收完整正文', async () => {
    const 文本 = (':' + ' '.repeat(1024) + '\n\n').repeat(1100) + 完整事件({ content: '完整回复' }, 'stop')
    expect((await 读取模型响应(流响应(文本, 8192))).内容).toBe('完整回复')
  })

  it('普通 JSON 的有效长思考与正文不按旧传输限制拒绝', async () => {
    const 思考 = '核对原文。'.repeat(80000)
    const 正文 = JSON.stringify({ 回复: '已经核对。', 修改: [] })
    const 文本 = JSON.stringify({ choices: [{ message: { content: 正文, reasoning_content: 思考 }, finish_reason: 'stop' }] })
    expect(Buffer.byteLength(文本)).toBeGreaterThan(1024 * 1024)
    expect(await 读取模型响应(new Response(文本, { headers: { 'Content-Type': 'application/json' } }))).toEqual({ 内容: 正文, 思考 })
  })
  it('跨字节中文和分帧分别传递真实思考与正文', async () => {
    const 收到 = []
    const 文本 = ': keepalive\n\n' + 事件({ choices: [{ delta: { reasoning_content: '分析原文' } }] })
      + 事件({ choices: [{ delta: { content: '{"回复":"建议' } }] })
      + 事件({ choices: [{ delta: { content: '调整标题","修改":[]}' }, finish_reason: 'stop' }] }) + 'data: [DONE]\n\n'
    const 结果 = await 读取模型响应(流响应(文本, 1), (项) => 收到.push(项))
    expect(结果).toEqual({ 内容: '{"回复":"建议调整标题","修改":[]}', 思考: '分析原文' })
    expect(收到.filter((项) => 项.类型 === '思考').map((项) => 项.内容).join('')).toBe('分析原文')
    expect(收到.filter((项) => 项.类型 === '正文')).toHaveLength(2)
  })
  it('普通 JSON 接口保留正文及服务商返回的思考', async () => {
    const 结果 = await 读取模型响应(new Response(JSON.stringify({ choices: [{ message: { content: '回复', reasoning: '摘要' } }] }), { headers: { 'Content-Type': 'application/json' } }))
    expect(结果).toEqual({ 内容: '回复', 思考: '摘要' })
  })
  it('流未结束或长度耗尽不当成成功回复', async () => {
    await expect(读取模型响应(流响应(事件({ choices: [{ delta: { content: '半截' } }] })))).rejects.toThrow('中断')
    await expect(读取模型响应(流响应(事件({ choices: [{ delta: { content: '半截' }, finish_reason: 'length' }] })))).rejects.toThrow('截断')
  })
  it('拒绝空回复、流错误和非法数据', async () => {
    await expect(读取模型响应(流响应('data: [DONE]\n\n'))).rejects.toThrow('有效回复')
    await expect(读取模型响应(流响应(事件({ error: { code: 'invalid_parameter' } })))).rejects.toThrow('错误')
    await expect(读取模型响应(new Response('x'.repeat(1024 * 1024 + 1)))).rejects.toThrow('数据格式无效')
    await expect(读取模型响应(流响应('data: {非法数据}\n\n'))).rejects.toThrow('流式数据格式无效')
  })
  it('真实正文和思考均超过旧限制时保留完整结果', async () => {
    const 正文 = '完整正文。'.repeat(80000)
    const 思考 = '逐项核对。'.repeat(80000)
    const 文本 = 完整事件({ reasoning_content: 思考 }) + 完整事件({ content: 正文 }, 'stop')
    expect(Buffer.byteLength(正文)).toBeGreaterThan(1024 * 1024)
    expect(Buffer.byteLength(思考)).toBeGreaterThan(1024 * 1024)
    expect(await 读取模型响应(流响应(文本, 8192))).toEqual({ 内容: 正文, 思考 })
  })
  it('按索引合并多个原生工具调用的跨帧字段及中文参数', async () => {
    const 文本 = 事件({ choices: [{ delta: { reasoning_content: '先读取再修改', tool_calls: [
      { index: 1, id: 'call_', type: 'function', function: { name: 'apply_', arguments: '{"标题":"重' } },
      { index: 0, id: 'call_read', type: 'function', function: { name: 'read_document', arguments: '{"范围":' } },
    ] } }] }) + 事件({ choices: [{ delta: { tool_calls: [
      { index: 0, function: { arguments: '"全文"}' } },
      { index: 1, id: 'edit', function: { name: 'changes', arguments: '新排版"}' } },
    ] }, finish_reason: 'tool_calls' }] })
    expect(await 读取模型响应(流响应(文本, 1))).toEqual({ 内容: '', 思考: '先读取再修改', 工具调用: [
      { id: 'call_read', type: 'function', function: { name: 'read_document', arguments: '{"范围":"全文"}' } },
      { id: 'call_edit', type: 'function', function: { name: 'apply_changes', arguments: '{"标题":"重新排版"}' } },
    ] })
  })
  it('普通响应保留原生工具调用及同时返回的正文', async () => {
    const 工具调用 = [{ id: 'call_read', type: 'function', function: { name: 'read_document', arguments: '{"范围":"全文"}' } }]
    const 文本 = JSON.stringify({ choices: [{ message: { content: '先读取全文', tool_calls: 工具调用 }, finish_reason: 'tool_calls' }] })
    expect(await 读取模型响应(new Response(文本))).toEqual({ 内容: '先读取全文', 思考: '', 工具调用 })
  })
  it('工具增量中的可空字段不覆盖首帧标识、名称和已收到参数', async () => {
    const 文本 = 事件({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_read', type: 'function', function: { name: 'read_document', arguments: '{' } }] } }] })
      + 事件({ choices: [{ delta: { tool_calls: [{ index: 0, id: null, type: null, function: { name: null, arguments: '"offset":0}' } }] } }] })
      + 事件({ choices: [{ delta: { tool_calls: [{ index: 0, id: null, type: null, function: null }] }, finish_reason: 'tool_calls' }] })
    expect((await 读取模型响应(流响应(文本))).工具调用).toEqual([{ id: 'call_read', type: 'function', function: { name: 'read_document', arguments: '{"offset":0}' } }])
  })
  it('普通响应允许仅包含有效原生工具调用', async () => {
    const 工具调用 = [{ id: 'call_read', type: 'function', function: { name: 'read_document', arguments: '{}' } }]
    const 文本 = JSON.stringify({ choices: [{ message: { content: null, tool_calls: 工具调用 }, finish_reason: 'tool_calls' }] })
    expect(await 读取模型响应(new Response(文本))).toEqual({ 内容: '', 思考: '', 工具调用 })
  })
  it('参数保持原始字符串，具体解析留给工具运行器', async () => {
    const 工具调用 = [{ id: 'call_read', type: 'function', function: { name: 'read_document', arguments: '{未完成参数' } }]
    const 文本 = 事件({ choices: [{ delta: { tool_calls: 工具调用.map((项, index) => ({ ...项, index })) }, finish_reason: 'tool_calls' }] })
    expect((await 读取模型响应(流响应(文本))).工具调用).toEqual(工具调用)
  })
  it.each([
    { id: '', type: 'function', function: { name: 'read_document', arguments: '{}' } },
    { id: 'call read', type: 'function', function: { name: 'read_document', arguments: '{}' } },
    { id: 'call_read', type: 'other', function: { name: 'read_document', arguments: '{}' } },
    { id: 'call_read', type: 'function', function: { name: '', arguments: '{}' } },
    { id: 'call_read', type: 'function', function: { name: 'read document', arguments: '{}' } },
    { id: 'call_read', type: 'function', function: { name: 'read_document', arguments: {} } },
    { id: 'call_read', type: 'function', function: { name: 'read_document' } },
  ])('普通响应拒绝工具调用非法基础形状：%j', async (调用) => {
    const 文本 = JSON.stringify({ choices: [{ message: { content: '正文', tool_calls: [调用] }, finish_reason: 'stop' }] })
    await expect(读取模型响应(new Response(文本))).rejects.toThrow('工具调用')
  })
  it.each([
    { index: -1, id: 'call_read', type: 'function', function: { name: 'read_document', arguments: '{}' } },
    { index: 0.5, id: 'call_read', type: 'function', function: { name: 'read_document', arguments: '{}' } },
    { index: 0, id: 1, type: 'function', function: { name: 'read_document', arguments: '{}' } },
    { index: 0, id: 'call_read', type: 'function', function: { name: 'read_document', arguments: [] } },
    { index: 0, id: 'call_read', type: 'function', function: null },
  ])('流式响应拒绝工具增量非法基础形状：%j', async (调用) => {
    const 文本 = 事件({ choices: [{ delta: { content: '正文', tool_calls: [调用] }, finish_reason: 'stop' }] })
    await expect(读取模型响应(流响应(文本))).rejects.toThrow('工具调用')
  })
  it('拒绝仅声明工具结束但没有有效调用的回复', async () => {
    const 文本 = 事件({ choices: [{ delta: { content: '正文' }, finish_reason: 'tool_calls' }] })
    await expect(读取模型响应(流响应(文本))).rejects.toThrow('工具调用')
  })
  it('工具流发生长度截断时不执行已收到的调用', async () => {
    const 文本 = 事件({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_read', type: 'function', function: { name: 'read_document', arguments: '{}' } }] }, finish_reason: 'length' }] })
    await expect(读取模型响应(流响应(文本))).rejects.toThrow('截断')
  })
  it.each(['stop', 'tool_calls'])('完成帧之后忽略同一网络分块中的后续垃圾及用量事件：%s', async (结束) => {
    const 工具调用 = [{ id: 'call_read', type: 'function', function: { name: 'read_document', arguments: '{}' } }]
    const 增量 = 结束 === 'tool_calls' ? { tool_calls: 工具调用.map((项, index) => ({ ...项, index })) } : { content: '完整回复' }
    const 文本 = 事件({ choices: [{ delta: 增量, finish_reason: 结束 }] }) + 事件({ choices: [], usage: { total_tokens: 100 } }) + 'data: {后续垃圾}\n\n残留垃圾'
    const 结果 = await 读取模型响应(流响应(文本, Buffer.byteLength(文本)))
    expect(结果).toEqual(结束 === 'tool_calls' ? { 内容: '', 思考: '', 工具调用 } : { 内容: '完整回复', 思考: '' })
  })
  it('无读取器的完整流在完成标识后忽略残留垃圾', async () => {
    const 文本 = 事件({ choices: [{ delta: { content: '完整回复' } }] }) + 'data: [DONE]\n\ndata: {后续垃圾}\n\n'
    const 响应 = { headers: new Headers({ 'Content-Type': 'text/event-stream' }), text: async () => 文本 }
    expect(await 读取模型响应(响应)).toEqual({ 内容: '完整回复', 思考: '' })
  })
  it('非法文字编码仍报错并释放读取器', async () => {
    const 取消 = vi.fn()
    const 响应 = new Response(new ReadableStream({ start(控制) { 控制.enqueue(Uint8Array.of(0xff)) }, cancel: 取消 }), { headers: { 'Content-Type': 'text/event-stream' } })
    await expect(读取模型响应(响应)).rejects.toThrow('文字编码无效')
    expect(取消).toHaveBeenCalled()
    expect(响应.body.locked).toBe(false)
  })
  it('完成事件后的非法编码字节不影响同一分块中的有效回复', async () => {
    const 完成 = new TextEncoder().encode(事件({ choices: [{ delta: { content: '完整回复' }, finish_reason: 'stop' }] }))
    const 取消 = vi.fn()
    const 响应 = new Response(new ReadableStream({ start(控制) { 控制.enqueue(Uint8Array.from([...完成, 0xff])) }, cancel: 取消 }), { headers: { 'Content-Type': 'text/event-stream' } })
    expect(await 读取模型响应(响应)).toEqual({ 内容: '完整回复', 思考: '' })
    expect(取消).toHaveBeenCalled()
    expect(响应.body.locked).toBe(false)
  })
  it('在最后正文回调中停止时仍返回停止结果并释放读取器', async () => {
    const 控制器 = new AbortController()
    const 响应 = 流响应(事件({ choices: [{ delta: { content: '完整回复' }, finish_reason: 'stop' }] }), 4096)
    await expect(读取模型响应(响应, () => 控制器.abort(), 控制器.signal)).rejects.toThrow('已停止')
    expect(响应.body.locked).toBe(false)
  })
  it('多行事件及结束前最后一帧正常解析', async () => {
    const 流 = 'data: {"choices":\ndata: [{"delta":{"content":"多行正文"},"finish_reason":"stop"}]}'
    expect((await 读取模型响应(流响应(流))).内容).toBe('多行正文')
  })
  it('停止时取消仍在等待的响应读取', async () => {
    const 控制器 = new AbortController(), 取消 = vi.fn()
    const 响应 = new Response(new ReadableStream({ start(控制) { 控制.enqueue(new TextEncoder().encode(事件({ choices: [{ delta: { reasoning_content: '正在分析' } }] }))) }, cancel: 取消 }), { headers: { 'Content-Type': 'text/event-stream' } })
    const 结果 = 读取模型响应(响应, () => 控制器.abort(), 控制器.signal)
    await expect(结果).rejects.toThrow('已停止')
    expect(取消).toHaveBeenCalled()
  })
  it('完成标识到达后释放长连接，无需等待服务商关闭连接', async () => {
    const 取消 = vi.fn()
    const 响应 = new Response(new ReadableStream({ start(控制) { 控制.enqueue(new TextEncoder().encode(事件({ choices: [{ delta: { content: '完整回复' }, finish_reason: 'stop' }] }))) }, cancel: 取消 }), { headers: { 'Content-Type': 'text/event-stream' } })
    expect((await 读取模型响应(响应)).内容).toBe('完整回复')
    expect(取消).toHaveBeenCalled()
  })
})
