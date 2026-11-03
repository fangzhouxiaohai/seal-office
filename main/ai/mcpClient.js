// MCP（Model Context Protocol）客户端：按官方规范 2025-06-18 实现 JSON-RPC 2.0 握手、工具列表与工具调用。
// 支持 stdio（桌面本机命令）与 Streamable HTTP（远程服务）两种标准传输；不依赖第三方运行时，移动端可复用 HTTP 传输。
const 协议版本 = '2025-06-18'
const 兼容版本 = ['2025-06-18', '2025-03-26', '2024-11-05']
const 请求超时 = 60000
const 工具超时 = 180000
const 本机主机 = ['localhost', '127.0.0.1', '[::1]']

const 是记录 = (值) => typeof 值 === 'object' && 值 !== null && !Array.isArray(值)

function 文本字段(值, 名称, 最大, 可空 = false) {
  if (值 === undefined || 值 === null) { if (可空) return ''; throw new Error(`请填写${名称}`) }
  if (typeof 值 !== 'string') throw new Error(`${名称}格式无效`)
  const 文本 = 值.trim()
  if (!文本 && !可空) throw new Error(`请填写${名称}`)
  if (文本.length > 最大) throw new Error(`${名称}过长：最多 ${最大} 个字符`)
  return 文本
}

function 键值表(值, 名称, 键规则) {
  if (值 === undefined) return {}
  if (!是记录(值) || Object.keys(值).length > 50) throw new Error(`${名称}格式无效：最多 50 项`)
  const 结果 = {}
  for (const [键, 内容] of Object.entries(值)) {
    if (!键规则.test(键)) throw new Error(`${名称}名称无效：${键}`)
    if (typeof 内容 !== 'string' || 内容.length > 8192 || /[\r\n]/.test(内容)) throw new Error(`${名称} ${键} 的值无效`)
    结果[键] = 内容
  }
  return 结果
}

/** 校验并规范 MCP 服务配置；非法时抛出可直接展示的中文原因。 */
function 校验MCP服务配置(输入) {
  if (!是记录(输入)) throw new Error('MCP 服务配置无效')
  const 名称 = 文本字段(输入.名称, 'MCP 服务名称', 40)
  if (!['stdio', 'http'].includes(输入.传输)) throw new Error('MCP 传输方式只支持 stdio 或 HTTP')
  const 基础 = { 名称, 传输: 输入.传输, 启用: 输入.启用 !== false, 禁用工具: Array.isArray(输入.禁用工具) ? 输入.禁用工具.filter(项 => typeof 项 === 'string').slice(0, 200) : [] }
  if (输入.传输 === 'stdio') {
    const 命令 = 文本字段(输入.命令, '启动命令', 1024)
    const 参数 = 输入.参数 ?? []
    if (!Array.isArray(参数) || 参数.length > 64 || 参数.some(项 => typeof 项 !== 'string' || 项.length > 4096)) throw new Error('启动参数格式无效：最多 64 项')
    return { ...基础, 命令, 参数, 环境: 键值表(输入.环境, '环境变量', /^[A-Za-z_][A-Za-z0-9_]{0,127}$/) }
  }
  const 地址文本 = 文本字段(输入.地址, 'MCP 服务地址', 2048)
  let 网址
  try { 网址 = new URL(地址文本) } catch { throw new Error('MCP 服务地址格式无效') }
  if (网址.username || 网址.password) throw new Error('MCP 服务地址不能包含账号或密码，请在请求头填写凭据')
  if (网址.protocol !== 'https:' && !(网址.protocol === 'http:' && 本机主机.includes(网址.hostname))) throw new Error('远程 MCP 服务须使用安全连接（https）；本机服务可使用 http')
  return { ...基础, 地址: 网址.toString(), 请求头: 键值表(输入.请求头, '请求头', /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,128}$/) }
}

/** 把 MCP 工具结果整理为模型可读文本；isError 按工具失败返回。 */
function 整理工具结果(结果) {
  const 内容 = Array.isArray(结果?.content) ? 结果.content : []
  const 文本 = 内容.map((项) => {
    if (项?.type === 'text') return String(项.text ?? '')
    if (项?.type === 'image' || 项?.type === 'audio') return `[${项.type === 'image' ? '图片' : '音频'} ${项.mimeType ?? ''}，${String(项.data ?? '').length} 字符 base64]`
    if (项?.type === 'resource') return 项.resource?.text ?? `[资源 ${项.resource?.uri ?? ''}]`
    if (项?.type === 'resource_link') return `[资源链接 ${项.name ?? ''} ${项.uri ?? ''}]`
    return ''
  }).filter(Boolean).join('\n') || (结果?.structuredContent ? JSON.stringify(结果.structuredContent) : '')
  return { 成功: 结果?.isError !== true, 文本, 内容 }
}

function 引用参数(值) {
  return /^[A-Za-z0-9_\-./:=\\@]+$/.test(值) ? 值 : `"${值.replace(/"/g, '\\"')}"`
}

/** stdio 传输：子进程标准输入输出逐行传递 JSON-RPC 消息，标准错误只用于诊断。 */
function 创建Stdio传输(配置, { spawn }) {
  if (typeof spawn !== 'function') throw new Error('当前平台不支持启动本机 MCP 命令，请改用 HTTP 服务')
  let 进程 = null, 缓冲 = '', 错误输出 = '', 接收 = () => {}, 断开 = () => {}
  return {
    async 启动(处理消息, 处理断开) {
      接收 = 处理消息; 断开 = 处理断开
      const Windows = process.platform === 'win32'
      // Windows 下 npx、uvx 等是 .cmd 脚本，需要经由命令解释器启动；参数逐个加引号避免拆分。
      进程 = Windows
        ? spawn([引用参数(配置.命令), ...配置.参数.map(引用参数)].join(' '), [], { shell: true, windowsHide: true, env: { ...process.env, ...配置.环境 }, stdio: ['pipe', 'pipe', 'pipe'] })
        : spawn(配置.命令, 配置.参数, { env: { ...process.env, ...配置.环境 }, stdio: ['pipe', 'pipe', 'pipe'] })
      await new Promise((完成, 失败) => {
        let 已结束 = false
        进程.once('spawn', () => { 已结束 = true; 完成() })
        进程.once('error', (错误) => { if (!已结束) { 已结束 = true; 失败(new Error(`无法启动 MCP 服务：${错误.message}`)) } else 断开(new Error(`MCP 服务进程异常：${错误.message}`)) })
      })
      进程.stdout.setEncoding('utf8')
      进程.stdout.on('data', (块) => {
        缓冲 += 块
        let 位置
        while ((位置 = 缓冲.indexOf('\n')) >= 0) {
          const 行 = 缓冲.slice(0, 位置).trim(); 缓冲 = 缓冲.slice(位置 + 1)
          if (!行) continue
          try { 接收(JSON.parse(行)) } catch { /* 规范要求 stdout 只输出协议消息；非 JSON 行忽略 */ }
        }
      })
      进程.stderr.setEncoding('utf8')
      进程.stderr.on('data', (块) => { 错误输出 = (错误输出 + 块).slice(-2000) })
      进程.once('exit', (代码) => 断开(new Error(`MCP 服务进程已退出（代码 ${代码 ?? '未知'}）${错误输出.trim() ? `：${错误输出.trim().split('\n').slice(-3).join(' ')}` : ''}`)))
    },
    async 发送(消息) {
      if (!进程 || 进程.exitCode !== null || !进程.stdin.writable) throw new Error('MCP 服务进程未运行')
      进程.stdin.write(JSON.stringify(消息) + '\n')
    },
    async 关闭() {
      if (!进程 || 进程.exitCode !== null) return
      try { 进程.stdin.end() } catch { /* 进程可能已退出 */ }
      await new Promise((完成) => { const 计时 = setTimeout(() => { try { 进程.kill() } catch { /* 已退出 */ } 完成() }, 1500); 进程.once('exit', () => { clearTimeout(计时); 完成() }) })
    },
  }
}

/** Streamable HTTP 传输：每条消息 POST 到同一端点，响应为 JSON 或 SSE 流；初始化后携带会话标识与协议版本头。 */
function 创建HTTP传输(配置, { fetch: 请求 }) {
  if (typeof 请求 !== 'function') throw new Error('当前环境无法发起网络请求')
  let 会话标识 = '', 版本 = '', 接收 = () => {}
  const 读取SSE = async (响应) => {
    const 读取器 = 响应.body.getReader(), 解码 = new TextDecoder()
    let 缓冲 = '', 数据 = []
    const 分发 = () => { if (!数据.length) return; const 文本 = 数据.join('\n'); 数据 = []; try { 接收(JSON.parse(文本)) } catch { /* 非 JSON 事件忽略 */ } }
    while (true) {
      const { value, done } = await 读取器.read()
      if (done) break
      缓冲 += 解码.decode(value, { stream: true })
      let 位置
      while ((位置 = 缓冲.search(/\r?\n/)) >= 0) {
        const 行 = 缓冲.slice(0, 位置); 缓冲 = 缓冲.slice(位置 + (缓冲[位置] === '\r' ? 2 : 1))
        if (行 === '') 分发()
        else if (行.startsWith('data:')) 数据.push(行.slice(5).replace(/^ /, ''))
      }
    }
    分发()
  }
  return {
    async 启动(处理消息) { 接收 = 处理消息 },
    设置协议版本(值) { 版本 = 值 },
    async 发送(消息) {
      let 响应
      try {
        响应 = await 请求(配置.地址, {
          method: 'POST', redirect: 'error',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...配置.请求头, ...(会话标识 ? { 'Mcp-Session-Id': 会话标识 } : {}), ...(版本 ? { 'MCP-Protocol-Version': 版本 } : {}) },
          body: JSON.stringify(消息),
        })
      } catch (错误) { throw new Error(`无法连接 MCP 服务：${错误?.cause?.code || 错误?.message || '网络错误'}`) }
      const 新标识 = 响应.headers.get('mcp-session-id')
      if (新标识) 会话标识 = 新标识
      if (响应.status === 401 || 响应.status === 403) throw new Error('MCP 服务鉴权失败，请检查请求头中的凭据')
      if (响应.status === 404 && 会话标识) throw new Error('MCP 服务会话已失效，请重新连接')
      if (!响应.ok) throw new Error(`MCP 服务返回错误状态 ${响应.status}`)
      if (响应.status === 202 || !('id' in 消息) || 消息.method === undefined && 消息.result !== undefined) { try { await 响应.body?.cancel?.() } catch { /* 无响应体 */ } return }
      const 类型 = 响应.headers.get('content-type') || ''
      if (类型.includes('text/event-stream')) await 读取SSE(响应)
      else if (类型.includes('application/json')) { const 数据 = await 响应.json(); for (const 项 of Array.isArray(数据) ? 数据 : [数据]) 接收(项) }
      else throw new Error('MCP 服务响应类型无效')
    },
    async 关闭() {
      if (!会话标识) return
      try { await 请求(配置.地址, { method: 'DELETE', headers: { ...配置.请求头, 'Mcp-Session-Id': 会话标识, ...(版本 ? { 'MCP-Protocol-Version': 版本 } : {}) } }) } catch { /* 服务端可不支持主动结束会话 */ }
      会话标识 = ''
    },
  }
}

/** 建立一个 MCP 连接；调用 初始化() 完成握手后才能列出和调用工具。 */
function 创建MCP连接(配置, 依赖 = {}) {
  const 传输 = 配置.传输 === 'stdio' ? 创建Stdio传输(配置, 依赖) : 创建HTTP传输(配置, 依赖)
  const 等待 = new Map()
  let 序号 = 0, 已初始化 = false, 已断开 = null
  const 失败全部 = (错误) => { for (const 项 of 等待.values()) 项.失败(错误); 等待.clear() }
  const 处理消息 = (消息) => {
    if (!是记录(消息) || 消息.jsonrpc !== '2.0') return
    if (消息.method && 'id' in 消息) {
      // 服务端发起的请求：响应 ping，其余能力本客户端未声明，按规范返回 Method not found。
      const 回复 = 消息.method === 'ping' ? { jsonrpc: '2.0', id: 消息.id, result: {} } : { jsonrpc: '2.0', id: 消息.id, error: { code: -32601, message: 'Method not found' } }
      void 传输.发送(回复).catch(() => {})
      return
    }
    if ('id' in 消息 && 等待.has(消息.id)) {
      const 项 = 等待.get(消息.id); 等待.delete(消息.id)
      if (消息.error) 项.失败(new Error(`MCP 服务返回错误：${消息.error.message ?? 消息.error.code}`))
      else 项.完成(消息.result)
    }
  }
  const 请求 = (方法, 参数, 超时 = 请求超时) => {
    if (已断开) return Promise.reject(已断开)
    const id = ++序号
    return new Promise((完成, 失败) => {
      const 计时 = setTimeout(() => { 等待.delete(id); 失败(new Error(`MCP 服务响应超时（${方法}）`)) }, 超时)
      等待.set(id, { 完成: (值) => { clearTimeout(计时); 完成(值) }, 失败: (错误) => { clearTimeout(计时); 失败(错误) } })
      传输.发送({ jsonrpc: '2.0', id, method: 方法, ...(参数 === undefined ? {} : { params: 参数 }) }).catch((错误) => { clearTimeout(计时); 等待.delete(id); 失败(错误) })
    })
  }
  const 通知 = (方法, 参数) => 传输.发送({ jsonrpc: '2.0', method: 方法, ...(参数 === undefined ? {} : { params: 参数 }) })
  return {
    async 初始化() {
      await 传输.启动(处理消息, (错误) => { 已断开 = 错误; 失败全部(错误) })
      const 结果 = await 请求('initialize', { protocolVersion: 协议版本, capabilities: {}, clientInfo: { name: 'seal-office', title: '海豹办公', version: '2.4.0' } })
      if (!兼容版本.includes(结果?.protocolVersion)) throw new Error(`MCP 服务协议版本 ${结果?.protocolVersion ?? '未知'} 不受支持`)
      传输.设置协议版本?.(结果.protocolVersion)
      await 通知('notifications/initialized')
      已初始化 = true
      return { 服务名称: 结果.serverInfo?.name ?? '', 服务版本: 结果.serverInfo?.version ?? '', 说明: typeof 结果.instructions === 'string' ? 结果.instructions.slice(0, 4000) : '', 协议版本: 结果.protocolVersion, 支持工具: Boolean(结果.capabilities?.tools) }
    },
    async 列出工具() {
      if (!已初始化) throw new Error('MCP 连接尚未初始化')
      const 工具 = []
      let 游标
      for (let 页 = 0; 页 < 20; 页++) {
        const 结果 = await 请求('tools/list', 游标 ? { cursor: 游标 } : {})
        for (const 项 of 结果?.tools ?? []) if (typeof 项?.name === 'string') 工具.push({ name: 项.name, title: 项.title, description: typeof 项.description === 'string' ? 项.description : '', inputSchema: 是记录(项.inputSchema) ? 项.inputSchema : { type: 'object', properties: {} } })
        游标 = 结果?.nextCursor
        if (!游标) break
      }
      return 工具
    },
    async 调用工具(名称, 参数) {
      if (!已初始化) throw new Error('MCP 连接尚未初始化')
      return 整理工具结果(await 请求('tools/call', { name: 名称, arguments: 参数 ?? {} }, 工具超时))
    },
    async 关闭() { 失败全部(new Error('MCP 连接已关闭')); 已断开 = 已断开 ?? new Error('MCP 连接已关闭'); await 传输.关闭() },
  }
}

module.exports = { 创建MCP连接, 校验MCP服务配置, 整理工具结果, 协议版本 }
