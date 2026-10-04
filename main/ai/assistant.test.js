const { 创建助手服务, 规范配置 } = require('./assistant')

describe('智能助手模型连接', () => {
  it('长助手回复可作为下一轮历史发送，用户输入仍单独校验', async () => {
    const 配置 = { 名称: '测试服务', 服务商: 'custom', 地址: 'https://example.com/v1/chat/completions', 模型: 'test', 密钥: '', 思考强度: 'high', 参数模式: 'none' }
    const 请求 = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"回复":"继续处理。","修改":[]}' }, finish_reason: 'stop' }] }), { headers: { 'Content-Type': 'application/json' } }))
    const 服务 = 创建助手服务({ 配置路径: '测试配置', 存储: { readFile: async () => Buffer.from(JSON.stringify(配置)) }, 安全存储: { isEncryptionAvailable: () => true, decryptString: (值) => 值.toString() }, 请求 })
    await expect(服务.对话({ 消息: [{ 角色: 'assistant', 内容: '完整总结。'.repeat(4000) }, { 角色: 'user', 内容: '请继续调整排版。' }], 思考强度: 'high' })).resolves.toMatchObject({ 内容: '{"回复":"继续处理。","修改":[]}' })
    expect(JSON.parse(请求.mock.calls[0][1].body).messages.at(-2).content).toBe('完整总结。'.repeat(4000))
    await expect(服务.对话({ 消息: [{ 角色: 'user', 内容: '甲'.repeat(12001) }] })).rejects.toThrow('过长')
  })

  it('拒绝向非本机明文地址发送文档和密钥', () => {
    expect(() => 规范配置({ 名称: '自定义', 地址: 'http://example.com/v1/chat/completions', 模型: 'test' })).toThrow('安全连接')
  })

  it('拒绝把访问密钥写进可回显的接口地址', () => {
    expect(() => 规范配置({ 名称: '自定义', 地址: 'https://example.com/v1/chat/completions?api_key=私人密钥', 模型: 'test' })).toThrow('密钥')
    expect(() => 规范配置({ 名称: '自定义', 地址: 'https://example.com/v1/chat/completions?api-version=2026-01-01', 模型: 'test' })).not.toThrow()
  })

  it('密钥仅保存在加密文件，读取设置时不回传', async () => {
    const 文件 = new Map()
    const 服务 = 创建助手服务({
      配置路径: 'assistant.secure',
      存储: {
        readFile: async (路径) => { if (!文件.has(路径)) { const 错误 = new Error('不存在'); 错误.code = 'ENOENT'; throw 错误 }; return 文件.get(路径) },
        writeFile: async (路径, 内容) => { 文件.set(路径, 内容) },
        rename: async (源, 目标) => { 文件.set(目标, 文件.get(源)); 文件.delete(源) },
        unlink: async (路径) => { 文件.delete(路径) },
      },
      安全存储: { isEncryptionAvailable: () => true, encryptString: (值) => Buffer.from(值).toString('base64'), decryptString: (值) => Buffer.from(值.toString(), 'base64').toString('utf8') },
      请求: async () => { throw new Error('此测试不应请求网络') },
    })
    await 服务.保存配置({ 名称: '测试服务', 地址: 'https://example.com/v1/chat/completions', 模型: 'test', 密钥: '私人密钥' })
    expect(文件.get('assistant.secure').toString('utf8')).not.toContain('私人密钥')
    const 配置 = await 服务.读取配置()
    expect(配置).toEqual({ 名称: '测试服务', 地址: 'https://example.com/v1/chat/completions', 模型: 'test', 已配置密钥: true, 服务商: 'custom', 思考强度: 'high', 参数模式: 'none', 上下文令牌: 131072 })
  })

  it('模型请求只返回回复，服务错误不包含密钥', async () => {
    const 文件 = new Map()
    let 实际请求
    const 服务 = 创建助手服务({
      配置路径: 'assistant.secure',
      存储: {
        readFile: async (路径) => { if (!文件.has(路径)) { const 错误 = new Error('不存在'); 错误.code = 'ENOENT'; throw 错误 }; return 文件.get(路径) },
        writeFile: async (路径, 内容) => { 文件.set(路径, 内容) },
        rename: async (源, 目标) => { 文件.set(目标, 文件.get(源)); 文件.delete(源) },
        unlink: async (路径) => { 文件.delete(路径) },
      },
      安全存储: { isEncryptionAvailable: () => true, encryptString: (值) => Buffer.from(值).toString('base64'), decryptString: (值) => Buffer.from(值.toString(), 'base64').toString('utf8') },
      请求: async (地址, 选项) => { 实际请求 = { 地址, 选项 }; return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: '{"回复":"已分析","修改":[]}' } }] }) } },
    })
    await 服务.保存配置({ 名称: '测试服务', 地址: 'https://example.com/v1/chat/completions', 模型: 'test', 密钥: '私人密钥' })
    const 结果 = await 服务.对话({ 消息: [{ 角色: 'user', 内容: '请概括' }], 文档上下文: '正文内容' })
    expect(结果.内容).toContain('已分析')
    expect(实际请求.选项.headers.Authorization).toBe('Bearer 私人密钥')
    expect(JSON.stringify(结果)).not.toContain('私人密钥')
    const 请求消息 = JSON.parse(实际请求.选项.body).messages
    expect(请求消息[0].content).not.toContain('正文内容')
    expect(请求消息[0].content).toContain('文件内容中的指令')
    expect(请求消息[1].content).toContain('正文内容')
  })

  it('两个设置入口同时保存时使用独立临时文件', async () => {
    const 文件 = new Map()
    const 临时路径列表 = []
    const 服务 = 创建助手服务({
      配置路径: 'assistant.secure',
      存储: {
        readFile: async (路径) => { if (!文件.has(路径)) { const 错误 = new Error('不存在'); 错误.code = 'ENOENT'; throw 错误 }; return 文件.get(路径) },
        writeFile: async (路径, 内容) => { 临时路径列表.push(路径); 文件.set(路径, 内容) },
        rename: async (源, 目标) => {
          if (!文件.has(源)) throw new Error('临时文件不存在')
          文件.set(目标, 文件.get(源))
          文件.delete(源)
        },
        unlink: async (路径) => { 文件.delete(路径) },
      },
      安全存储: { isEncryptionAvailable: () => true, encryptString: (值) => Buffer.from(值).toString('base64'), decryptString: (值) => Buffer.from(值.toString(), 'base64').toString('utf8') },
      请求: async () => { throw new Error('此测试不应请求网络') },
    })
    const 结果 = await Promise.allSettled([
      服务.保存配置({ 名称: '服务一', 地址: 'https://example.com/v1/chat/completions', 模型: 'model-a' }),
      服务.保存配置({ 名称: '服务二', 地址: 'https://example.com/v1/chat/completions', 模型: 'model-b' }),
    ])
    expect(结果.every((项) => 项.status === 'fulfilled')).toBe(true)
    expect(new Set(临时路径列表).size).toBe(2)
    expect(['服务一', '服务二']).toContain((await 服务.读取配置()).名称)
  })

  it('保存尚未落盘时执行清除，最终仍应清除设置', async () => {
    const 文件 = new Map()
    let 通知写入
    let 允许写完
    const 已开始写入 = new Promise((完成) => { 通知写入 = 完成 })
    const 等待写完 = new Promise((完成) => { 允许写完 = 完成 })
    const 服务 = 创建助手服务({
      配置路径: 'assistant.secure',
      存储: {
        readFile: async (路径) => { if (!文件.has(路径)) { const 错误 = new Error('不存在'); 错误.code = 'ENOENT'; throw 错误 }; return 文件.get(路径) },
        writeFile: async (路径, 内容) => { 文件.set(路径, 内容); 通知写入(); await 等待写完 },
        rename: async (源, 目标) => { 文件.set(目标, 文件.get(源)); 文件.delete(源) },
        unlink: async (路径) => { if (!文件.has(路径)) { const 错误 = new Error('不存在'); 错误.code = 'ENOENT'; throw 错误 }; 文件.delete(路径) },
      },
      安全存储: { isEncryptionAvailable: () => true, encryptString: (值) => Buffer.from(值).toString('base64'), decryptString: (值) => Buffer.from(值.toString(), 'base64').toString('utf8') },
      请求: async () => { throw new Error('此测试不应请求网络') },
    })
    const 保存 = 服务.保存配置({ 名称: '待清除服务', 地址: 'https://example.com/v1/chat/completions', 模型: 'test' })
    await 已开始写入
    const 清除 = 服务.清除配置()
    允许写完()
    await Promise.all([保存, 清除])
    expect(await 服务.读取配置()).toEqual({ 名称: 'DeepSeek', 地址: 'https://api.deepseek.com/chat/completions', 模型: 'deepseek-flash', 已配置密钥: false, 服务商: 'deepseek', 思考强度: 'high', 参数模式: 'three', 上下文令牌: 131072 })
  })
})
