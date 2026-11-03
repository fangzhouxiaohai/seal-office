const path = require('path')
const { spawn } = require('child_process')
const { 创建MCP连接, 校验MCP服务配置 } = require('./mcpClient')

const 测试服务 = path.join(__dirname, '__fixtures__', 'mcpTestServer.cjs')

describe('MCP 客户端与官方 SDK 服务端互通', () => {
  it('stdio：握手、列出工具、调用工具、工具错误与关闭', async () => {
    const 连接 = 创建MCP连接({ 传输: 'stdio', 命令: process.execPath, 参数: [测试服务, 'stdio'] }, { spawn })
    try {
      const 信息 = await 连接.初始化()
      expect(信息.服务名称).toBe('seal-test-server')
      const 工具 = await 连接.列出工具()
      expect(工具.map(项 => 项.name).sort()).toEqual(['add', 'echo_cn', 'fail'])
      expect(工具.find(项 => 项.name === 'add').inputSchema.properties.a.type).toBe('number')
      expect(await 连接.调用工具('add', { a: 2, b: 40 })).toEqual({ 成功: true, 文本: '42', 内容: [{ type: 'text', text: '42' }] })
      expect((await 连接.调用工具('echo_cn', { text: '海豹' })).文本).toBe('回声：海豹')
      const 失败 = await 连接.调用工具('fail', {})
      expect(失败.成功).toBe(false)
      expect(失败.文本).toBe('模拟的工具错误')
    } finally { await 连接.关闭() }
  })

  it('Streamable HTTP：会话标识、协议版本头与工具调用', async () => {
    const 进程 = spawn(process.execPath, [测试服务, 'http', '0'])
    try {
      const 端口 = await new Promise((完成, 失败) => {
        进程.stdout.on('data', 块 => { const 匹配 = /PORT (\d+)/.exec(String(块)); if (匹配) 完成(Number(匹配[1])) })
        进程.once('exit', () => 失败(new Error('测试服务退出')))
      })
      const 连接 = 创建MCP连接({ 传输: 'http', 地址: `http://127.0.0.1:${端口}/mcp` }, { fetch })
      await 连接.初始化()
      expect((await 连接.列出工具()).length).toBe(3)
      expect((await 连接.调用工具('add', { a: 1, b: 2 })).文本).toBe('3')
      await 连接.关闭()
    } finally { 进程.kill() }
  })

  it('命令不存在时给出中文错误', async () => {
    const 连接 = 创建MCP连接({ 传输: 'stdio', 命令: 'seal-command-not-exist-xyz', 参数: [] }, { spawn })
    await expect(连接.初始化()).rejects.toThrow(/无法启动 MCP 服务/)
    await 连接.关闭()
  })

  it('HTTP 服务不可达时给出中文错误', async () => {
    const 连接 = 创建MCP连接({ 传输: 'http', 地址: 'http://127.0.0.1:9/mcp' }, { fetch })
    await expect(连接.初始化()).rejects.toThrow(/无法连接 MCP 服务/)
  })
})

describe('MCP 服务配置校验', () => {
  it('接受 stdio 与 https 配置并规范名称', () => {
    expect(校验MCP服务配置({ 名称: '文件工具', 传输: 'stdio', 命令: 'npx', 参数: ['-y', 'pkg'], 环境: { TOKEN: 'x' } })).toMatchObject({ 名称: '文件工具', 传输: 'stdio', 命令: 'npx' })
    expect(校验MCP服务配置({ 名称: '远程', 传输: 'http', 地址: 'https://example.com/mcp', 请求头: { Authorization: 'Bearer a' } }).地址).toBe('https://example.com/mcp')
  })
  it('拒绝远程明文 HTTP、空命令与非法请求头', () => {
    expect(() => 校验MCP服务配置({ 名称: 'a', 传输: 'http', 地址: 'http://example.com/mcp' })).toThrow(/安全连接/)
    expect(() => 校验MCP服务配置({ 名称: 'a', 传输: 'stdio', 命令: '' })).toThrow(/启动命令/)
    expect(() => 校验MCP服务配置({ 名称: 'a', 传输: 'http', 地址: 'https://e.com', 请求头: { 'Bad Header': 'x' } })).toThrow(/请求头/)
  })
})
