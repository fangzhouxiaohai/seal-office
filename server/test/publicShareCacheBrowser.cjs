// 在真实浏览器中复现旧后台页面缓存，并核验新版分享地址可打开下载页。
const { app, BrowserWindow, session } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { createShareLinkService } = require('../../main/cloud/shareLink')

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  let server, first, stale, second, fresh
  try {
    let oldPage = true
    const requests = []
    server = http.createServer((req, res) => {
      requests.push(req.url)
      if (req.url.startsWith('/api/v1/share-links/')) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        res.end(JSON.stringify({ requiresCode: false, expiresAt: null, downloads: 0 }))
      } else if (req.url.split('?')[0] === '/share/' && oldPage) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=86400' })
        res.end('<!doctype html><title>后台登录</title><p id="admin">登录管理后台</p><script src="/share/app.js"></script>')
      } else if (req.url === '/share/app.js' && oldPage) {
        res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=86400' })
        res.end('document.documentElement.dataset.oldScript="1"')
      } else if (req.url.split('?')[0] === '/share/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
        fs.createReadStream(path.join(__dirname, '../../share/index.html')).pipe(res)
      } else if (req.url.split('?')[0] === '/share/app.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' })
        fs.createReadStream(path.join(__dirname, '../../share/app.js')).pipe(res)
      } else {
        res.writeHead(404).end()
      }
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    const nodeId = randomUUID(), id = randomUUID()
    const service = createShareLinkService({
      status: () => ({ url: origin + '/api' }),
      list: async () => [{ id: nodeId, version: 1, meta: { filename: '隔离测试.txt' } }],
      keyFor: () => Buffer.alloc(32, 5),
      request: async () => ({ id }),
    })
    const generated = (await service.shareLinkCreate({ id, nodeId, expiryDays: 7 })).url
    const legacy = `${origin}/share/#/s/${randomUUID()}?a=old&k=old`
    const cached = session.fromPartition('share-cache-' + Date.now())
    first = new BrowserWindow({ show: false, webPreferences: { session: cached, sandbox: true } })
    await first.loadURL(legacy)
    assert.equal(await first.webContents.executeJavaScript('!!document.querySelector("#admin")'), true)
    oldPage = false
    stale = new BrowserWindow({ show: false, webPreferences: { session: cached, sandbox: true } })
    await stale.loadURL(legacy)
    assert.equal(await stale.webContents.executeJavaScript('!!document.querySelector("#admin")'), true, '复现旧地址仍命中已缓存的后台页')
    second = new BrowserWindow({ show: false, webPreferences: { session: cached, sandbox: true } })
    await second.loadURL(generated)
    const limit = Date.now() + 10000
    let isDownload = false
    while (Date.now() < limit) {
      isDownload = await second.webContents.executeJavaScript('Boolean(document.querySelector("#downloadArea") && !document.querySelector("#downloadArea").hidden)')
      if (isDownload) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.equal(isDownload, true, '旧后台页面缓存不能让新分享地址进入管理后台')
    assert.equal(await second.webContents.executeJavaScript('!!document.querySelector("#admin")'), false)
    assert.equal(await second.webContents.executeJavaScript('document.documentElement.dataset.oldScript || ""'), '', '下载页不能复用旧脚本缓存')
    assert.ok(requests.includes('/share/app.js?v=2'), '新版下载页必须请求新版脚本地址')
    fresh = new BrowserWindow({ show: false, webPreferences: { session: session.fromPartition('share-fresh-' + Date.now()), sandbox: true } })
    await fresh.loadURL(legacy)
    assert.equal(await fresh.webContents.executeJavaScript('document.title.includes("文件下载")'), true, '旧链接在无缓存访问时仍可打开下载页')
    assert.equal(requests.some(url => /[?&](?:a|k)=/.test(url)), false, '凭据不能进入 HTTP 请求地址')
    console.log('旧后台缓存下新链接、无缓存旧链接和片段隐私检查通过')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  } finally {
    for (const window of [first, stale, second, fresh]) if (window) window.destroy()
    if (server) await new Promise(resolve => server.close(resolve))
    app.exit(process.exitCode || 0)
  }
})
