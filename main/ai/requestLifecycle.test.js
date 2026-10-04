const { getEventListeners } = require('events')
const { 创建助手服务 } = require('./assistant')

const 原生取消控制器 = globalThis.AbortController
const 文档条目 = Array.from({ length: 30 }, (_, 索引) => ({ 段落标识: `段落-${索引 + 1}`, 原文: `第 ${索引 + 1} 段真实正文。`, 类型: 'p', 格式: {} }))
const 文档上下文 = '文件名称：分批读取.docx\n文件类型：文字\n文件内容：\n' + JSON.stringify(文档条目)

function 读取工具回复(索引) {
  return { content: null, reasoning_content: '继续按范围读取。', tool_calls: [{ id: `read-${索引}`, type: 'function', function: { name: 'read_document', arguments: JSON.stringify({ offset: 索引, limit: 1 }) } }] }
}

function 可控等待() {
  let 释放
  const 等待 = new Promise((完成) => { 释放 = 完成 })
  return { 等待, 释放 }
}

function 创建环境(生成响应) {
  const 控制器列表 = []
  // 保持原生信号类型，仅记录任务和请求创建的控制器用于检查真实监听器数量。
  vi.stubGlobal('AbortController', class extends 原生取消控制器 {
    constructor() { super(); 控制器列表.push(this) }
  })
  const 取消控制 = new 原生取消控制器()
  const 请求信号 = []
  const 请求取消次数 = []
  const 主信号监听器数量 = []
  const 会话列表 = new Map()
  const 配置 = { 名称: '请求生命周期测试', 地址: 'https://example.com/chat/completions', 模型: 'test', 服务商: 'custom', 参数模式: 'none', 思考强度: 'high', 密钥: '', 上下文令牌: 131072 }
  const 服务 = 创建助手服务({
    配置路径: '请求生命周期配置',
    存储: { readFile: async () => Buffer.from(JSON.stringify(配置)) },
    安全存储: { isEncryptionAvailable: () => true, decryptString: (值) => 值.toString() },
    会话存储: {
      读取: async (标识) => 会话列表.has(标识) ? structuredClone(会话列表.get(标识)) : null,
      保存: async (标识, 会话) => 会话列表.set(标识, structuredClone(会话)),
      清除: async (标识) => 会话列表.delete(标识),
    },
    请求: async (_地址, 选项) => {
      const 索引 = 请求信号.length
      请求信号.push(选项.signal)
      请求取消次数.push(0)
      // 模拟原生请求在垃圾回收前保留取消监听器，不主动释放该监听器。
      选项.signal.addEventListener('abort', () => { 请求取消次数[索引]++ }, { once: true })
      主信号监听器数量.push(getEventListeners(控制器列表[0].signal, 'abort').length)
      const 消息 = await 生成响应(索引, 选项.signal)
      return new Response(JSON.stringify({ choices: [{ message: 消息, finish_reason: 消息.tool_calls ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
    },
  })
  const 运行 = () => 服务.对话({ 会话标识: 'file:分批读取.docx', 消息: [{ 角色: 'user', 内容: '按范围读完正文，然后总结。' }], 文档上下文 }, { 信号: 取消控制.signal })
  return { 运行, 取消控制, 请求信号, 请求取消次数, 主信号监听器数量, 控制器列表 }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('多轮原生工具请求的取消信号生命周期', () => {
  it('二十轮工具读取为每次请求创建独立信号，主任务监听器不会随轮数积累', async () => {
    const 工具轮数 = 20
    const 环境 = 创建环境(async (索引) => 索引 < 工具轮数 ? 读取工具回复(索引) : { content: '二十个正文范围已读取完毕。' })
    expect((await 环境.运行()).内容).toBe('二十个正文范围已读取完毕。')
    expect(环境.请求信号).toHaveLength(工具轮数 + 1)
    expect(new Set(环境.请求信号).size).toBe(工具轮数 + 1)
    expect(环境.主信号监听器数量.every((数量) => 数量 <= 1)).toBe(true)
    expect(getEventListeners(环境.控制器列表[0].signal, 'abort')).toHaveLength(0)
    expect(getEventListeners(环境.取消控制.signal, 'abort')).toHaveLength(0)
    expect(环境.请求取消次数.every((次数) => 次数 === 0)).toBe(true)
  })

  it('多轮之后停止真实中断当前请求，已完成请求不再挂接任务的取消事件', async () => {
    const 进入当前请求 = 可控等待()
    const 已完成轮数 = 15
    const 环境 = 创建环境(async (索引, 信号) => {
      if (索引 < 已完成轮数) return 读取工具回复(索引)
      return new Promise((_完成, 拒绝) => {
        信号.addEventListener('abort', () => 拒绝(Object.assign(new Error('当前模型请求已取消。'), { name: 'AbortError' })), { once: true })
        进入当前请求.释放()
      })
    })
    const 运行中 = 环境.运行()
    await 进入当前请求.等待
    环境.取消控制.abort()
    expect(await 运行中).toMatchObject({ 已停止: true })
    expect(环境.请求信号).toHaveLength(已完成轮数 + 1)
    expect(环境.请求信号.at(-1).aborted).toBe(true)
    expect(环境.请求信号.slice(0, -1).every((信号) => !信号.aborted)).toBe(true)
    expect(环境.请求取消次数).toEqual([...Array(已完成轮数).fill(0), 1])
    expect(getEventListeners(环境.控制器列表[0].signal, 'abort')).toHaveLength(0)
    expect(getEventListeners(环境.取消控制.signal, 'abort')).toHaveLength(0)
  })

  it('请求抛出网络错误时也释放任务到请求的取消链接', async () => {
    const 环境 = 创建环境(async () => { throw new TypeError('底层网络连接中断。') })
    await expect(环境.运行()).rejects.toThrow('无法连接模型服务')
    expect(环境.请求信号).toHaveLength(1)
    expect(getEventListeners(环境.控制器列表[0].signal, 'abort')).toHaveLength(0)
    expect(getEventListeners(环境.取消控制.signal, 'abort')).toHaveLength(0)
  })
})
