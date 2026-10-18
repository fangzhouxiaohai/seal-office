// Managed worker: conversion tokens never grant access to management routes.
const http = require('node:http')
const crypto = require('node:crypto')
const net = require('node:net')
const zlib = require('node:zlib')
const { promisify } = require('node:util')
const { execFile } = require('node:child_process')
const { createConverterServer, maximumBytes } = require('./index.cjs')
const { convertWithOffice } = require('./office.cjs')
const { validatePdf } = require('./pdf.cjs')

function textFromDocx(bytes) {
  for (let offset = 0; offset + 46 <= bytes.length; offset++) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) continue
    const length = bytes.readUInt16LE(offset + 28), name = bytes.subarray(offset + 46, offset + 46 + length).toString()
    if (name !== 'word/document.xml') continue
    const local = bytes.readUInt32LE(offset + 42), size = bytes.readUInt32LE(offset + 20)
    if (local + 30 > bytes.length || size > maximumBytes) break
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28)
    const data = bytes.subarray(start, start + size), method = bytes.readUInt16LE(offset + 10)
    const xml = method === 8 ? zlib.inflateRawSync(data, { maxOutputLength: maximumBytes }) : data
    return xml.toString('utf8').replace(/<[^>]+>/g, '')
  }
  throw new Error('转换测试未生成可读取的 DOCX')
}

async function createManagedConverter({ controlToken, executable = 'soffice', convert = convertWithOffice, probe, origins = ['*'] } = {}) {
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(controlToken || '')) throw new Error('管理通道未配置')
  const settings = { enabled: false, concurrency: 1, tokenHash: '', revision: '' }
  // 仅用于已通过 /internal/ 控制通道鉴权的请求；不落盘，也不向外返回。
  const gatewayToken=crypto.randomBytes(32).toString('base64url')
  let testing = false, lastTest = null
  let engine
  try {
    const version = probe ? await probe() : (await promisify(execFile)(executable, ['--version'], { timeout: 10000, maxBuffer: 65536, windowsHide: true })).stdout.trim()
    engine = { ready: Boolean(version), version: String(version).slice(0, 160), checkedAt: Date.now() }
  } catch { engine = { ready: false, version: '', checkedAt: Date.now(), error: '转换引擎不可用' } }
  const converter = createConverterServer({ executable, convert, origins,
    authorize: authorization => {
      const token = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(authorization)?.[1]
      if(token&&token.length===gatewayToken.length&&crypto.timingSafeEqual(Buffer.from(token),Buffer.from(gatewayToken)))return true
      if (!token || settings.tokenHash.length !== 64) return false
      return crypto.timingSafeEqual(crypto.createHash('sha256').update(token).digest(), Buffer.from(settings.tokenHash, 'hex'))
    }, configuration: () => ({ enabled: settings.enabled && engine.ready }),
    concurrency: () => testing ? 0 : settings.concurrency,
    clientIp: req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && net.isIP(req.headers['x-real-ip'] || '') ? req.headers['x-real-ip'] : req.socket.remoteAddress,
  })
  const reply = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)) }
  const server = http.createServer(async (req, res) => {
    if (!req.url.startsWith('/internal/')) { converter.emit('request', req, res); return }
    const header = Buffer.from(req.headers.authorization || ''), expected = Buffer.from('Bearer ' + controlToken)
    if (header.length !== expected.length || !crypto.timingSafeEqual(header, expected)) { reply(res, 401, { error: '管理通道鉴权失败' }); return }
    try {
      if((req.url==='/internal/convert'&&req.method==='POST')||(req.url==='/internal/capabilities'&&req.method==='GET')){
        req.url=req.url==='/internal/convert'?'/v1/convert':'/v1/capabilities';req.headers.authorization='Bearer '+gatewayToken
        converter.emit('request',req,res);return
      }
      if (req.url === '/internal/status' && req.method === 'GET') { reply(res, 200, { engine, settings: { enabled: settings.enabled, concurrency: settings.concurrency, revision: settings.revision }, statistics: converter.snapshot(), testing, lastTest, maximumBytes, timeoutSeconds: 90 }); return }
      if (req.url === '/internal/config' && req.method === 'POST') {
        let raw = ''
        for await (const chunk of req) { raw += chunk; if (raw.length > 4096) throw new Error('配置过大') }
        const input = JSON.parse(raw)
        if (typeof input.enabled !== 'boolean' || ![1, 2].includes(input.concurrency) || !/^(?:[a-f0-9]{64})?$/.test(input.tokenHash || '') || typeof input.revision !== 'string' || input.revision.length > 80) throw new Error('配置无效')
        if (input.enabled && (!engine.ready || !input.tokenHash)) throw new Error('请先准备转换引擎和访问令牌')
        Object.assign(settings, { enabled: input.enabled, concurrency: input.concurrency, tokenHash: input.tokenHash, revision: input.revision })
        reply(res, 200, { applied: true }); return
      }
      if (req.url === '/internal/test' && req.method === 'POST') {
        if (!engine.ready) { reply(res, 503, { error: '转换引擎不可用' }); return }
        if (testing || converter.snapshot().active) { reply(res, 409, { error: '已有转换任务运行，请完成后再测试' }); return }
        testing = true
        const startedAt = Date.now()
        try {
          const source = Buffer.from('<?xml version="1.0" encoding="UTF-8"?><w:wordDocument xmlns:w="http://schemas.microsoft.com/office/word/2003/wordml"><w:body><w:p><w:r><w:t>海豹办公转换测试 0012</w:t></w:r></w:p></w:body></w:wordDocument>')
          const doc = await convert(source, 'xml', 'doc', 'word', { executable })
          if (!Buffer.from(doc).subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'))) throw new Error('DOC 二进制测试失败')
          const docx = await convert(doc, 'doc', 'docx', 'word', { executable })
          if (!textFromDocx(Buffer.from(docx)).includes('海豹办公转换测试 0012')) throw new Error('中文和前导零测试失败')
          await validatePdf(await convert(docx, 'docx', 'pdf', 'word', { executable }))
          lastTest = { passed: true, finishedAt: Date.now(), milliseconds: Date.now() - startedAt, checks: ['真实 DOC 二进制输出', 'DOC 重开为 DOCX', '中文和前导零保留', 'DOCX 转 PDF 且实际页树有效'] }
          reply(res, 200, lastTest)
        } catch (error) { lastTest = { passed: false, finishedAt: Date.now(), error: String(error.message).slice(0, 200) }; reply(res, 400, lastTest) }
        finally { testing = false }
        return
      }
      reply(res, 404, { error: '管理接口不存在' })
    } catch { reply(res, 400, { error: '转换配置无效' }) }
  })
  server.requestTimeout = 120000; server.headersTimeout = 15000
  return { server, converter }
}
if (require.main === module) createManagedConverter({ controlToken: process.env.SEAL_CONVERTER_CONTROL_TOKEN, executable: process.env.SEAL_OFFICE_EXECUTABLE || 'soffice' })
  .then(({ server }) => {
    process.on('SIGTERM', () => { server.close(() => process.exit(0)); server.closeIdleConnections() })
    server.listen(Number(process.env.PORT || 8298), '127.0.0.1', () => console.log('Managed document converter ready'))
  })
  .catch(() => { console.error('Managed converter startup failed'); process.exitCode = 1 })
module.exports = { createManagedConverter, textFromDocx }
