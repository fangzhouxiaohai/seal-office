/* Run after: npx vite build --config scripts/template-verification.vite.mjs
 * npx electron scripts/verify-template-library.cjs
 * Uses a private production bundle, real codecs and local-only image resources.
 */
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict'), crypto = require('node:crypto')
const codec = require('../main/office/pptxCodec.js'), JSZip = require('jszip')
const directory = path.resolve(__dirname, '../.upgrade-private/template-expansion-verification'), dist = path.join(directory, 'dist'), output = path.join(directory, 'evidence')
fs.mkdirSync(output, { recursive: true }); app.setPath('userData', path.join(directory, 'profile-' + process.pid)); app.disableHardwareAcceleration()
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const report = { version: '2.0.0', passed: false, build: 'isolated-production', pages: [], widths: [], selections: [], roundtrips: [], errors: [], external: [] }
const server = http.createServer((request, response) => { const pathname = new URL(request.url, 'http://localhost').pathname, filename = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : decodeURIComponent(pathname))); if (!filename.startsWith(dist + path.sep) || !fs.existsSync(filename)) { response.writeHead(404); response.end(); return } response.writeHead(200, { 'Content-Type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[path.extname(filename)] || 'application/octet-stream', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'" }); fs.createReadStream(filename).pipe(response) })
let win
app.whenReady().then(async () => {
  try {
    assert.ok(fs.existsSync(path.join(dist, 'index.html')), '先运行独立生产构建')
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = 'http://127.0.0.1:' + server.address().port
    win = new BrowserWindow({ show: false, width: 1440, height: 960, frame: false, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false } })
    win.webContents.session.webRequest.onBeforeRequest((details, callback) => { const allowed = details.url.startsWith(origin) || /^(?:file|data|blob):/.test(details.url); if (!allowed) report.external.push(new URL(details.url).origin); callback({ cancel: !allowed }) })
    win.webContents.on('console-message', (_event, level, message) => { if (level >= 3 && !/Electron Security/.test(message)) report.errors.push(message) })
    const evaluate = code => win.webContents.executeJavaScript(code, true)
    async function ready() { await evaluate('document.fonts.ready'); await evaluate('Promise.all([...document.images].map(image=>image.decode()))'); await sleep(90) }
    async function wait(code, label) { for (let index = 0; index < 200; index++) { if (await evaluate(code)) return; await sleep(50) } throw new Error('等待失败：' + label) }
    async function capture(name, width, height) {
      win.setContentSize(width, height); await ready()
      await wait(`[...document.querySelectorAll('.ant-modal,.ant-drawer-content-wrapper')].filter(node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden').every(node=>Number(getComputedStyle(node).opacity)===1&&!/enter-active|appear-active/.test(node.className)&&node.getAnimations().every(animation=>animation.playState==='finished'))`, '对话框动画完成')
      const unexpected = await evaluate(`[...document.querySelectorAll('.ant-modal-confirm-error,.seal-cloud-error')].filter(node=>node.getClientRects().length).map(node=>node.textContent)`); fs.writeFileSync(path.join(output, name + '.png'), (await win.capturePage()).toPNG()); assert.deepEqual(unexpected, [], '出现未预期错误弹窗/错误反馈：' + name + ' ' + JSON.stringify(unexpected)); return evaluate('window.templateQa.layout()')
    }
    async function button(name) { const expression = `[...document.querySelectorAll('button')].find(item=>item.getClientRects().length&&(item.getAttribute('aria-label')===${JSON.stringify(name)}||item.textContent.replace(/\\s/g,'')===${JSON.stringify(name.replace(/\s/g, ''))}))`; await wait(`Boolean(${expression})`, '按钮 ' + name); return evaluate(`(${expression}).click()`) }
    async function input(label, value) { await evaluate(`(()=>{const node=[...document.querySelectorAll('input')].find(item=>item.getAttribute('aria-label')===${JSON.stringify(label)});if(!node)throw new Error('搜索入口缺失');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,${JSON.stringify(value)});node.dispatchEvent(new Event('input',{bubbles:true}))})()`); await sleep(100) }
    await win.loadFile(path.join(dist, 'index.html')); await ready(); const templates = await evaluate('window.templateQa.templates'); assert.equal(templates.length, 12)
    report.widths.push({ page: 'gallery', ...await capture('gallery-desktop', 1440, 1000) })
    for (const template of templates) {
      const model = await evaluate(`window.templateQa.model(${JSON.stringify(template.id)})`), bytes = await codec.写入pptx(model), zip = await JSZip.loadAsync(bytes), reopened = await codec.读取pptx(bytes)
      fs.writeFileSync(path.join(output, template.name + '.pptx'), bytes)
      assert.equal(reopened.演示文稿.幻灯片列表.length, 9); assert.equal(reopened.资源条目.length, 2); assert.equal(Object.keys(zip.files).filter(name => /^ppt\/charts\/[^/]+\.xml$/.test(name)).length, 1)
      report.roundtrips.push({ id: template.id, name: template.name, pages: 9, images: 2, charts: 1, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') })
      for (let index = 0; index < 9; index++) { await evaluate(`window.templateQa.page(${JSON.stringify(reopened.演示文稿)},${index})`); report.pages.push({ template: template.id, page: index + 1, ...await capture(`${template.id}-${index + 1}`, 960, 540) }) }
    }
    for (const protocol of ['file', 'http']) {
      if (protocol === 'http') { await win.loadURL(origin); await ready() }
      await evaluate('window.templateQa.library()'); await button('演示')
      for (const width of [1440, 768, 390, 360]) { const layout = await capture(`library-${protocol}-${width}`, width, 900); assert.ok(layout.scrollWidth <= width + 1); report.widths.push({ page: 'library', protocol, ...layout }) }
      await button('精选推荐'); assert.equal(await evaluate('document.querySelectorAll(".template-library__card").length'), 6)
      await input('搜索模板', '渠道 实验'); assert.equal(await evaluate('document.querySelectorAll(".template-library__card").length'), 1); await button('预览市场营销'); await ready(); assert.equal(await evaluate('document.querySelectorAll(".template-presentation-pages figure").length'), 9)
      report.widths.push({ page: 'detail', protocol, ...await capture(`detail-${protocol}-360`, 360, 900) }); const beforeLibrary = await evaluate('window.templateQa.selection().documentId'); await button('使用此模板'); await wait(`window.templateQa.selection().id === "ppt-marketing-001" && window.templateQa.selection().documentId !== ${JSON.stringify(beforeLibrary)}`, '模板库真实应用')
      const selected = await evaluate('window.templateQa.selection()'); assert.equal(selected.deck.幻灯片列表.length, 9); report.selections.push({ protocol, entry: 'library', id: selected.id, pages: selected.deck.幻灯片列表.length, restored: selected.restored })
      await evaluate('window.templateQa.market()'); await ready()
      for (const width of [1440, 768, 390, 360]) {
        const layout = await capture(`market-gallery-${protocol}-${width}`, width, 900), grid = await evaluate(`(()=>{const grid=document.querySelector('.seal-market-grid');return {display:getComputedStyle(grid).display,columns:getComputedStyle(grid).gridTemplateColumns,covers:[...grid.querySelectorAll('.seal-market-cover')].map(node=>{const rect=node.getBoundingClientRect();return {width:rect.width,height:rect.height,images:node.querySelectorAll('img').length}})}})()`)
        assert.equal(grid.display, 'grid', '实际市场必须加载grid样式'); assert.ok(grid.covers.length > 0 && grid.covers.every(cover => cover.width > 100 && cover.height > 50), '模板封面必须有实际可见尺寸'); assert.ok(grid.covers.some(cover => cover.images > 0), '实际市场摄影封面必须被渲染'); assert.ok(layout.scrollWidth <= width + 1, '市场横向溢出'); report.widths.push({ page: 'market-gallery', protocol, grid, ...layout })
      }
      await button('学术答辩'); await input('搜索演示模板', '研究 证据'); await button('预览 学术答辩'); await ready(); await wait('document.querySelectorAll(".seal-market-preview > div").length === 9', '市场真实九页预览'); const detailLayout = await capture(`market-${protocol}-360`, 360, 900), modalLayout = await evaluate(`(()=>{const body=document.querySelector('.ant-modal-body');const footer=document.querySelector('.ant-modal-footer').getBoundingClientRect();return {overflowY:getComputedStyle(body).overflowY,clientHeight:body.clientHeight,scrollHeight:body.scrollHeight,footerTop:footer.top,footerBottom:footer.bottom,viewport:innerHeight}})()`); assert.ok(['auto','scroll'].includes(modalLayout.overflowY)&&modalLayout.scrollHeight>modalLayout.clientHeight, '移动预览应能滚动完整九页'); assert.ok(modalLayout.footerTop>0&&modalLayout.footerBottom<=modalLayout.viewport, '使用按钮应保留在可见视口'); report.widths.push({ page: 'market-detail', protocol, modal: modalLayout, ...detailLayout }); const beforeMarket = await evaluate('window.templateQa.selection().documentId'); await button('使用并编辑副本'); await wait(`window.templateQa.selection().deck.name === "学术答辩.pptx" && window.templateQa.selection().documentId !== ${JSON.stringify(beforeMarket)}`, '市场真实应用')
      const marketSelection = await evaluate('window.templateQa.selection()'); assert.equal(marketSelection.deck.幻灯片列表.length, 9); report.selections.push({ protocol, entry: 'market', name: marketSelection.deck.name, pages: 9 })
    }
    const overflowing = report.pages.flatMap(page => page.boxes.filter(box => box.overflow).map(box => ({ template: page.template, page: page.page, ...box }))), missing = [...report.pages, ...report.widths].flatMap(page => page.images.filter(image => !image.loaded))
    report.overflowing = overflowing; report.missingImages = missing; report.unexpectedDialogs = []; report.unexpectedDialogsChecked = true; assert.equal(overflowing.length, 0, '实际PPTX重读文本溢出'); assert.equal(missing.length, 0, '图片未完成解码'); assert.equal(report.errors.length, 0, '生产浏览器报错'); assert.equal(report.external.length, 0, '出现外部资源请求'); report.passed = true
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ passed: true, templates: report.roundtrips.length, pages: report.pages.length, layouts: report.widths.length, selections: report.selections.length, overflow: 0, missingImages: 0, externalRequests: 0, output })); app.exit(0)
  } catch (error) { report.error = error.stack; fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.error(error.stack); app.exit(1) }
  finally { win?.destroy(); server.closeAllConnections?.(); server.close() }
})
