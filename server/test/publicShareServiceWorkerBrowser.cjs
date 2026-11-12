// 验证旧根作用域服务工作线程的影响和受控恢复边界。
const { app, BrowserWindow, session } = require('electron')
const assert = require('node:assert/strict')
const http = require('node:http')

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  let server, setup, blocked, restored
  try {
    server = http.createServer((req, res) => {
      if (req.url === '/sw-test.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' })
        res.end(`self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(clients.claim()));self.addEventListener('fetch',e=>{if(e.request.mode==='navigate'&&new URL(e.request.url).pathname==='/share/')e.respondWith(new Response('<title>后台登录</title><p id="admin">后台</p>',{headers:{'Content-Type':'text/html','Cache-Control':'no-store'}}))})`)
      } else if (req.url === '/registration') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end('<title>本机模拟</title>')
      } else if (req.url.startsWith('/share/')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end('<title>文件下载</title><button id="download">下载文件</button>')
      } else res.writeHead(404).end()
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    const isolated = session.fromPartition('share-worker-' + Date.now())
    setup = new BrowserWindow({ show: false, webPreferences: { session: isolated, sandbox: true } })
    await setup.loadURL(origin + '/registration')
    await setup.webContents.executeJavaScript(`navigator.serviceWorker.register('/sw-test.js', {scope:'/'}).then(() => navigator.serviceWorker.ready)`)
    const limit = Date.now() + 10000
    while (Date.now() < limit && !await setup.webContents.executeJavaScript('Boolean(navigator.serviceWorker.controller)')) await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(await setup.webContents.executeJavaScript('Boolean(navigator.serviceWorker.controller)'), true)
    blocked = new BrowserWindow({ show: false, webPreferences: { session: isolated, sandbox: true } })
    await blocked.loadURL(origin + '/share/?v=2#/s/example')
    assert.equal(await blocked.webContents.executeJavaScript('Boolean(document.getElementById("admin"))'), true, '模拟旧根作用域线程应能拦截分享页')
    await setup.webContents.executeJavaScript('navigator.serviceWorker.getRegistrations().then(items => Promise.all(items.map(item => item.unregister())))')
    restored = new BrowserWindow({ show: false, webPreferences: { session: isolated, sandbox: true } })
    await restored.loadURL(origin + '/share/?v=2#/s/example')
    assert.equal(await restored.webContents.executeJavaScript('Boolean(document.getElementById("download"))'), true, '注销模拟旧注册后应回到分享页')
    console.log('模拟根作用域线程拦截及注销后的恢复边界已验证')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  } finally {
    for (const window of [setup, blocked, restored]) if (window) window.destroy()
    if (server) await new Promise(resolve => server.close(resolve))
    app.exit(process.exitCode || 0)
  }
})
