// Independent, authenticated document conversion service. Never accepts file paths or URLs.
const http = require('node:http')
const crypto = require('node:crypto')
const formats = require('../../main/documentFormats.json')
const { convertWithOffice } = require('./office.cjs')
const maximumBytes = 20 * 1024 * 1024
const bodyLimit = Math.ceil(maximumBytes / 3) * 4 + 4096
const standard = { word: 'docx', table: 'xlsx', ppt: 'pptx' }

function validateConversion(input) {
  if (!input || typeof input !== 'object') throw new Error('转换请求无效')
  const source = formats.find(f => f.extension === input.inputFormat)
  const target = formats.find(f => f.extension === input.outputFormat)
  if (!source || !target || !standard[input.type] || (source.type !== input.type && source.extension !== 'xml') || target.type !== input.type || target.readOnlySource) throw new Error('转换格式不受支持')
  if (!target.outputFilter && target.extension !== standard[input.type]) throw new Error('此格式由应用本地保存')
  if (['xml', 'mhtml', 'prn'].includes(target.outputFilter)) throw new Error('此格式由应用本地保存')
  if (typeof input.data !== 'string' || input.data.length > bodyLimit || input.data.length % 4 !== 0) throw new Error('文件数据无效或超过 20 MiB')
  const bytes = Buffer.from(input.data, 'base64')
  if (!bytes.length || bytes.length > maximumBytes || bytes.toString('base64') !== input.data) throw new Error('文件数据无效或超过 20 MiB')
  return { ...input, bytes }
}
function createConverterServer({ token, executable, origins = ['*'], convert = convertWithOffice, concurrency = 2 } = {}) {
  if (typeof token !== 'string' || token.length < 32 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error('转换服务访问令牌需至少 32 位随机字母或数字')
  let active = 0
  const clients = new Map()
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin
    const allowedOrigin = !origin || origins.includes('*') || origins.includes(origin)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (origin && allowedOrigin) { res.setHeader('Access-Control-Allow-Origin', origins.includes('*') ? '*' : origin); res.setHeader('Vary', 'Origin') }
    const reply = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)) }
    if (!allowedOrigin) { reply(403, { error: '不允许的客户端来源' }); return }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      res.writeHead(204); res.end(); return
    }
    const supplied = Buffer.from(req.headers.authorization || ''), expected = Buffer.from('Bearer ' + token)
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) { reply(401, { error: '转换服务令牌无效' }); return }
    if (req.url === '/v1/capabilities' && req.method === 'GET') {
      reply(200, { protocol: 'seal-office-converter/1', maximumBytes, inputs: formats.filter(f => standard[f.type]).map(f => f.extension), outputs: formats.filter(f => standard[f.type] && !f.readOnlySource && (f.outputFilter || f.extension === standard[f.type]) && !['xml','mhtml','prn'].includes(f.outputFilter)).map(f => f.extension) }); return
    }
    if (req.url !== '/v1/convert' || req.method !== 'POST') { reply(404, { error: '接口不存在' }); return }
    const client = req.socket.remoteAddress, now = Date.now()
    for (const [key, record] of clients) if (now - record.start >= 60000) clients.delete(key)
    const rate = clients.get(client) || { start: now, count: 0 }; clients.set(client, rate)
    if (++rate.count > 20 || active >= concurrency) { reply(429, { error: '转换服务繁忙，请稍后重试' }); return }
    if (Number(req.headers['content-length']) > bodyLimit) { reply(413, { error: '文件超过 20 MiB' }); req.resume(); return }
    active++
    try {
      const chunks = []; let size = 0
      for await (const chunk of req) { size += chunk.length; if (size > bodyLimit) { reply(413, { error: '文件超过 20 MiB' }); return }; chunks.push(chunk) }
      const input = validateConversion(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      const output = await convert(input.bytes, input.inputFormat, input.outputFormat, input.type, { executable })
      if (!output?.length || output.length > maximumBytes) throw new Error('转换结果为空或超过 20 MiB')
      if (!res.destroyed) reply(200, { data: Buffer.from(output).toString('base64'), outputFormat: input.outputFormat })
    } catch (error) {
      if (!res.headersSent && !res.destroyed) reply(400, { error: error instanceof SyntaxError ? '请求数据无效' : error.message || '文档转换失败' })
    } finally { active-- }
  })
  server.requestTimeout = 120000; server.headersTimeout = 15000; server.keepAliveTimeout = 5000
  return server
}
if (require.main === module) {
  const server = createConverterServer({ token: process.env.SEAL_CONVERTER_TOKEN, executable: process.env.SEAL_OFFICE_EXECUTABLE || 'soffice', origins: (process.env.SEAL_CONVERTER_ORIGINS || '*').split(',') })
  const port = Number(process.env.PORT || 8298), host = process.env.HOST || '127.0.0.1'
  server.listen(port, host, () => process.stdout.write(`海豹办公文档转换服务：${host}:${port}\n`))
}
module.exports = { createConverterServer, validateConversion, maximumBytes }
