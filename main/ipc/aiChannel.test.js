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
