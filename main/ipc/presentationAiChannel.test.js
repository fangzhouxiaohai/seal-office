const { 注册演示智能通道 } = require('./presentationAiChannel')

const 文本配置 = { 名称: 'DeepSeek', 地址: 'https://api.deepseek.com/chat/completions', 模型: 'deepseek-flash', 已配置密钥: true }
const 语音配置 = { 名称: '本机语音', 地址: 'https://tts.example.com/v1', 模型: 'tts-1', 声线: '女声-甲', 语速: 1, 已配置密钥: true }

function 建环境({ 助手配置 = 文本配置, 对话回复 = '{"译文":[{"对象标识":"甲","译文":"Hello"}]}', 语音已配置 = true } = {}) {
  const 处理 = new Map()
  const 已保存 = 语音已配置 ? { 语音: { ...语音配置 } } : {}
  const 服务存储 = {
    读取: async (种类) => 已保存[种类] ?? null,
    保存: async (种类, 配置) => {
      const { 密钥, ...其余 } = 配置 ?? {}
      已保存[种类] = { ...其余, 已配置密钥: Boolean(密钥) }
      return 已保存[种类]
    },
    清除: async (种类) => { delete 已保存[种类] },
    迁移翻译配置: async (旧) => { 已保存.翻译 = { ...旧, 已配置密钥: Boolean(旧.密钥) }; return { 成功: true, 目标语言: 旧.目标语言 ?? 'zh' } },
    读取内部密钥: (种类) => (种类 === '语音' ? 'sk-语音' : 已保存.翻译?.密钥 ?? ''),
  }
  const 助手服务 = { 读取配置: async () => 助手配置, 对话: vi.fn(async () => ({ 内容: 对话回复 })) }
  const 缓存 = { 读取: vi.fn(async () => null), 写入: vi.fn(async () => {}), 清除: vi.fn(async () => {}) }
  const 发送 = []
  注册演示智能通道({ handle: (名称, 回调) => 处理.set(名称, 回调) }, { 助手服务, 服务存储, 语音缓存: 缓存, 用户数据目录: process.cwd() })
  const 事件 = { sender: { id: 7, isDestroyed: () => false, send: (...参数) => 发送.push(参数) } }
  const 调用 = (名称, ...参数) => 处理.get(名称)(事件, ...参数)
  return { 调用, 助手服务, 缓存, 发送, 已保存, 事件 }
}

describe('演示智能服务通道', () => {
  it('按真实配置汇总四类能力状态', async () => {
    const { 调用 } = 建环境()
    const 结果 = await 调用('presentation.ai.capabilities')
    expect(结果.成功).toBe(true)
    expect(结果.数据.文本.状态).toBe('可用')
    expect(结果.数据.语音合成.状态).toBe('可用')
    expect(结果.数据.图像识别.状态).toBe('缺少配置')
  })

  it('未配置文本模型时翻译与校对直接报告缺少配置，不调用模型', async () => {
    const { 调用, 助手服务 } = 建环境({ 助手配置: { ...文本配置, 已配置密钥: false, 服务商: 'deepseek' } })
    const 翻译 = await 调用('presentation.ai.translate', { 请求标识: 'r1', 条目: [{ 对象标识: '甲', 原文: '你好' }], 目标语言: 'en' })
    expect(翻译).toMatchObject({ 成功: false, 错误: expect.stringContaining('密钥') })
    const 校对 = await 调用('presentation.ai.proofread', { 请求标识: 'r2', 条目: [{ 对象标识: '甲', 原文: '你好' }] })
    expect(校对.成功).toBe(false)
    expect(助手服务.对话).not.toHaveBeenCalled()
  })

  it('翻译成功后返回结构化译文并转发流式状态', async () => {
    const { 调用, 助手服务, 发送 } = 建环境()
    const 结果 = await 调用('presentation.ai.translate', { 请求标识: 'req-1', 条目: [{ 对象标识: '甲', 原文: '你好' }], 目标语言: 'en' })
    expect(结果).toMatchObject({ 成功: true })
    expect(结果.数据.译文).toEqual([{ 对象标识: '甲', 原文: '你好', 译文: 'Hello' }])
    expect(助手服务.对话).toHaveBeenCalledTimes(1)
    expect(发送.some(([频道, 数据]) => 频道 === 'presentation.ai.stream' && 数据.请求标识 === 'req-1')).toBe(true)
  })

  it('同一窗口的并发智能任务被拒绝，请求标识非法时给出真实原因', async () => {
    const { 调用 } = 建环境()
    let 释放
    const 挂起 = new Promise((完成) => { 释放 = 完成 })
    const { 调用: 调用慢 } = 建环境()
    void 挂起
    const 首次 = 调用('presentation.ai.translate', { 请求标识: 'same-1', 条目: [{ 对象标识: '甲', 原文: '你好' }], 目标语言: 'en' })
    const 第二次 = await 调用('presentation.ai.translate', { 请求标识: 'same-2', 条目: [{ 对象标识: '甲', 原文: '你好' }], 目标语言: 'en' })
    expect(第二次).toMatchObject({ 成功: false, 错误: expect.stringContaining('等待当前智能任务') })
    await 首次
    const 非法 = await 调用('presentation.ai.translate', { 请求标识: '有 空格', 条目: [{ 对象标识: '甲', 原文: '你好' }], 目标语言: 'en' })
    expect(非法).toMatchObject({ 成功: false, 错误: expect.stringContaining('请求标识') })
    expect(调用慢).toBeTypeOf('function')
    释放()
  })

  it('语音合成未配置时如实失败，配置后返回音频并写入缓存', async () => {
    const { 调用, 已保存, 缓存 } = 建环境({ 语音已配置: false })
    const 未配置 = await 调用('presentation.ai.speak', { 文本: '欢迎' })
    expect(未配置).toMatchObject({ 成功: false, 错误: expect.stringContaining('请先配置 AI 语音合成服务') })
    已保存.语音 = { ...语音配置 }
    const 全局请求 = globalThis.fetch
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, headers: { get: () => 'audio/mpeg' }, arrayBuffer: async () => Uint8Array.from([1, 2]).buffer }))
    try {
      const 结果 = await 调用('presentation.ai.speak', { 文本: '欢迎' })
      expect(结果).toMatchObject({ 成功: true })
      expect(结果.数据.类型).toBe('audio/mpeg')
      expect(缓存.写入).toHaveBeenCalledTimes(1)
    } finally { globalThis.fetch = 全局请求 }
  })

  it('讲稿与讲解音频分别返回结构化结果，缓存可整体清除', async () => {
    const { 调用, 缓存 } = 建环境({ 对话回复: JSON.stringify({ 讲稿: [{ 页标识: '页一', 讲稿: '第一页讲解' }] }) })
    const 讲稿 = await 调用('presentation.ai.generateScript', { 请求标识: 'req-2', 页列表: [{ 页标识: '页一', 标题: '标题', 文本: '内容' }] })
    expect(讲稿).toMatchObject({ 成功: true })
    expect(讲稿.数据.讲稿).toEqual([{ 页标识: '页一', 讲稿: '第一页讲解' }])
    const 讲解 = await 调用('presentation.ai.narrate', { 讲稿: [{ 页标识: '页一', 讲稿: '第一页讲解' }] })
    expect(讲解.成功).toBe(true)
    await 调用('presentation.ai.clearAudioCache')
    expect(缓存.清除).toHaveBeenCalled()
  })

  it('服务设置保存、读取、探测与旧翻译迁移都通过通道完成', async () => {
    const { 调用 } = 建环境()
    expect(await 调用('presentation.ai.listServiceKinds')).toMatchObject({ 成功: true, 数据: ['翻译', '语音', '识别'] })
    const 保存 = await 调用('presentation.ai.saveService', '识别', { 名称: '视觉', 地址: 'https://api.example.com/v1', 模型: 'vision-1', 密钥: 'sk-v' })
    expect(保存).toMatchObject({ 成功: true })
    expect(JSON.stringify(保存.数据)).not.toContain('sk-v')
    const 读取 = await 调用('presentation.ai.getService', '识别')
    expect(读取.数据.模型).toBe('vision-1')
    const 迁移 = await 调用('presentation.ai.migrateLegacyTranslate', { 地址: 'https://api.legacy.com/v1', 密钥: 'sk-old', 目标语言: 'ja' })
    expect(迁移).toMatchObject({ 成功: true, 数据: { 成功: true, 目标语言: 'ja' } })
  })
})
