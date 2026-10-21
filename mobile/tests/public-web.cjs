/* Read-only acceptance of the public origin. All created documents stay in an isolated browser profile. */
const { app, BrowserWindow, net } = require('electron')
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict')
if (!global.fetch) global.fetch = net.fetch.bind(net)
const local = process.argv.includes('--local'), output = path.resolve(__dirname, '../../.upgrade-private/public-web-verification'), webRoot = path.resolve(__dirname, '../unpackage/web')
const group = process.argv.find(argument=>argument.startsWith('--group='))?.slice(8) || 'all'
assert(['all','documents','templates','projects'].includes(group))
const includes = name => group === 'all' || group === name
const reportFile = (local ? 'local' : 'public') + (group === 'all' ? '' : '-' + group) + '-result.json'
const url = local ? null : 'https://seal.xingmasoft.com/office/'
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https: wss:; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'"
app.setPath('userData', path.join(output, (local ? 'local-' : 'public-') + process.pid)); app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true })
  const checks = [], errors = [], completed = [], failures = []
  let template = null
  const projectLists = []
  const recordCheck = (...items) => { console.log(JSON.stringify({at:new Date().toISOString(),passedChecks:items})); checks.push(...items) }
  let win, server, fixture, code = 1
  try {
    let target = url
    if (local) {
      fixture = await require('../../server/test/collaborationFixture.cjs').createLocalCollaborationFixture(null, { clients: false })
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.otf': 'font/otf', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' }
      server = http.createServer((request, response) => {
        if (request.url.startsWith('/api/')) { const upstream = http.request(fixture.url + request.url.slice(4), { method: request.method, headers: { ...request.headers, host: new URL(fixture.url).host } }, result => { response.writeHead(result.statusCode, result.headers); result.pipe(response) }); upstream.on('error', () => { response.writeHead(502); response.end() }); request.pipe(upstream); return }
        const filename = path.resolve(webRoot, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/office\//, '/').replace(/\/$/, '/index.html'))
        if (!filename.startsWith(webRoot + path.sep) || !fs.existsSync(filename)) { response.writeHead(404); response.end(); return }
        response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Content-Security-Policy': csp }); fs.createReadStream(filename).pipe(response)
      })
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); target = 'http://127.0.0.1:' + server.address().port + '/office/'
    }
    win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false } })
    win.webContents.session.on('will-download', (_event, item) => item.cancel())
    win.webContents.on('will-prevent-unload', event => event.preventDefault())
    win.webContents.on('console-message', (_event, level, message) => { if (level >= 3 && !/favicon|ERR_ABORTED|status of 401/.test(message)) errors.push(message) })
    win.webContents.session.webRequest.onCompleted(details => { if (/^https?:/.test(details.url)) { const value = new URL(details.url); completed.push({ origin: value.origin, path: value.pathname, status: details.statusCode }); if (/\.(?:js|css|ttf|otf)$/.test(value.pathname)) console.log(JSON.stringify({at:new Date().toISOString(),resource:value.pathname,status:details.statusCode})) } })
    win.webContents.session.webRequest.onErrorOccurred(details => { if (!/ERR_ABORTED/.test(details.error)) failures.push({ path: new URL(details.url).pathname, error: details.error }) })
    const evaluate = async script => { const result = await win.webContents.executeJavaScript(`(async()=>{try{return {value:await(${script})}}catch(error){return{error:error.stack||String(error)}}})()`, true); if (result.error) throw new Error(result.error); return result.value }
    const wait = async (script, label, attempts = 200) => { console.log(JSON.stringify({at:new Date().toISOString(),waiting:label})); for (let i = 0; i < attempts; i++) { if (await evaluate(script)) return; await new Promise(resolve => setTimeout(resolve, 100)) } throw new Error('等待失败：' + label) }
    const click = async text => evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(item=>item.getClientRects().length&&item.textContent.replace(/\s/g,'')===${JSON.stringify(text.replace(/\s/g, ''))});if(!button)throw new Error('缺少按钮');button.click();return true})()`)
    const home = async () => { await evaluate(`(document.querySelector('.seal-mobile-nav [aria-label="返回首页"]')||document.querySelector('.wps-global-tabs__home')).click()`); await wait('!!document.querySelector(".wps-homebody")', '首页') }
    console.log(JSON.stringify({at:new Date().toISOString(),loading:target})); await win.loadURL(target); await wait('!!window.electronAPI&&!!document.querySelector(".wps-app")', '应用启动', 900)
    const unauth = await evaluate(`(async()=>{const caps=await(await fetch('/api/v1/capabilities')).json();const status={};for(const name of ['ai/identity','conversion/capabilities','shares','devices','tags','teams','realtime/node/00000000-0000-4000-8000-000000000001/updates?after=0&initial=1','realtime/share/00000000-0000-4000-8000-000000000001/updates?after=0&initial=1','realtime/team/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/updates?after=0&initial=1'])status[name]=(await fetch('/api/v1/'+name)).status;return {caps,status}})()`)
    assert.equal(unauth.caps.version, 1); assert.equal(unauth.caps.collaboration, 1); assert.equal(unauth.caps.accountConversion, 1); assert.equal(unauth.caps.realtime, 1); assert.equal(unauth.caps.diagramRealtime, 1); assert.equal(unauth.caps.aiIdentity, 1); assert.ok(Object.values(unauth.status).every(value => value === 401))
    recordCheck('公开同域API diagramRealtime/realtime/collaboration/accountConversion能力正确；AI身份/共享/设备/标签/团队/转换及共享/团队实时快照匿名请求均401；未创建账号或房间')
    if (includes('documents')) {
    await evaluate(`(()=>{const original=window.electronAPI.saveToFile;window.__webTestSaved=[];window.electronAPI.saveToFile=async(...args)=>{const result=await original(...args);window.__webTestSaved.push({path:args[0],result});return result};document.querySelector('.wps-homesidebar__actions button').click()})()`)
    await wait('!!document.querySelector(".wps-newdoc-option")', '新建对话框')
    await evaluate(`[...document.querySelectorAll('.wps-newdoc-option')].find(button=>button.textContent.includes('文字文档')).click()`)
    await wait('!!document.querySelector(".wps-editor-canvas__content")', '文字新建')
    await evaluate(`(()=>{const editor=document.querySelector('.wps-editor-canvas__content');editor.focus();editor.innerHTML='<p>公开网页本机验收😀𠀀 &amp; 中文</p>';editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'公开网页本机验收'}));editor.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true}))})()`)
    await wait('window.__webTestSaved.length>0', '真实快捷键保存')
    const word = await evaluate(`(async()=>{const entry=window.__webTestSaved[0],read=await window.electronAPI.readFile(entry.path),ext=entry.path.split('.').pop().toLowerCase(),opened=ext==='docx'?await window.electronAPI.office.readDocx(read.内容):await window.electronAPI.office.readSeal(ext,read.内容);return{saved:entry.result,opened}})()`)
    assert.equal(word.saved.成功, true); assert.equal(word.opened.成功, true); assert.match(word.opened.html, /公开网页本机验收😀𠀀/)
    recordCheck('真实UI新建文字、输入中文/Unicode、Ctrl+S写本机文件并按SLDOC/DOCX实际格式读回')
    await home(); await evaluate(`document.querySelector('.wps-homesidebar__actions button').click()`); await wait('!!document.querySelector(".wps-newdoc-option")','表格新建对话框');await evaluate(`[...document.querySelectorAll('.wps-newdoc-option')].find(button=>button.textContent.includes('电子表格')).click()`)
    await wait(`!!document.querySelector('[aria-label="公式栏"]')`,'表格公式栏');await evaluate(`(()=>{const input=document.querySelector('[aria-label="公式栏"]');input.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'=ROUND(1.235,2)');input.dispatchEvent(new Event('input',{bubbles:true}))})()`);await new Promise(resolve=>setTimeout(resolve,100));await evaluate(`document.querySelector('[aria-label="公式栏"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`)
    await wait(`document.querySelector('[data-地址="A1"]')?.textContent==='1.24'`,'严格CSP下真实表格公式计算')
    const spreadsheet=await evaluate(`(async()=>{const api=window.electronAPI,file=await api.office.writeXlsx({工作表:[{名称:'公开网页表格',数据:[['金额',12.5],['计算',{公式:'B1*2',结果:25}]]}]});if(!file.成功)throw new Error(file.错误);return api.office.readXlsx(file.数据)})()`);assert.equal(spreadsheet.成功,true);assert.match(spreadsheet.html,/data-formula="=B1\*2"/)
    recordCheck('严格CSP下真实表格输入ROUND公式计算为1.24，XLSX公式与缓存真实往返保留')
    }
    if (includes('templates')) {
    await home(); await evaluate(`document.querySelector('.wps-homesidebar__actions button').click()`); await wait('!!document.querySelector(".wps-newdoc-option--template")', '模板入口'); await evaluate(`document.querySelector('.wps-newdoc-option--template').click()`)
    await wait('!!document.querySelector(".template-library__thumb--ppt")', '按需下载完整模板摄影资源', 1800); await evaluate(`document.querySelector('.template-library__thumb--ppt').closest('article').querySelector('.template-library__preview-trigger').click()`)
    await wait(`document.querySelectorAll('.template-library__detail .template-presentation-page').length===9&&[...document.querySelectorAll('.template-library__detail img')].every(image=>image.complete&&image.naturalWidth>0)`, '九页摄影模板')
    template = await evaluate(`({pages:document.querySelectorAll('.template-library__detail .template-presentation-page').length,images:[...document.querySelectorAll('.template-library__detail img')].map(image=>({valid:image.naturalWidth>0,inline:image.src.startsWith('data:')||image.src.startsWith('blob:')}))})`)
    assert.ok(template.images.length >= 5); assert.ok(template.images.every(image => image.valid && image.inline))
    // All photos can decode before the previous modal and new drawer finish
    // their transitions. Capture the actual settled preview rather than a frame
    // with the drawer halfway off-screen.
    await new Promise(resolve=>setTimeout(resolve,400))
    fs.writeFileSync(path.join(output, local ? 'local-template.png' : 'public-template.png'), (await win.capturePage()).toPNG())
    await click('使用此模板'); await wait('!!document.querySelector(".wps-ppt-canvas")', '模板可编辑文稿')
    await wait(`document.querySelectorAll('.wps-ppt-canvas img').length>0&&[...document.querySelectorAll('.wps-ppt-canvas img')].every(image=>image.complete&&image.naturalWidth>0)`, '模板本地资源恢复')
    recordCheck('九页模板真实摄影内嵌且全部加载，使用模板后可编辑画布恢复图片，无外链图片依赖')
    }
    if (includes('documents')) {
    console.log(JSON.stringify({at:new Date().toISOString(),starting:'公开PDF生成'}))
    const pdf = await evaluate(`(async()=>{const api=window.electronAPI,result=await api.printPreview('<h1>公开网页PDF验收</h1><p>同域字体与本地Worker中文内容</p>','html');if(!result.成功)throw new Error(result.错误);const name=await api.showSaveDialog('公开网页PDF验收.pdf');const saved=await api.saveToFile(name,result.数据,'二进制');if(!saved.成功)throw new Error(saved.错误);return name})()`)
    await home(); await evaluate(`(()=>{const original=window.electronAPI.showOpenDialog;window.electronAPI.showOpenDialog=async()=>{window.electronAPI.showOpenDialog=original;return ${JSON.stringify(pdf)}};document.querySelector('.wps-homesidebar__actions button:nth-child(2)').click()})()`)
    await wait(`!!document.querySelector('.pdf-viewer__canvas')?.width&&document.querySelector('.pdf-viewer__text-layer')?.textContent.includes('公开网页PDF验收')`, '严格CSP下PDF本地Worker绘制', 500)
    recordCheck('同域中文字体PDF生成、文件读取，严格CSP下本地PDF Worker绘制和中文文字层')
    }
    if (includes('projects')) {
    const clickAria = async label => evaluate(`(async()=>{const button=[...document.querySelectorAll('button')].find(item=>item.getClientRects().length&&item.getAttribute('aria-label')===${JSON.stringify(label)});if(!button)throw new Error('缺少项目操作：'+${JSON.stringify(label)});button.scrollIntoView({block:'center',inline:'nearest'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const rect=button.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);if(!hit||!button.contains(hit))throw new Error('项目操作被遮挡：'+${JSON.stringify(label)});button.click();return true})()`)
    const navigationClosed = async () => {
      await wait(`[...document.querySelectorAll('.ant-drawer-content-wrapper')].every(panel=>{const r=panel.getBoundingClientRect();return !r.height||r.top>=innerHeight||r.bottom<=0||getComputedStyle(panel).visibility==='hidden'})`, '页面未被弹层遮挡')
      await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`)
    }
    const mobileNavigate = async key => {
      await clickAria('服务')
      await wait(`!!document.querySelector('[data-nav-key="${key}"]')`, '移动项目导航')
      await evaluate(`(async()=>{const button=document.querySelector('[data-nav-key="${key}"]');button.scrollIntoView({block:'center'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(!hit||!button.contains(hit))throw new Error('移动导航入口被遮挡');button.click()})()`)
      await navigationClosed()
    }
    const nameProject = async (name, confirm) => {
      await wait(`!!document.querySelector('#diagram-project-name')`, '项目命名输入')
      await evaluate(`(()=>{const input=document.querySelector('#diagram-project-name');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(name)});input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
      await click(confirm)
      await wait(`![...document.querySelectorAll('.ant-modal')].some(item=>item.getClientRects().length&&item.querySelector('#diagram-project-name'))`, '项目命名完成')
    }
    for (const [key, type, width] of [['mindmap','脑图',1280], ['flow','流程图',390]]) {
      win.setContentSize(width,900); await home()
      if(width<900)await mobileNavigate(key);else await click(type)
      await wait(`!!document.querySelector('[data-diagram-projects="${type}"]')`, type+'项目列表')
      const names = [type+'公开验收 A',type+'公开验收 B']
      for(const name of names){await clickAria('新建'+type+'项目');await nameProject(name,'创建项目');await wait(`!!document.querySelector('[data-diagram-editor]')`, '独立项目编辑');await click('返回项目列表');await wait(`!!document.querySelector('[data-diagram-projects="${type}"]')`,'返回列表')}
      const initial = await evaluate(`[...document.querySelectorAll('[data-project-id]')].map(item=>({id:item.dataset.projectId,title:item.dataset.projectTitle,pending:item.dataset.projectPending}))`)
      assert.equal(initial.length,2);assert.equal(new Set(initial.map(item=>item.id)).size,2);assert(initial.every(item=>item.pending==='false'))
      await clickAria('重命名项目：'+names[0]);await nameProject(names[0]+' 已改名','保存名称')
      await clickAria('打开项目：'+names[1]);await wait(`document.querySelector('[data-diagram-editor]')?.getAttribute('data-diagram-editor')===${JSON.stringify(initial.find(item=>item.title===names[1]).id)}`, '打开正确项目身份')
      await click('返回项目列表');await wait(`!!document.querySelector('[data-diagram-projects="${type}"]')`,'保存返回')
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('项目重载超时')),60000);win.webContents.once('did-finish-load',()=>{clearTimeout(timer);resolve()});win.reload()});await wait('!!document.querySelector(".wps-app")','真实重载')
      await home()
      if(width<900)await mobileNavigate(key);else await click(type)
      await wait(`document.querySelectorAll('[data-diagram-projects="${type}"] [data-project-id]').length===2`,'项目重载保留')
      const restored=await evaluate(`[...document.querySelectorAll('[data-project-id]')].map(item=>({id:item.dataset.projectId,title:item.dataset.projectTitle}))`)
      assert.deepEqual(restored.map(item=>item.id).sort(),initial.map(item=>item.id).sort());assert(restored.some(item=>item.title===names[0]+' 已改名'));assert(restored.some(item=>item.title===names[1]))
      await wait(`[...document.querySelectorAll('.diagram-project-preview img')].every(image=>image.complete&&image.naturalWidth>0)`, '项目缩略图加载')
      const layout=await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})');assert(layout.scroll<=layout.width+1)
      await navigationClosed()
      fs.writeFileSync(path.join(output,`${local?'local':'public'}-${key}-projects-${width}.png`),(await win.capturePage()).toPNG())
      projectLists.push({type,width,projects:restored.length,independentIds:true,reloaded:true,renamed:true,previewImagesDecoded:true,unobscuredNavigation:true})
      recordCheck(width+'px'+type+'真实项目列表→连续新建两张图→重命名→按ID打开→页面重载保留，CSP下缩略图加载且无横向溢出')
    }
    }
    if (includes('documents')) {
    for (const width of [1280, 390, 360]) {
      win.setContentSize(width, 900); await home()
      for (const [key, label] of [['shared','共享'],['device','我的设备'],['tag','标签'],['team','团队空间']]) {
        if (width < 900) { await evaluate(`document.querySelector('.seal-mobile-nav [aria-label="服务"]').click()`); await wait(`!!document.querySelector('[data-nav-key="${key}"]')`, key); await evaluate(`document.querySelector('[data-nav-key="${key}"]').click()`) } else await click(label)
        await wait(`document.body.textContent.includes('登录并解锁加密云空间后使用此功能')`, label + '账号提示')
        await wait(`[...document.querySelectorAll('.ant-drawer-content-wrapper')].every(panel=>{const r=panel.getBoundingClientRect();return !r.height||r.top>=innerHeight||r.bottom<=0||getComputedStyle(panel).visibility==='hidden'})`, '关闭导航')
        const layout = await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})'); assert.ok(layout.scroll <= layout.width + 1, JSON.stringify({ key, ...layout }))
      }
      await click('登录并开通云空间'); await wait(`!!document.querySelector('.seal-login-modal')`, '真实登录提示')
      assert.equal(await evaluate(`document.querySelector('#seal-login-phone')?.type`), 'tel')
      assert.equal(await evaluate(`[...document.querySelectorAll('.seal-login-modal button')].find(button=>button.textContent==='获取验证码')?.disabled`), true)
      await evaluate(`document.querySelector('.seal-login-modal .ant-modal-close').click()`); await new Promise(resolve=>setTimeout(resolve,300))
      fs.writeFileSync(path.join(output, `${local?'local':'public'}-collaboration-${width}.png`), (await win.capturePage()).toPNG())
      recordCheck(width + 'px真实四协作入口、登录提示和无横向溢出')
    }
    }
    assert.ok(completed.every(entry => entry.origin === new URL(target).origin), '所有HTTP资源必须来自部署同域')
    assert.ok(completed.every(entry => entry.status < 400 || entry.status === 401), '资源缺失或服务器错误：' + JSON.stringify(completed.filter(entry => entry.status >= 400 && entry.status !== 401)))
    assert.ok(!completed.some(entry => /\/code(?:\?|$)|\/login(?:\?|$)/.test(entry.path)), '禁止发送短信或登录生产账号')
    assert.equal(errors.length, 0, errors.join('\n')); assert.equal(failures.length, 0, JSON.stringify(failures))
    const report = { passed: true, version: require('../../package.json').version, group, origin: local ? 'local-production-CSP' : target, checks, apiCapabilities: unauth.caps, anonymousStatuses: unauth.status, template, projectLists, errors, requestCount: completed.length, externalRequests: 0, productionAccountOperations: 0, pdfWorker: includes('documents') }
    fs.writeFileSync(path.join(output, reportFile), JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2)); code = 0
  } catch (error) { const report={passed:false,group,checks,errors,failures,resourceCompletions:completed,error:error.stack};fs.writeFileSync(path.join(output,reportFile),JSON.stringify(report,null,2));console.error(error) }
  finally { win?.destroy();server?.closeAllConnections?.();server?.close();await fixture?.cleanup();app.exit(code) }
})

