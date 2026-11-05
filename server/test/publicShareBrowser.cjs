const { app, BrowserWindow, session } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { randomBytes, randomUUID, createHash } = require('node:crypto')
const { createCloud } = require('../index.cjs')
const { seal } = require('../../main/cloud/crypto.js')
const { clientWrapKey } = require('../../main/cloud/shareLink.js')

const 片段 = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const 密钥文本 = value => Buffer.from(value).toString('base64url')
const 等待 = async (check, timeout = 15000) => {
  const until = Date.now() + timeout
  while (Date.now() < until) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)) }
  throw new Error('匿名下载页等待超时')
}

app.disableHardwareAcceleration()
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-public-share-browser-'))
app.setPath('userData', path.join(temp, 'profile'))
app.commandLine.appendSwitch('disable-http-cache')
app.whenReady().then(async () => {
  let cloud, staticServer, window
  let exitCode = 0
  try {
    const codes = new Map()
    cloud = await createCloud({ directory: path.join(temp, 'cloud'), sms: { configured: true, send: async (phone, code) => codes.set(phone, code) }, env: {} })
    await new Promise(resolve => cloud.server.listen(0, '127.0.0.1', resolve))
    const cloudOrigin = `http://127.0.0.1:${cloud.server.address().port}`
    const request = async (route, { method = 'GET', token, body } = {}) => {
      const response = await fetch(cloudOrigin + route, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
      const result = await response.json()
      assert.equal(response.status, 200, JSON.stringify(result))
      return result
    }
    const phone = '13800111909'
    await request('/v1/auth/code', { method: 'POST', body: { phone } })
    const account = await request('/v1/auth/login', { method: 'POST', body: { phone, code: codes.get(phone) } })
    await request('/v1/space/enable', { method: 'POST', token: account.token, body: { consent: true, envelope: 'isolated-test', agreementVersion: '2026-10-08' } })
    const nodeId = randomUUID(), key = randomBytes(32), content = Buffer.from('匿名下载的真实文件内容\n', 'utf8')
    const cipher = seal(key, content, `seal-data:${nodeId}`)
    await request('/v1/nodes', { method: 'POST', token: account.token, body: { id: nodeId, kind: 'file', meta: 'encrypted-test-meta' } })
    const upload = await request('/v1/uploads', { method: 'POST', token: account.token, body: { nodeId, expected: 0, bytes: cipher.length } })
    const put = await fetch(`${cloudOrigin}/v1/uploads/${upload.id}`, { method: 'PUT', headers: { Authorization: `Bearer ${account.token}`, 'X-Seal-Offset': '0', 'Content-Type': 'application/octet-stream' }, body: cipher })
    assert.equal(put.status, 200)
    await request(`/v1/uploads/${upload.id}/commit`, { method: 'POST', token: account.token, body: {} })
    const linkId = randomUUID(), access = randomBytes(32).toString('base64url')
    await request('/v1/share-links', { method: 'POST', token: account.token, body: { id: linkId, nodeId, accessHash: createHash('sha256').update(access).digest('hex'), expiryDays: 7 } })

    staticServer = http.createServer((req, res) => {
      if (req.url.startsWith('/api/')) {
        const upstream = http.request(cloudOrigin + req.url.slice(4), { method: req.method, headers: req.headers }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res) })
        upstream.on('error', () => { res.writeHead(502); res.end() })
        req.pipe(upstream)
        return
      }
      const file = req.url === '/share/' ? 'index.html' : req.url === '/share/app.js' ? 'app.js' : ''
      if (!file) { res.writeHead(404); res.end(); return }
      res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'" })
      fs.createReadStream(path.join(__dirname, '../../share', file)).pipe(res)
    })
    await new Promise(resolve => staticServer.listen(0, '127.0.0.1', resolve))
    const pageOrigin = `http://127.0.0.1:${staticServer.address().port}`
    const url = `${pageOrigin}/share/#/s/${linkId}?a=${access}&k=${片段({ v: 1, n: '匿名测试.txt', k: 密钥文本(key), i: nodeId })}`
    window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } })
    const errors = []
    window.webContents.on('console-message', (_, level, message) => { if (level >= 2) errors.push(message) })
    await window.loadURL(url)
    await 等待(() => window.webContents.executeJavaScript('document.getElementById("fileName").textContent === "匿名测试.txt" && !document.getElementById("downloadArea").hidden'))
    const destination = path.join(temp, 'downloaded.txt')
    const downloaded = new Promise((resolve, reject) => session.defaultSession.once('will-download', (_, item) => {
      item.setSavePath(destination)
      item.once('done', (_event, state) => state === 'completed' ? resolve() : reject(new Error(`下载状态：${state}`)))
    }))
    await window.webContents.executeJavaScript('document.getElementById("download").click()', true)
    await Promise.race([downloaded, new Promise((_, reject) => setTimeout(async () => {
      const status = await window.webContents.executeJavaScript('document.getElementById("status").textContent')
      reject(new Error(`未触发浏览器下载：${status}；浏览器错误：${errors.join(' | ')}`))
    }, 15000))])
    assert.deepEqual(fs.readFileSync(destination), content)

    const protectedId = randomUUID(), protectedAccess = randomBytes(32).toString('base64url'), code = '2468'
    await request('/v1/share-links', { method: 'POST', token: account.token, body: { id: protectedId, nodeId, accessHash: createHash('sha256').update(protectedAccess).digest('hex'), expiryDays: 7, code } })
    const wrapped = seal(clientWrapKey(code, protectedId), key, `seal-share-link:${protectedId}`)
    await window.loadURL(`${pageOrigin}/share/#/s/${protectedId}?a=${protectedAccess}&k=${片段({ v: 1, n: '访问码测试.txt', k: 密钥文本(wrapped), i: nodeId })}`)
    window.webContents.reload()
    await 等待(() => window.webContents.executeJavaScript('document.getElementById("fileName").textContent === "访问码测试.txt" && !document.getElementById("codeForm").hidden'))
    const protectedDestination = path.join(temp, 'protected-download.txt')
    const protectedDownload = new Promise((resolve, reject) => session.defaultSession.once('will-download', (_, item) => {
      item.setSavePath(protectedDestination)
      item.once('done', (_event, state) => state === 'completed' ? resolve() : reject(new Error(`访问码下载状态：${state}`)))
    }))
    await window.webContents.executeJavaScript('document.getElementById("code").value="2468";document.getElementById("codeForm").requestSubmit()', true)
    await Promise.race([protectedDownload, new Promise((_, reject) => setTimeout(async () => {
      const status = await window.webContents.executeJavaScript('document.getElementById("status").textContent')
      reject(new Error(`访问码下载未触发：${status}`))
    }, 15000))])
    assert.deepEqual(fs.readFileSync(protectedDestination), content)
    assert.equal(errors.filter(error => /Content Security Policy|Refused to execute/.test(error)).length, 0)
    console.log('匿名分享页显示文件信息；直接下载与访问码下载均在浏览器中解密，保存内容与原文件一致')
  } catch (error) { console.error(error); exitCode = 1 }
  finally {
    if (window) window.destroy()
    if (staticServer) await new Promise(resolve => staticServer.close(resolve))
    if (cloud) await cloud.close()
    const safeRoot = fs.realpathSync(os.tmpdir()) + path.sep
    if (!fs.realpathSync(temp).startsWith(safeRoot)) throw new Error('临时验收目录越界')
    app.once('quit', () => { try { fs.rmSync(temp, { recursive: true, force: true }) } catch (error) { console.warn('临时浏览器资料将在退出后清理：', error.message) } })
    app.exit(exitCode)
  }
}).catch(error => { console.error(error); app.exit(1) })
