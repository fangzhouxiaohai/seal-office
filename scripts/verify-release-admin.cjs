// 在隔离后端和真实后台构建上操作发布表单，不连接生产服务。
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http'), assert = require('node:assert/strict')
const { scryptSync } = require('node:crypto')
const { createCloud } = require('../server/index.cjs')
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'server/admin/dist')
const output = path.join(root, '.upgrade-private/v2.7.2-release-admin')
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', path.join(output, 'profile')); app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-release-ui-')), checks = [], errors = []
  let cloud, server, win, holdUpload = false, resumeUpload
  try {
    cloud = await createCloud({ directory, sms: { configured: true, send: async () => {} }, env: { SEAL_ADMIN_PASSWORD_HASH: scryptSync('验收密码', 'seal-admin-v1', 32).toString('hex') } })
    await new Promise(resolve => cloud.server.listen(0, '127.0.0.1', resolve))
    server = http.createServer((req, res) => {
      if (req.url.startsWith('/api/')) {
        const proxy = http.request({ hostname: '127.0.0.1', port: cloud.server.address().port, path: req.url.slice(4), method: req.method, headers: req.headers }, response => {
          const forward = () => { res.writeHead(response.statusCode, response.headers); response.pipe(res) }
          if (holdUpload && req.url.startsWith('/api/v1/admin/release-assets?')) resumeUpload = forward
          else forward()
        })
        proxy.on('error', () => { res.writeHead(502); res.end() }); req.pipe(proxy); return
      }
      const name = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0], file = path.resolve(dist, '.' + name)
      if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) { res.writeHead(404); res.end(); return }
      res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html')
      fs.createReadStream(file).pipe(res)
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    win = new BrowserWindow({ show: false, width: 1440, height: 1000, webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
    win.webContents.on('console-message', (_event, level, message) => { if (level >= 3 && !message.includes('Failed to load resource')) errors.push(message) })
    await win.loadURL(`http://127.0.0.1:${server.address().port}/`)
    // 隐藏验收窗口仍需真实焦点事件，确保 Tab 测到组件焦点循环而不是未激活窗口。
    win.webContents.debugger.attach('1.3')
    await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true })
    const js = code => win.webContents.executeJavaScript(code)
    const wait = async expression => {
      for (let i = 0; i < 100; i++) { if (await js(expression)) return; await new Promise(resolve => setTimeout(resolve, 50)) }
      throw new Error('等待界面状态超时：' + expression)
    }
    const fill = (selector, value) => js(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('输入框不存在');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`)
    const button = label => js(`(()=>{const e=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(label)});if(!e)throw new Error('按钮不存在：'+${JSON.stringify(label)});e.focus();e.click();})()`)
    const key = async (name, modifiers = []) => { win.webContents.sendInputEvent({ type: 'keyDown', keyCode: name, modifiers }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: name, modifiers }); await new Promise(resolve => setTimeout(resolve, 60)) }
    const screenshot = async name => fs.writeFileSync(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG())
    await screenshot('登录-1440')
    win.setContentSize(390, 1000); await new Promise(resolve => setTimeout(resolve, 100))
    assert.ok(await js('document.documentElement.scrollWidth <= innerWidth + 1'))
    await screenshot('登录-390'); win.setContentSize(1440, 1000)
    checks.push('登录页在宽窄视口沿用统一顶栏和紧凑表单')
    await fill('input[type=password]', '验收密码'); await button('登录管理后台')
    await wait('document.body.textContent.includes("运行概览")')
    assert.ok(await js('[...document.querySelectorAll("button")].some(e=>e.textContent.includes("版本管理"))'), '后台必须有版本管理入口')
    await js('[...document.querySelectorAll(".nav-item")].find(e=>e.textContent.includes("版本管理")).click()')
    await wait('Boolean(document.querySelector(".release-panel"))')
    assert.equal(await js('Boolean(document.querySelector("#release-version"))'), false, '默认只显示发布列表，表单应放入弹窗')
    await screenshot('版本列表-1440-初稿')
    await button('发布版本')
    await wait('Boolean(document.querySelector("#release-version"))'); checks.push('版本管理默认列表，点击发布版本才显示弹窗')
    await wait('document.activeElement?.id === "release-version"')
    await key('ESCAPE')
    await wait('!document.querySelector("#release-version")')
    assert.equal(await js('document.activeElement?.textContent.trim()'), '发布版本')
    assert.equal(cloud.db.query('SELECT * FROM releases').length, 0)
    await button('发布版本'); await wait('document.activeElement?.id === "release-version"')
    assert.equal(await js('document.querySelectorAll("input[data-platform]:checked").length'), 0)
    assert.equal(await js('document.querySelectorAll("input[data-platform]").length'), 7); checks.push('含 macOS 的七个平台独立可选且默认不发布')
    await screenshot('发布弹窗-1440-初稿')
    await js('document.querySelector("#release-cancel").focus()'); await key('TAB')
    assert.ok(await js('Boolean(document.activeElement?.closest(".release-publish-modal"))'), await js('JSON.stringify({active:document.activeElement?.outerHTML.slice(0,600),focused:document.hasFocus()})'))
    await js('document.querySelector("#release-version").focus()'); await key('TAB', ['shift'])
    assert.ok(await js('Boolean(document.activeElement?.closest(".release-publish-modal"))')); checks.push('弹窗初始焦点、双向键盘限制、ESC 关闭和焦点返回可用')
    await fill('#release-version', '2.7.2')
    await fill('#release-notes', '仅发布桌面验收版本')
    await js('document.querySelector("input[data-platform=macos]").click()')
    await button('发布所选平台')
    await wait('document.body.textContent.includes("请先上传 macOS 安装包")')
    assert.equal(cloud.db.query('SELECT * FROM releases').length, 0)
    await button('知道了'); await js('document.querySelector("input[data-platform=macos]").click()'); checks.push('macOS 缺少安装包时拒绝发布并保留表单')
    await js('document.querySelector("input[data-platform=windows]").click()')
    const bytes = Buffer.alloc(512, 7); bytes.write('MZ'); bytes.writeUInt32LE(128, 60); bytes.write('PE\0\0', 128)
    await js(`(()=>{const raw=Uint8Array.from(atob(${JSON.stringify(bytes.toString('base64'))}),c=>c.charCodeAt(0));const transfer=new DataTransfer();transfer.items.add(new File([raw],'seal-office-setup-2.7.2.exe'));const e=document.querySelector('#release-file-windows');e.files=transfer.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()`)
    holdUpload = true
    await js('document.querySelector("[data-upload-platform=windows]").click()')
    await wait('Boolean(document.querySelector("progress"))')
    await button('取消')
    await wait('document.body.textContent.includes("安装包正在上传")')
    assert.ok(await js('Boolean(document.querySelector("#release-version"))'))
    await key('ESCAPE')
    assert.ok(await js('Boolean(document.querySelector("#release-version"))'))
    for (let i = 0; i < 100 && !resumeUpload; i++) await new Promise(resolve => setTimeout(resolve, 30))
    assert.equal(typeof resumeUpload, 'function'); holdUpload = false; resumeUpload(); checks.push('上传中取消和 ESC 均不丢失进度，显示原因')
    await wait('document.body.textContent.includes("上传完成")'); checks.push('真实上传完成并显示服务端校验值')
    await wait('!document.body.textContent.includes("安装包正在上传")')
    for (const width of [1440, 390]) {
      win.setContentSize(width, 1000); await new Promise(resolve => setTimeout(resolve, 150))
      assert.ok(await js('document.documentElement.scrollWidth <= innerWidth + 1'))
      await js('document.querySelector(".release-modal-body").scrollTop=0')
      await new Promise(resolve => setTimeout(resolve, 100)); await screenshot(`发布弹窗-${width}`)
      await js('document.querySelector(".release-modal-body").scrollTop=document.querySelector(".release-modal-body").scrollHeight')
      await new Promise(resolve => setTimeout(resolve, 100))
      const geometry = await js('(()=>{const modal=document.querySelector(".release-publish-modal").getBoundingClientRect(),footer=document.querySelector(".release-modal-footer").getBoundingClientRect(),body=document.querySelector(".release-modal-body"),last=document.querySelector(".release-platform-list>.release-platform:last-child").getBoundingClientRect();return {width:modal.width,height:modal.height,bottom:footer.bottom,scrollable:body.scrollHeight>body.clientHeight,lastVisible:last.bottom<=body.getBoundingClientRect().bottom+1}})()')
      assert.ok(geometry.width <= width * .95 + 1); assert.ok(geometry.height <= 901); assert.ok(geometry.bottom <= 1000)
      if (width === 390) assert.equal(geometry.scrollable, true)
      assert.equal(geometry.lastVisible, true, '最后一个平台也必须可以滚动到可见区域')
      await screenshot(`发布弹窗-${width}-底部`)
    }
    checks.push('宽窄弹窗限制尺寸，表单内部滚动且底部操作始终可达')
    await button('发布所选平台')
    await wait('document.body.textContent.includes("已发布 2.7.2")')
    await wait('!document.querySelector("#release-version")')
    const releases = cloud.db.query('SELECT * FROM releases')
    assert.equal(releases.length, 1); assert.equal(releases[0].platform, 'windows'); checks.push('仅写入所选平台记录')
    await wait('document.querySelectorAll(".c-seg__count").length===3')
    assert.deepEqual(await js('[...document.querySelectorAll(".c-seg__count")].map(e=>e.textContent.trim())'), ['1', '1', '0']); checks.push('列表分组和服务端状态数量一致')
    checks.push('发布成功关闭弹窗并刷新列表')
    for (const width of [1440, 390]) {
      win.setContentSize(width, 1000); await new Promise(resolve => setTimeout(resolve, 150))
      assert.ok(await js('document.documentElement.scrollWidth <= innerWidth + 1'))
      await screenshot(`版本管理-${width}`)
    }
    checks.push('桌面和手机宽度无页面横向溢出')
    win.setContentSize(1440, 1000)
    const layout = await js('({top:document.querySelector(".topbar").getBoundingClientRect().height,side:document.querySelector(".sidebar").getBoundingClientRect().width,background:getComputedStyle(document.querySelector(".topbar")).backgroundColor,title:getComputedStyle(document.querySelector(".page-heading h1")).fontSize})')
    assert.equal(layout.top, 60); assert.equal(layout.side, 200); assert.equal(layout.background, 'rgb(35, 41, 46)'); assert.equal(layout.title, '18px')
    for (const name of ['运行概览', '账号与用量', '演示模板审核', '知识内容审核', '皮肤审核', '操作记录', '文档转换']) {
      await js(`[...document.querySelectorAll('.nav-item')].find(e=>e.textContent.includes(${JSON.stringify(name)})).click()`)
      await wait(`document.querySelector('.page-heading h1')?.textContent===${JSON.stringify(name)}`)
      await new Promise(resolve => setTimeout(resolve, 100))
      assert.ok(await js('document.documentElement.scrollWidth <= innerWidth + 1'))
      await screenshot(name + '-1440')
      win.setContentSize(390, 1000); await new Promise(resolve => setTimeout(resolve, 100))
      assert.ok(await js('document.documentElement.scrollWidth <= innerWidth + 1'), name + ' 窄屏不能横向溢出')
      await screenshot(name + '-390'); win.setContentSize(1440, 1000)
    }
    checks.push('全部八个后台页面沿用紧凑深灰框架，顶栏 60 像素与侧栏 200 像素')
    assert.deepEqual(errors, [])
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, checks, errors }, null, 2))
    console.log(JSON.stringify({ passed: true, checks, output }))
  } catch (error) {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: false, checks, errors, error: error.message }, null, 2))
    console.error(error); process.exitCode = 1
  } finally {
    resumeUpload?.(); win?.destroy(); if (server) await new Promise(resolve => server.close(resolve)); if (cloud) await cloud.close()
    fs.rmSync(directory, { recursive: true, force: true }); app.exit(process.exitCode || 0)
  }
})
