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

describe('模型流式响应', () => {
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
  it('拒绝空回复、流错误和过大回复', async () => {
    await expect(读取模型响应(流响应('data: [DONE]\n\n'))).rejects.toThrow('有效回复')
    await expect(读取模型响应(流响应(事件({ error: { code: 'invalid_parameter' } })))).rejects.toThrow('错误')
    await expect(读取模型响应(new Response('x'.repeat(1024 * 1024 + 1)))).rejects.toThrow('过大')
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
