// Real production browser + private conversion service; all fixtures are synthetic.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict')
const { createConverterServer } = require('../../server/converter/index.cjs')
const root = path.resolve(__dirname, '../..'), output = path.join(root, '.upgrade-private/mobile-format-verification')
const formats = require('../../main/documentFormats.json')
const remoteConfigPath = process.argv.find(value => value.startsWith('--remote-config='))?.slice(16)
const remote = remoteConfigPath ? JSON.parse(fs.readFileSync(remoteConfigPath, 'utf8')) : null
const token = remote?.token || 'synthetic_browser_test_' + 'z'.repeat(32)
const readOnly = process.argv.includes('--read-only'), settingsOnly = process.argv.includes('--settings-only')
const reportName = process.argv.find(value => value.startsWith('--report='))?.slice(9) || 'report.json'
app.setPath('userData', path.join(output, 'profile-' + process.pid)); app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true })
  const report = { version: require('../../package.json').version, startedAt: new Date().toISOString(), checks: [], failures: [], requests: [] }
  const executable = path.join(root, '.upgrade-private/office-runtime/program/soffice.com')
  const converter = createConverterServer({ token, executable, convert: async (...args) => {
    report.requests.push({ input: args[1], output: args[2], type: args[3] })
    return require('../../server/converter/office.cjs').convertWithOffice(...args)
  } })
  await new Promise(resolve => converter.listen(0, '127.0.0.1', resolve))
  const serviceUrl = remote?.url || 'http://127.0.0.1:' + converter.address().port
  let remoteQueue = Promise.resolve(), lastRemoteRequest = 0
  const webRoot = path.join(root, 'mobile/static/office'), mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' }
  const server = http.createServer(async (req, res) => {
    // The production H5 bridge maps project API URLs to its same-origin proxy.
    if (remote && req.url.startsWith('/api/office-converter/')) {
      try {
        const chunks=[];for await(const chunk of req)chunks.push(chunk)
        const body=Buffer.concat(chunks)
        if(req.method==='POST'){
          const input=JSON.parse(body.toString());report.requests.push({input:input.inputFormat,output:input.outputFormat,type:input.type})
          const turn=remoteQueue.then(async()=>{await new Promise(r=>setTimeout(r,Math.max(0,3300-(Date.now()-lastRemoteRequest))));lastRemoteRequest=Date.now()});remoteQueue=turn.catch(()=>{});await turn
        }
        const response=await fetch(remote.url+req.url.slice('/api/office-converter'.length),{method:req.method,headers:{Authorization:req.headers.authorization||'','Content-Type':'application/json'},...(body.length?{body}:{})})
        res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')||'application/json'});res.end(Buffer.from(await response.arrayBuffer()))
      }catch{res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'生产转换代理请求失败'}))}
      return
    }
    const filename = path.resolve(webRoot, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'))
    if (!filename.startsWith(webRoot + path.sep) || !fs.existsSync(filename)) { res.writeHead(404); res.end(); return }
    res.setHeader('Content-Type', mime[path.extname(filename)] || 'application/octet-stream'); fs.createReadStream(filename).pipe(res)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const win = new BrowserWindow({ show: false, width: 412, height: 915, webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true, sandbox: true, nodeIntegration: false } })
  if (remote) win.webContents.session.webRequest.onBeforeRequest({urls:[serviceUrl+'/*']},(details,callback)=>{if(details.url.endsWith('/v1/convert')&&details.method==='POST')report.requests.push({operation:'remote-convert'});callback({})})
  win.webContents.session.on('will-download', (_, item) => item.cancel())
  const evaluate = async source => {
    const result = await win.webContents.executeJavaScript(`(async()=>{try{return {value:await (0,eval)(${JSON.stringify(source)})}}catch(error){return {error:error.stack||String(error)}}})()`, true)
    if (result.error) throw new Error(result.error); return result.value
  }
  const checkpoint = () => fs.writeFileSync(path.join(output, path.basename(reportName)), JSON.stringify(report, null, 2))
  const consent = async cancel => evaluate(`window.formatConsentTimer=setInterval(()=>{for(const modal of document.querySelectorAll('.ant-modal-confirm')){const buttons=modal.querySelectorAll('.ant-modal-confirm-btns button');if(buttons.length){buttons[${cancel ? 0 : 1}]?.click()}}},50);true`)
  const run = async (extension, bytes, label = extension) => {
    const result = await evaluate(`window.electronAPI.office.readCompatible(${JSON.stringify(extension)},${JSON.stringify(bytes.toString('base64'))})`)
    assert.equal(result.成功, true, label + ': ' + result.错误)
    const text = JSON.stringify(result).replace(/<[^>]+>/g, '')
    assert.match(text, /0012/, label + ': 前导零和中文正文')
    if (result.类型 === 'table') assert.match(text, /123/, label)
    return result
  }
  try {
    await win.loadURL('http://127.0.0.1:' + server.address().port + '/')
    for (let i = 0; i < 150 && !await evaluate(`!!document.querySelector('.wps-app')`); i++) await new Promise(resolve => setTimeout(resolve, 200))
    assert.ok(await evaluate(`!!document.querySelector('.wps-app')`))
    const doc = fs.readFileSync(path.join(root, '.upgrade-private/format-samples/verify.doc'))
    const blocked = await evaluate(`window.electronAPI.office.readCompatible('doc',${JSON.stringify(doc.toString('base64'))})`)
    assert.equal(blocked.成功, false); assert.match(blocked.错误, /设置中心/); assert.equal(report.requests.length, 0)
    await evaluate(`window.sealDocumentConversion.save({url:${JSON.stringify(serviceUrl)},token:${JSON.stringify(token)}})`)
    assert.ok((await evaluate(`window.sealDocumentConversion.get()`)).hasToken)
    const healthy = await evaluate(`window.sealDocumentConversion.test({url:${JSON.stringify(serviceUrl)}})`); assert.ok(healthy.inputCount > 40)
    await assert.rejects(evaluate(`window.sealDocumentConversion.save({url:'https://different.example.test'})`), /重新填写/)
    await consent(true)
    const cancelled = await evaluate(`window.electronAPI.office.readCompatible('doc',${JSON.stringify(doc.toString('base64'))})`)
    assert.equal(cancelled.成功, false); assert.match(cancelled.错误, /取消/); assert.equal(report.requests.length, 0)
    await evaluate(`clearInterval(window.formatConsentTimer);true`); await consent(false)
    report.checks.push({ operation: 'service-config', status: 'passed', behavior: '加密令牌不回显、鉴权测试、换地址不复用令牌、取消不上传' }); checkpoint()
    const selected = settingsOnly ? [] : formats.filter(f => f.conversion && !['xml', 'mht', 'mhtml'].includes(f.extension))
    let next = 0
    await Promise.all((remote?[0]:[0,1]).map(async () => {
      while (next < selected.length) {
        const format = selected[next++], start = Date.now()
        try {
          const source = fs.readFileSync(path.join(root, '.upgrade-private/format-samples/verify.' + format.extension))
          const result = await run(format.extension, source)
          report.checks.push({ extension: format.extension, operation: 'read', milliseconds: Date.now() - start, warnings: result.警告 })
          console.log('PASS mobile read ' + format.extension)
        } catch (error) { report.failures.push({ extension: format.extension, operation: 'read', error: error.message }); console.log('FAIL mobile read ' + format.extension + ': ' + error.message) }
        checkpoint()
      }
    }))
    if (!settingsOnly) for (const name of ['word2003.xml', 'excel2003.xml']) { await run('xml', fs.readFileSync(path.join(root, 'scripts/fixtures/documents', name)), name); report.checks.push({ extension: 'xml', fixture: name, operation: 'read' }); checkpoint() }
    const models = {
      word: { 段落: [{ 类型: '段落', 文字: [{ 文本: '中文手机保存验收 0012' }] }] },
      table: { 工作表: [{ 名称: '预算', 数据: [['编号', '预算'], [{ 类型: '文本', 文字: [{ 文本: '0012' }] }, 123]] }] },
      ppt: { 页面尺寸: { 宽: 960, 高: 540 }, 幻灯片: [{ id: '1', 文本框: [{ id: 'text', x: 20, y: 20, width: 500, height: 50, text: '中文手机保存验收 0012' }] }] },
    }
    const writable = readOnly ? [] : selected.filter(f => !f.readOnlySource)
    next = 0
    await Promise.all((remote?[0]:[0,1]).map(async () => {
      while (next < writable.length) {
        const format = writable[next++], start = Date.now()
        try {
          const result = await evaluate(`window.electronAPI.office.writeCompatible(${JSON.stringify(format.type)},${JSON.stringify(format.extension)},${JSON.stringify(models[format.type])})`)
          assert.ok(result.成功, result.错误)
          const bytes = Buffer.from(result.数据, 'base64'); fs.writeFileSync(path.join(output, 'mobile-save.' + format.extension), bytes)
          await run(format.extension, bytes)
          report.checks.push({ extension: format.extension, operation: 'write-read', milliseconds: Date.now() - start }); console.log('PASS mobile write-read ' + format.extension)
        } catch (error) { report.failures.push({ extension: format.extension, operation: 'write-read', error: error.message }); console.log('FAIL mobile write-read ' + format.extension + ': ' + error.message) }
        checkpoint()
      }
    }))
    await evaluate(`clearInterval(window.formatConsentTimer);true`)
    await evaluate(`document.querySelector('[aria-label="全局设置"]').click();true`)
    for (let i = 0; i < 50 && !await evaluate(`!!Array.from(document.querySelectorAll('[role="menuitem"]')).find(item=>item.textContent.trim()==='全局设置')`); i++) await new Promise(resolve => setTimeout(resolve, 100))
    await evaluate(`Array.from(document.querySelectorAll('[role="menuitem"]')).find(item=>item.textContent.trim()==='全局设置').click();true`)
    for (let i = 0; i < 50 && !await evaluate(`!!document.querySelector('[aria-label="文档转换服务地址"]')`); i++) await new Promise(resolve => setTimeout(resolve, 100))
    assert.ok(await evaluate(`!!document.querySelector('[aria-label="文档转换服务地址"]')`), '设置页显示转换入口')
    await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='测试连接').click();true`)
    for (let i = 0; i < 100 && !await evaluate(`document.body.textContent.includes('服务连接正常')`); i++) await new Promise(resolve => setTimeout(resolve, 100))
    assert.ok(await evaluate(`document.body.textContent.includes('服务连接正常')`), '设置页测试连接按钮完成真实鉴权请求')
    await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='清除配置').click();true`)
    for (let i = 0; i < 100 && (await evaluate(`window.sealDocumentConversion.get()`)).hasToken; i++) await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal((await evaluate(`window.sealDocumentConversion.get()`)).hasToken, false)
    await new Promise(resolve => setTimeout(resolve, 200))
    await evaluate(`(()=>{for(const [label,value] of [['文档转换服务地址',${JSON.stringify(serviceUrl)}],['文档转换访问令牌',${JSON.stringify(token)}]]){const input=document.querySelector('[aria-label="'+label+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))}return true})()`)
    await new Promise(resolve => setTimeout(resolve, 200))
    await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.trim()==='保存转换配置').click();true`)
    for (let i = 0; i < 100 && !(await evaluate(`window.sealDocumentConversion.get()`)).hasToken; i++) await new Promise(resolve => setTimeout(resolve, 100))
    assert.ok((await evaluate(`window.sealDocumentConversion.get()`)).hasToken, '设置页保存按钮恢复加密配置')
    await evaluate(`(()=>{document.activeElement?.blur();const title=document.querySelector('[aria-label="文档转换服务地址"]').closest('.settings-wps-card').previousElementSibling;title.style.scrollMarginTop='70px';title.scrollIntoView({block:'start'});return true})()`)
    for (let i = 0; i < 80 && await evaluate(`!!document.querySelector('.ant-message-notice')`); i++) await new Promise(resolve => setTimeout(resolve, 100))
    fs.writeFileSync(path.join(output, 'mobile-converter-settings.png'), (await win.webContents.capturePage()).toPNG())
    report.checks.push({ operation: 'settings-ui', status: 'passed' })
    report.status = report.failures.length ? 'failed' : 'passed'; report.finishedAt = new Date().toISOString(); checkpoint()
    console.log(JSON.stringify({ status: report.status, checks: report.checks.length, failures: report.failures.length, remoteRequests: report.requests.length }))
  } catch (error) { report.failures.push({ operation: 'runner', error: error.stack }); report.status = 'failed'; checkpoint(); console.error(error.stack) }
  finally { win.destroy(); server.closeAllConnections(); converter.closeAllConnections(); await Promise.all([new Promise(resolve => server.close(resolve)), new Promise(resolve => converter.close(resolve))]); app.exit(report.status === 'passed' ? 0 : 1) }
})
