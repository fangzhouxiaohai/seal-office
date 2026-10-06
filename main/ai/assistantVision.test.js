const { 创建助手服务 } = require('./assistant')

const 建服务 = (请求) => {
  const 配置 = { 名称: '测试服务', 服务商: 'custom', 地址: 'https://example.com/v1/chat/completions', 模型: 'vision-1', 密钥: '密钥', 思考强度: 'high', 参数模式: 'none' }
  return 创建助手服务({
    配置路径: '测试配置',
    存储: { readFile: async () => Buffer.from(JSON.stringify(配置)) },
    安全存储: { isEncryptionAvailable: () => true, decryptString: (值) => 值.toString() },
    请求,
  })
}
const 应答 = (内容) => vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 内容 }, finish_reason: 'stop' }] }), { headers: { 'Content-Type': 'application/json' } }))

describe('助手服务的图像输入', () => {
  it('把图像消息转换为文本加图像内容块发送', async () => {
    const 请求 = 应答('识别完成')
    const 服务 = 建服务(请求)
    const 数据 = Buffer.from('fake-image').toString('base64')
    await 服务.对话({ 用途: '识别', 消息: [{ 角色: 'user', 内容: '请识别图片文字', 图像: [{ 类型: 'image/png', 数据 }] }] })
    const 消息 = JSON.parse(请求.mock.calls[0][1].body).messages
    const 用户消息 = 消息.at(-1)
    expect(Array.isArray(用户消息.content)).toBe(true)
    expect(用户消息.content[0]).toEqual({ type: 'text', text: '请识别图片文字' })
    expect(用户消息.content[1]).toEqual({ type: 'image_url', image_url: { url: `data:image/png;base64,${数据}` } })
  })

  it('识别用途使用专门的识别指令，不包含文件修改协议', async () => {
    const 请求 = 应答('文字')
    const 服务 = 建服务(请求)
    await 服务.对话({ 用途: '识别', 消息: [{ 角色: 'user', 内容: '识别', 图像: [{ 类型: 'image/jpeg', 数据: Buffer.from('x').toString('base64') }] }] })
    const 系统消息 = JSON.parse(请求.mock.calls[0][1].body).messages[0]
    expect(系统消息.content).toContain('文字识别')
    expect(系统消息.content).not.toContain('演示文本替换')
    expect(系统消息.content).toContain('不得编造')
  })

  it('拒绝不支持的图像类型、非法编码与超限图片', async () => {
    const 服务 = 建服务(应答('文字'))
    await expect(服务.对话({ 消息: [{ 角色: 'user', 内容: '识别', 图像: [{ 类型: 'image/gif', 数据: 'AAAA' }] }] })).rejects.toThrow('图像')
    await expect(服务.对话({ 消息: [{ 角色: 'user', 内容: '识别', 图像: [{ 类型: 'image/png', 数据: '!!!' }] }] })).rejects.toThrow('图像')
    await expect(服务.对话({ 消息: [{ 角色: 'user', 内容: '识别', 图像: [{ 类型: 'image/png', 数据: Buffer.alloc(9 * 1024 * 1024).toString('base64') }] }] })).rejects.toThrow('图像')
    await expect(服务.对话({ 消息: [{ 角色: 'user', 内容: '识别', 图像: [] }] })).rejects.toThrow('图像')
  })

  it('拒绝未知用途与超过数量的图像', async () => {
    const 服务 = 建服务(应答('文字'))
    await expect(服务.对话({ 用途: '随便', 消息: [{ 角色: 'user', 内容: '识别' }] })).rejects.toThrow('用途')
    const 图 = { 类型: 'image/png', 数据: Buffer.from('x').toString('base64') }
    await expect(服务.对话({ 消息: [{ 角色: 'user', 内容: '识别', 图像: [图, 图, 图, 图] }] })).rejects.toThrow('图像')
  })

  it('普通文本对话保持字符串内容不变', async () => {
    const 请求 = 应答('{"回复":"好","修改":[]}')
    const 服务 = 建服务(请求)
    await 服务.对话({ 消息: [{ 角色: 'user', 内容: '请概括' }] })
    const 消息 = JSON.parse(请求.mock.calls[0][1].body).messages
    expect(消息.at(-1).content).toBe('请概括')
  })
})
