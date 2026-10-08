const { EventEmitter } = require('events')
const { 注册智能助手通道 } = require('./aiChannel')

function 环境() {
  const 处理器 = new Map()
  const 服务 = { 对话: vi.fn(async (_输入, { 信号, 推送 }) => {
    推送({ 类型: '思考', 内容: '服务返回的思考' })
    return new Promise((完成) => 信号.addEventListener('abort', () => 完成({ 内容: '', 已停止: true }), { once: true }))
  }) }
  注册智能助手通道({ handle: (名称, 处理) => 处理器.set(名称, 处理) }, { 助手服务: 服务 })
  const 创建发送者 = (id) => Object.assign(new EventEmitter(), { id, send: vi.fn(), isDestroyed: () => false })
  return { 处理器, 服务, 创建发送者 }
}
describe('助手任务生命周期', () => {
  it('文件工具只接受所属窗口和请求的结果，取消释放等待', async () => {
    const 处理器 = new Map()
    const 服务 = { 对话: vi.fn(async (_输入, { 执行工具, 信号 }) => {
      try { return { 内容: JSON.stringify(await 执行工具({ 调用标识: 'call-1', 工具: 'propose_changes', 参数: { 回复: '建议', 修改: [] } })) } }
      catch (错误) { if (信号.aborted) return { 内容: '', 已停止: true }; throw 错误 }
    }) }
    注册智能助手通道({ handle: (名称, 处理) => 处理器.set(名称, 处理) }, { 助手服务: 服务 })
    const 甲 = Object.assign(new EventEmitter(), { id: 1, send: vi.fn(), isDestroyed: () => false })
    const 乙 = Object.assign(new EventEmitter(), { id: 2, send: vi.fn(), isDestroyed: () => false })
    const 任务 = 处理器.get('ai.chat')({ sender: 甲 }, { 请求标识: 'request-a' })
    expect(甲.send).toHaveBeenCalledWith('ai.toolCall', expect.objectContaining({ 请求标识: 'request-a', 调用标识: 'call-1' }))
    const 结果 = { 请求标识: 'request-a', 调用标识: 'call-1', 成功: true, 数据: { 候选已生成: true } }
    expect((await 处理器.get('ai.submitToolResult')({ sender: 乙 }, 结果)).成功).toBe(false)
    expect((await 处理器.get('ai.submitToolResult')({ sender: 甲 }, { ...结果, 请求标识: 'other' })).成功).toBe(false)
    expect((await 处理器.get('ai.submitToolResult')({ sender: 甲 }, 结果)).成功).toBe(true)
    expect((await 任务).成功).toBe(true)
    expect((await 处理器.get('ai.submitToolResult')({ sender: 甲 }, 结果)).成功).toBe(false)
    const 第二次 = 处理器.get('ai.chat')({ sender: 甲 }, { 请求标识: 'request-b' })
    expect(处理器.get('ai.cancel')({ sender: 甲 }, 'request-b').成功).toBe(true)
    expect((await 第二次).数据.已停止).toBe(true)
  })

  it('每窗口独立任务、取消权限及事件标识，结束释放监听', async () => {
    const { 处理器, 创建发送者 } = 环境()
    const 甲 = 创建发送者(1), 乙 = 创建发送者(2)
    const 任务 = 处理器.get('ai.chat')({ sender: 甲 }, { 请求标识: 'request-a' })
    expect(甲.send).toHaveBeenCalledWith('ai.stream', { 请求标识: 'request-a', 类型: '思考', 内容: '服务返回的思考' })
    expect(处理器.get('ai.cancel')({ sender: 乙 }, 'request-a').成功).toBe(false)
    expect((await 处理器.get('ai.chat')({ sender: 甲 }, { 请求标识: 'request-b' })).成功).toBe(false)
    expect(处理器.get('ai.cancel')({ sender: 甲 }, 'request-a').成功).toBe(true)
    expect(await 任务).toEqual({ 成功: true, 数据: { 内容: '', 已停止: true } })
    expect(甲.listenerCount('destroyed')).toBe(0)
    expect(甲.listenerCount('render-process-gone')).toBe(0)
  })
  it('窗口销毁中断请求，不留下后台生成任务', async () => {
    const { 处理器, 创建发送者 } = 环境()
    const 甲 = 创建发送者(1)
    const 任务 = 处理器.get('ai.chat')({ sender: 甲 }, { 请求标识: 'request-a' })
    甲.emit('destroyed')
    expect((await 任务).数据.已停止).toBe(true)
    expect(甲.listenerCount('destroyed')).toBe(0)
  })
})


describe('不中断任务的补充引导', () => {
  it('只允许所属窗口引导，同一工具等待期间接收，收尾原子关闭入口', async () => {
    const { 处理器, 服务, 创建发送者 } = 环境()
    let options, resolve
    服务.对话.mockImplementation(async (_input, opt) => { options = opt; return new Promise(r => { resolve = r }) })
    const 甲 = 创建发送者(10), 乙 = 创建发送者(11)
    const task = 处理器.get('ai.chat')({ sender: 甲 }, { 请求标识: 'guided-task', 会话标识: 'file:test', 自动执行: true })
    expect(处理器.get('ai.guide')({ sender: 乙 }, 'guided-task', '补充预算').成功).toBe(false)
    expect(处理器.get('ai.guide')({ sender: 甲 }, 'wrong-task', '补充预算').成功).toBe(false)
    expect(处理器.get('ai.guide')({ sender: 甲 }, 'guided-task', '补充预算').成功).toBe(true)
    expect(options.信号.aborted).toBe(false)
    expect(options.读取引导(true)).toEqual(['补充预算'])
    expect(处理器.get('ai.guide')({ sender: 甲 }, 'guided-task', '加上负责人').成功).toBe(true)
    expect(options.读取引导()).toEqual(['加上负责人'])
    expect(options.读取引导(true)).toEqual([])
    expect(处理器.get('ai.guide')({ sender: 甲 }, 'guided-task', '最后一条').成功).toBe(false)
    resolve({ 内容: '已结合需求' }); await task
  })
  it('计划模式、空内容、过长内容和取消后的引导全部拒绝', async () => {
    const { 处理器, 创建发送者 } = 环境(), 甲 = 创建发送者(20)
    let task = 处理器.get('ai.chat')({ sender: 甲 }, { 请求标识: 'plan', 会话标识: 'test', 自动执行: false })
    expect(处理器.get('ai.guide')({ sender: 甲 }, 'plan', '执行内容').成功).toBe(false)
    处理器.get('ai.cancel')({ sender: 甲 }, 'plan'); await task
    task = 处理器.get('ai.chat')({ sender: 甲 }, { 请求标识: 'run', 会话标识: 'test' })
    expect(处理器.get('ai.guide')({ sender: 甲 }, 'run', ' ').成功).toBe(false)
    expect(处理器.get('ai.guide')({ sender: 甲 }, 'run', '字'.repeat(12001)).成功).toBe(false)
    expect(处理器.get('ai.guide')({ sender: 甲 }, 'run', '字'.repeat(12000)).成功).toBe(true)
    expect(处理器.get('ai.guide')({ sender: 甲 }, 'run', '字'.repeat(12000)).成功).toBe(true)
    expect(处理器.get('ai.guide')({ sender: 甲 }, 'run', '更多').成功).toBe(false)
    处理器.get('ai.cancel')({ sender: 甲 }, 'run')
    expect(处理器.get('ai.guide')({ sender: 甲 }, 'run', '继续').成功).toBe(false)
    await task
  })
})
