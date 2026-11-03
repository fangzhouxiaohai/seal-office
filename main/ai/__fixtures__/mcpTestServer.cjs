// 测试专用：用 MCP 官方 SDK 启动的服务端，验证海豹办公客户端与官方实现互通。
// 用法：node mcpTestServer.cjs stdio  或  node mcpTestServer.cjs http <端口>
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js')
const { z } = require('zod')
const http = require('node:http')

function 创建服务() {
  const 服务 = new McpServer({ name: 'seal-test-server', version: '1.0.0' })
  服务.registerTool('add', { title: '加法', description: '计算两个数之和', inputSchema: { a: z.number(), b: z.number() } },
    async ({ a, b }) => ({ content: [{ type: 'text', text: String(a + b) }] }))
  服务.registerTool('echo_cn', { description: '原样返回中文文本', inputSchema: { text: z.string() } },
    async ({ text }) => ({ content: [{ type: 'text', text: `回声：${text}` }] }))
  服务.registerTool('fail', { description: '总是返回工具错误', inputSchema: {} },
    async () => ({ isError: true, content: [{ type: 'text', text: '模拟的工具错误' }] }))
  return 服务
}

const 模式 = process.argv[2]
if (模式 === 'stdio') {
  创建服务().connect(new StdioServerTransport())
} else if (模式 === 'http') {
  const 端口 = Number(process.argv[3] || 0)
  const 会话 = new Map()
  const 服务器 = http.createServer(async (请求, 响应) => {
    if (!请求.url.startsWith('/mcp')) { 响应.writeHead(404).end(); return }
    let 正文 = ''
    for await (const 块 of 请求) 正文 += 块
    const 数据 = 正文 ? JSON.parse(正文) : undefined
    const 标识 = 请求.headers['mcp-session-id']
    let 传输 = 标识 ? 会话.get(标识) : undefined
    if (!传输) {
      传输 = new StreamableHTTPServerTransport({ sessionIdGenerator: () => require('node:crypto').randomUUID(), onsessioninitialized: (新标识) => 会话.set(新标识, 传输) })
      await 创建服务().connect(传输)
    }
    await 传输.handleRequest(请求, 响应, 数据)
  })
  服务器.listen(端口, '127.0.0.1', () => { process.stdout.write(`PORT ${服务器.address().port}\n`) })
}
