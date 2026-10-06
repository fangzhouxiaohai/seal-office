const { 检测能力, 探测服务, 能力列表 } = require('./capabilities')

const 文本配置 = { 名称: 'DeepSeek', 地址: 'https://api.deepseek.com/chat/completions', 模型: 'deepseek-flash', 已配置密钥: true }

describe('演示智能服务能力检测', () => {
  it('只登记文本、语音合成、图像识别与图像生成四类能力', () => {
    expect(能力列表).toEqual(['文本', '语音合成', '图像识别', '图像生成'])
  })

  it('未配置任何服务时全部为缺少配置并说明原因', () => {
    const 结果 = 检测能力({ 文本配置: null, 服务配置: {} })
    for (const 能力 of 能力列表) {
      expect(结果[能力].状态).toBe('缺少配置')
      expect(结果[能力].原因.length).toBeGreaterThan(0)
    }
    expect(结果.文本.原因).toContain('设置中心')
    expect(结果.语音合成.原因).toContain('语音')
  })

  it('只配置文本模型时不能冒充语音或图像能力', () => {
    const 结果 = 检测能力({ 文本配置, 服务配置: {} })
    expect(结果.文本).toMatchObject({ 状态: '可用', 模型: 'deepseek-flash' })
    expect(结果.语音合成.状态).toBe('缺少配置')
    expect(结果.语音合成.原因).toContain('文本模型不能代替语音合成')
    expect(结果.图像识别.状态).toBe('缺少配置')
    expect(结果.图像识别.原因).toContain('图像理解')
    expect(结果.图像生成.状态).toBe('缺少配置')
  })

  it('文本配置缺少密钥时报告缺少配置而不是可用', () => {
    const 结果 = 检测能力({ 文本配置: { ...文本配置, 已配置密钥: false, 服务商: 'deepseek' }, 服务配置: {} })
    expect(结果.文本.状态).toBe('缺少配置')
    expect(结果.文本.原因).toContain('密钥')
  })

  it('配置了语音与识别服务后对应能力可用，并回显实际模型与声线', () => {
    const 结果 = 检测能力({
      文本配置,
      服务配置: {
        语音: { 名称: '本机语音', 地址: 'http://127.0.0.1:8080/tts', 模型: 'tts-1', 声线: '女声-甲', 语速: 1, 已配置密钥: false },
        识别: { 名称: '视觉服务', 地址: 'https://api.example.com/v1/chat/completions', 模型: 'vision-1', 已配置密钥: true },
      },
    })
    expect(结果.语音合成).toMatchObject({ 状态: '可用', 模型: 'tts-1', 声线: '女声-甲' })
    expect(结果.图像识别).toMatchObject({ 状态: '可用', 模型: 'vision-1' })
  })

  it('识别服务缺少密钥且不是本机服务时报告缺少配置', () => {
    const 结果 = 检测能力({ 文本配置, 服务配置: { 识别: { 名称: '远程视觉', 地址: 'https://api.example.com/v1', 模型: 'vision-1', 已配置密钥: false } } })
    expect(结果.图像识别.状态).toBe('缺少配置')
    expect(结果.图像识别.原因).toContain('密钥')
  })
})

describe('服务能力探测', () => {
  const 响应 = (状态, 数据) => ({ ok: 状态 >= 200 && 状态 < 300, status: 状态, json: async () => 数据 })

  it('探测成功返回真实可用与模型列表', async () => {
    const 请求 = vi.fn(async () => 响应(200, { data: [{ id: 'tts-1' }, { id: 'tts-2' }] }))
    const 结果 = await 探测服务({ 地址: 'https://api.example.com/v1', 密钥: 'k', 模型: 'tts-1' }, { 请求 })
    expect(结果).toMatchObject({ 可用: true, 模型列表: ['tts-1', 'tts-2'] })
    expect(请求.mock.calls[0][0]).toBe('https://api.example.com/v1/models')
    expect(请求.mock.calls[0][1].headers.Authorization).toBe('Bearer k')
  })

  it('鉴权失败、限流、服务不可达与超时分别给出真实原因', async () => {
    await expect(探测服务({ 地址: 'https://a.example.com/v1', 密钥: 'k' }, { 请求: async () => 响应(401, {}) })).resolves.toMatchObject({ 可用: false, 原因: expect.stringContaining('鉴权失败') })
    await expect(探测服务({ 地址: 'https://a.example.com/v1', 密钥: 'k' }, { 请求: async () => 响应(429, {}) })).resolves.toMatchObject({ 可用: false, 原因: expect.stringContaining('频繁') })
    await expect(探测服务({ 地址: 'https://a.example.com/v1', 密钥: 'k' }, { 请求: async () => { throw Object.assign(new Error('boom'), { name: 'TypeError' }) } })).resolves.toMatchObject({ 可用: false, 原因: expect.stringContaining('无法连接') })
    await expect(探测服务({ 地址: 'https://a.example.com/v1', 密钥: 'k' }, { 请求: async () => 响应(404, {}) })).resolves.toMatchObject({ 可用: false, 原因: expect.stringContaining('接口') })
  })

  it('探测不带密钥时仍然如实报告服务拒绝', async () => {
    const 请求 = vi.fn(async () => 响应(403, {}))
    const 结果 = await 探测服务({ 地址: 'https://a.example.com/v1' }, { 请求 })
    expect(结果.可用).toBe(false)
    expect(请求.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })
})
