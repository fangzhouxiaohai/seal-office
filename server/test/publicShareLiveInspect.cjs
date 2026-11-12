// 从标准输入接收分享地址，只输出路由与页面状态，避免保存地址和文件内容。
const { app, BrowserWindow, session } = require('electron')
const readline = require('node:readline')

app.disableHardwareAcceleration()
const supplied = process.env.SEAL_SHARE_PROBE_URL
delete process.env.SEAL_SHARE_PROBE_URL
const input = supplied ? null : readline.createInterface({ input: process.stdin, terminal: false })
const address = supplied ? Promise.resolve(supplied) : new Promise(resolve => input.once('line', resolve))
if (!supplied) console.log('等待地址')

app.whenReady().then(async () => {
  let window
  try {
    const raw = await address
    if (input) input.close()
    const parsed = new URL(raw)
    if (parsed.origin !== 'https://seal.xingmasoft.com' || parsed.pathname !== '/share/' || !parsed.hash.startsWith('#/s/')) {
      throw new Error('分享地址的域名或入口不符合验收范围')
    }
    const privateSession = session.fromPartition('share-live-check-' + Date.now())
    const externalRequests = []
    privateSession.webRequest.onBeforeRequest((details, done) => {
      const target = new URL(details.url)
      if (!['https://seal.xingmasoft.com', 'blob:'].includes(target.origin) && target.protocol !== 'blob:') externalRequests.push(target.origin)
      done({ cancel: false })
    })
    window = new BrowserWindow({ show: false, webPreferences: { session: privateSession, sandbox: true, contextIsolation: true } })
    await window.loadURL(raw)
    const limit = Date.now() + 15000
    let result
    while (Date.now() < limit) {
      result = await window.webContents.executeJavaScript(`({
        origin: location.origin,
        path: location.pathname,
        hashPreserved: location.hash.startsWith('#/s/'),
        download: Boolean(document.querySelector('#download')),
        codeVisible: Boolean(document.querySelector('#codeForm') && !document.querySelector('#codeForm').hidden),
        adminLogin: Boolean(document.querySelector('input[type=password]') && document.body.textContent.includes('登录管理后台')),
        titleOk: document.title.includes('文件下载'),
        ready: Boolean((document.querySelector('#codeForm') && !document.querySelector('#codeForm').hidden) ||
          (document.querySelector('#downloadArea') && !document.querySelector('#downloadArea').hidden))
      })`)
      if (result.ready) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    result.externalRequestCount = externalRequests.length
    if (process.argv.includes('--test-wrong-code') && result.codeVisible) {
      await window.webContents.executeJavaScript(`
        Object.defineProperty(crypto.subtle, 'decrypt', { value: async () => { throw new DOMException('校验未通过', 'OperationError') } });
        document.getElementById('code').value = '0000';
        document.getElementById('codeForm').requestSubmit();
      `, true)
      const wrongLimit = Date.now() + 10000
      let wrongResult
      while (Date.now() < wrongLimit) {
        wrongResult = await window.webContents.executeJavaScript(`({
          errorVisible: document.getElementById('status').textContent.includes('访问码不正确'),
          inputVisible: !document.getElementById('codeForm').hidden,
          inputFocused: document.activeElement.id === 'code',
          downloadHidden: document.getElementById('downloadArea').hidden
        })`)
        if (wrongResult.errorVisible) break
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      result.wrongCode = wrongResult
      if (!wrongResult.errorVisible || !wrongResult.inputVisible || !wrongResult.inputFocused || !wrongResult.downloadHidden) process.exitCode = 1
    }
    console.log(JSON.stringify(result))
    if (result.origin !== 'https://seal.xingmasoft.com' || result.path !== '/share/' || !result.hashPreserved || !result.download || result.adminLogin || !result.titleOk || !result.ready || externalRequests.length) process.exitCode = 1
  } catch (error) {
    console.error('公开分享浏览器检查失败：' + error.name)
    process.exitCode = 1
  } finally {
    if (window) window.destroy()
    app.exit(process.exitCode || 0)
  }
})
