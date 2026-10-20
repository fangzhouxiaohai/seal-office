/* Production Web bridge + real local HTTP cloud integration. No public SMS, users or deployment. */
const { app, BrowserWindow, net } = require('electron')
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict')
const { createLocalCollaborationFixture } = require('../../server/test/collaborationFixture.cjs')
if (!global.fetch) global.fetch = net.fetch.bind(net)
const root = path.resolve(__dirname, '../unpackage/web'), output = path.resolve(__dirname, '../../.upgrade-private/collaboration-verification')
app.setPath('userData', path.join(output, 'profile-' + process.pid)); app.disableHardwareAcceleration()
const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ttf': 'font/ttf', '.png': 'image/png', '.svg': 'image/svg+xml' }
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https: wss:; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'"
app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true })
  let fixture, server, win
  const checks = [], errors = [], requests = []
  try {
    fixture = await createLocalCollaborationFixture()
    const data = text => Buffer.from(text).toString('base64')
    const own = await fixture.a.save({ linkId: 'browser-share', name: '网页共享.txt', data: data('浏览器共享😀𠀀') })
    const shared = await fixture.a.shareCreate({ id: own.id, recipientPhone: '13800111002', permission: 'edit' })
    const personal = await fixture.b.save({ linkId: 'browser-tag', name: '浏览器标签.txt', data: data('标签内容') })
    const tag = await fixture.b.tagCreate({ name: '浏览器验收标签' }); await fixture.b.tagAssign({ id: personal.id, tagIds: [tag.id] })
    const team = await fixture.a.teamCreate({ name: '网页验收团队' }), invitation = await fixture.a.teamInvite({ id: team.id, recipientPhone: '13800111002', role: 'viewer' })
    const teamFile = await fixture.a.teamSave({ id: team.id, name: '团队浏览器.txt', data: data('团队中文👩🏽‍💻é') })
    server = http.createServer((request, response) => {
      requests.push(request.url)
      if (request.url.startsWith('/api/')) {
        const upstream = http.request(fixture.url + request.url.slice(4), { method: request.method, headers: { ...request.headers, host: new URL(fixture.url).host } }, result => { response.writeHead(result.statusCode, result.headers); result.pipe(response) })
        upstream.on('error', () => { response.writeHead(502); response.end() }); request.pipe(upstream); return
      }
      const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/office\//, '/').replace(/\/$/, '/index.html'), filename = path.resolve(root, '.' + name)
      if (!filename.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return }
      if (!fs.existsSync(filename)) { response.writeHead(404); response.end(); return }
      response.writeHead(200, { 'Content-Type': contentTypes[path.extname(filename)] || 'application/octet-stream', 'Content-Security-Policy': csp }); fs.createReadStream(filename).pipe(response)
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = 'http://127.0.0.1:' + server.address().port
    win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { offscreen: true, contextIsolation: true, sandbox: true, nodeIntegration: false } })
    win.webContents.on('console-message', (_, level, message) => { if (level >= 3 && !/ERR_ABORTED|favicon/.test(message)) errors.push(message) })
    win.webContents.on('will-prevent-unload', event => event.preventDefault())
    const evaluate = async code => { const result = await win.webContents.executeJavaScript(`(async()=>{try{return {value:await(${code})}}catch(error){return{error:error.stack||String(error)}}})()`, true); if (result.error) throw new Error(result.error); return result.value }
    const wait = async (code, label) => { for (let i = 0; i < 160; i++) { if (await evaluate(code)) return; await new Promise(resolve => setTimeout(resolve, 100)) } throw new Error('等待失败：' + label) }
    const click = async text => evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(item=>item.getClientRects().length&&item.textContent.replace(/\\s/g,'')===${JSON.stringify(text.replace(/\s/g, ''))});if(!button)throw new Error('缺少按钮');button.click();return true})()`)
    const navigate = async (key, text) => {
      if (await evaluate('innerWidth<900')) { await evaluate(`document.querySelector('[aria-label="服务"]').click()`); await wait(`!!document.querySelector('[data-nav-key="${key}"]')`, key); await evaluate(`document.querySelector('[data-nav-key="${key}"]').click()`) }
      else await click(text)
      await wait(`document.querySelector('.seal-collaboration-header h1')?.textContent===${JSON.stringify(key === 'shared' ? '共享文档' : text)}`, key)
      await wait(`[...document.querySelectorAll('.ant-drawer-content-wrapper')].every(panel=>{const rect=panel.getBoundingClientRect();return !rect.height||rect.top>=innerHeight||rect.bottom<=0||getComputedStyle(panel).visibility==='hidden'})`, '移动导航关闭动画')
    }
    await win.loadURL(origin + '/office/'); await wait('!!window.electronAPI&&!!document.querySelector(".wps-app")', '生产网页启动')
    fixture.advance(61000)
    const codeResult = await evaluate(`window.electronAPI.cloud.invoke('code',{phone:'13800111002'})`); assert.equal(codeResult.成功, true, JSON.stringify(codeResult))
    const login = await evaluate(`window.electronAPI.cloud.invoke('login',{phone:'13800111002',code:${JSON.stringify(fixture.codes.get('13800111002'))}})`); assert.equal(login.成功, true, JSON.stringify(login))
    const unlock = await evaluate(`window.electronAPI.cloud.invoke('unlock',{recovery:${JSON.stringify(fixture.recoveries.get('13800111002'))}})`); assert.equal(unlock.成功, true, JSON.stringify(unlock))
    const accepted = await evaluate(`window.electronAPI.cloud.invoke('shareAccept',{credential:${JSON.stringify(shared.credential)}})`); assert.equal(accepted.成功, true, JSON.stringify(accepted))
    await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.webContents.reload() }); await wait('!!window.electronAPI&&!!document.querySelector(".wps-app")', '登录状态刷新')
    await win.loadURL(origin + '/office/#team=' + encodeURIComponent(invitation.credential)); await wait(`document.body.textContent.includes('接收团队邀请')&&[...document.querySelectorAll('button')].some(button=>button.textContent.replace(/\s/g,'')==='确认接收')`, '真实团队链接确认')
    assert.equal(await evaluate('location.hash'), ''); await click('确认接收')
    await wait(`document.querySelector('.seal-collaboration-header h1')?.textContent==='团队空间'&&document.body.textContent.includes('团队浏览器.txt')`, '团队加密内容')
    assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent==='新建团队文件夹')?.disabled`), true)
    const privateCopy = await evaluate(`window.electronAPI.cloud.invoke('teamDownload',{id:${JSON.stringify(team.id)},nodeId:${JSON.stringify(teamFile.id)}})`)
    assert.equal(privateCopy.成功, true, JSON.stringify(privateCopy)); assert.match(privateCopy.数据.path, /^\/seal\/documents\/collaboration\//)
    const read = await evaluate(`window.electronAPI.readFile(${JSON.stringify(privateCopy.数据.path)})`); assert.equal(read.内容, '团队中文👩🏽‍💻é')
    const save = await evaluate(`window.electronAPI.saveToFile(${JSON.stringify(privateCopy.数据.path)},'只改本机的团队副本','文本')`); assert.equal(save.成功, true, JSON.stringify(save))
    assert.equal(Buffer.from((await fixture.a.teamDownload({ id: team.id, nodeId: teamFile.id })).data, 'base64').toString(), '团队中文👩🏽‍💻é')
    checks.push('同域账号登录+解锁、hash邀请确认与清理、团队查看者禁写、私有下载在文档目录可本机保存且未自动云覆盖')
    for (const width of [1280, 390, 360]) {
      win.setContentSize(width, 900); await new Promise(resolve => setTimeout(resolve, 200))
      for (const [key, label, expected] of [['shared', '共享', '网页共享.txt'], ['device', '我的设备', '当前设备'], ['tag', '标签', '浏览器验收标签'], ['team', '团队空间', '团队浏览器.txt']]) {
        await navigate(key, label); await wait(`document.body.textContent.includes(${JSON.stringify(expected)})`, label + '数据')
        const layout = await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})'); assert.ok(layout.scroll <= layout.width + 1, JSON.stringify({ key, ...layout }))
        if (key === 'tag') { await click('● 浏览器验收标签 · 1'); await wait(`document.body.textContent.includes('浏览器标签.txt')`, '标签真实筛选') }
        fs.writeFileSync(path.join(output, `collaboration-${key}-${width}.png`), (await win.capturePage()).toPNG())
      }
      fs.writeFileSync(path.join(output, `collaboration-${width}.png`), (await win.capturePage()).toPNG())
      checks.push(width + 'px 四个真实导航、服务数据与页面无横向溢出')
    }
    assert.ok(requests.some(uri => uri.startsWith('/api/v1/teams')))
    assert.ok(requests.every(uri => !uri.includes('seal-team-v1') && !uri.includes('seal-share-v1')))
    assert.equal(errors.length, 0, errors.join('\n'))
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: true, checks, errors }, null, 2)); console.log(JSON.stringify({ passed: true, checks, output }, null, 2)); app.exit(0)
  } catch (error) { const state = win ? await win.webContents.executeJavaScript(`({headings:[...document.querySelectorAll('h1')].map(node=>node.textContent),active:[...document.querySelectorAll('.wps-homenav__item--active')].map(node=>node.textContent),body:document.body.innerText.slice(-2500)})`).catch(()=>null) : null; fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ passed: false, checks, errors, state, error: error.stack }, null, 2)); console.error(error); app.exit(1) }
  finally { win?.destroy(); server?.closeAllConnections?.(); server?.close(); await fixture?.cleanup() }
})
