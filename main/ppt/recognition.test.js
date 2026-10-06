const { 创建识别服务 } = require('./recognition')

const 图片数据 = Buffer.from('fake-png').toString('base64')

const 建服务 = (配置, 对话) => 创建识别服务({
  助手服务: {
    读取配置: async () => 配置,
    对话,
  },
})

describe('文字识别服务', () => {
  it('未配置模型时说明原因而不是假装可用', async () => {
    const 服务 = 建服务({ 地址: '', 模型: '', 服务商: 'deepseek', 已配置密钥: false }, vi.fn())
    expect(await 服务.读取状态()).toMatchObject({ 可用: false, 原因: expect.stringContaining('设置中心') })
  })

  it('缺少密钥时说明需要填写密钥', async () => {
    const 服务 = 建服务({ 地址: 'https://api.example.com/chat', 模型: 'vision-1', 服务商: 'deepseek', 已配置密钥: false }, vi.fn())
    expect(await 服务.读取状态()).toMatchObject({ 可用: false, 原因: expect.stringContaining('密钥') })
  })

  it('配置完成时报告可用模型与图像输入要求', async () => {
    const 服务 = 建服务({ 地址: 'https://api.example.com/chat', 模型: 'vision-1', 服务商: 'custom', 已配置密钥: false }, vi.fn())
    expect(await 服务.读取状态()).toMatchObject({ 可用: true, 模型: 'vision-1' })
  })

  it('识别时通过共用助手服务发送图像内容并返回文字', async () => {
    const 对话 = vi.fn(async (输入) => {
      expect(输入.用途).toBe('识别')
      expect(输入.消息[0].图像).toEqual([{ 类型: 'image/png', 数据: 图片数据 }])
      expect(输入.消息[0].内容.length).toBeGreaterThan(0)
      return { 内容: '识别出的第一行\n第二行' }
    })
    const 服务 = 建服务({ 地址: 'https://api.example.com/chat', 模型: 'vision-1', 服务商: 'custom', 已配置密钥: false }, 对话)
    expect(await 服务.识别({ 数据: 图片数据, 类型: 'image/png' })).toEqual({ 文本: '识别出的第一行\n第二行' })
    expect(对话).toHaveBeenCalledTimes(1)
  })

  it('拒绝不支持的图片类型与无效编码', async () => {
    const 服务 = 建服务({ 地址: 'https://api.example.com/chat', 模型: 'vision-1', 服务商: 'custom', 已配置密钥: false }, vi.fn())
    await expect(服务.识别({ 数据: 图片数据, 类型: 'image/gif' })).rejects.toThrow('格式')
    await expect(服务.识别({ 数据: '!!!', 类型: 'image/png' })).rejects.toThrow('编码')
    await expect(服务.识别({ 数据: '', 类型: 'image/png' })).rejects.toThrow('空')
  })

  it('超过大小限制的图片被拒绝', async () => {
    const 服务 = 创建识别服务({ 助手服务: { 读取配置: async () => ({}), 对话: vi.fn() }, 最大字节: 4 })
    await expect(服务.识别({ 数据: Buffer.from('12345').toString('base64'), 类型: 'image/png' })).rejects.toThrow('大小限制')
  })

  it('模型没有返回文字时报告真实失败，不返回空结果冒充成功', async () => {
    const 服务 = 建服务({ 地址: 'https://api.example.com/chat', 模型: 'vision-1', 服务商: 'custom', 已配置密钥: false }, async () => ({ 内容: '   ' }))
    await expect(服务.识别({ 数据: 图片数据, 类型: 'image/png' })).rejects.toThrow('未返回识别文字')
  })

  it('把模型服务错误原样抛出，便于界面显示真实原因', async () => {
    const 服务 = 建服务({ 地址: 'https://api.example.com/chat', 模型: 'vision-1', 服务商: 'custom', 已配置密钥: false }, async () => { throw new Error('模型服务拒绝请求参数，请核对模型名称、思考参数模式和当前模型支持范围') })
    await expect(服务.识别({ 数据: 图片数据, 类型: 'image/png' })).rejects.toThrow('模型服务拒绝请求参数')
  })

  it('缺少共用助手服务时拒绝创建', () => {
    expect(() => 创建识别服务({})).toThrow('助手服务')
    expect(() => 创建识别服务({ 助手服务: { 读取配置: () => ({}) } })).toThrow('助手服务')
  })
})
