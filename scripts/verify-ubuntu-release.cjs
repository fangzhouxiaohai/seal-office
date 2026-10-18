// Run the installed .deb under Xvfb. No application test hook or sandbox bypass.
const fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict')
const { spawn, execFileSync } = require('child_process')
const { once } = require('events')
const { createHash } = require('crypto')
const root = path.resolve(__dirname, '..'), output = path.join(root, 'release/ubuntu/verification')
fs.mkdirSync(output, { recursive: true })
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-ubuntu-verify-'))
const version = require('../package.json').version
const report = { version, os: fs.readFileSync('/etc/os-release', 'utf8'), arch: process.arch, sandboxBypassed: false, checks: [], failures: [] }
const sockets = [], processes = []
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const checkpoint = () => fs.writeFileSync(path.join(output, 'ubuntu-verification.json'), JSON.stringify(report, null, 2) + '\n')
const check = (condition, name) => { assert(condition, name); report.checks.push(name); checkpoint(); console.log('PASS ' + name) }
async function connect(port, choose) {
  let target
  for (let n = 0; n < 400; n++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(choose) } catch {}
    if (target) break
    await delay(100)
  }
  assert(target, 'Installed application debug interface ready')
  const ws = new WebSocket(target.webSocketDebuggerUrl), pending = new Map()
  sockets.push(ws); await once(ws, 'open')
  let next = 0
  ws.addEventListener('message', event => {
    const data = JSON.parse(String(event.data)), job = pending.get(data.id)
    if (!job) return
    pending.delete(data.id); clearTimeout(job.timer)
    if (data.error || data.result?.exceptionDetails) job.reject(new Error(data.error?.message || data.result.exceptionDetails.exception?.description || 'Evaluation failed'))
    else job.resolve(data.result)
  })
  ws.addEventListener('close', () => {
    for (const job of pending.values()) { clearTimeout(job.timer); job.reject(new Error('Application debug connection closed')) }
    pending.clear()
  })
  const call = (method, params, timeout = 120000) => new Promise((resolve, reject) => {
    const id = ++next, timer = setTimeout(() => { pending.delete(id); reject(new Error('Verification timeout: ' + method)) }, timeout)
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }))
  })
  return { call, close: () => ws.close(), evaluate: async expression => (await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value }
}
const models = {
  word: { 段落: [{ 类型: '段落', 级别: 0, 对齐: '左', 列表: '无', 文字: [{ 文本: '中文格式验收 0012', 加粗: true }] }], 未覆盖: [] },
  table: { 工作表: [{ 名称: '验收', 数据: [['编号', '预算'], [{ 类型: '文本', 文字: [{ 文本: '0012' }] }, 123]], 页面设置: { 方向: '纵向', 纸张大小: 'A4', 页边距: '常规' } }] },
  ppt: { 页面尺寸: { 宽: 960, 高: 540 }, 幻灯片: [{ id: 'p1', 背景色: '#FFFFFF', 文本框: [{ id: 't1', x: 40, y: 50, width: 700, height: 90, text: '中文格式验收 0012', 字号: 24, 颜色: '#222222' }] }] },
}
async function verify() {
  const packageFile = path.join(root, 'release/ubuntu', require('./artifact-names.cjs').artifactName('ubuntu', version))
  report.packageFile = path.basename(packageFile)
  report.packageBytes = fs.statSync(packageFile).size
  report.packageSha256 = createHash('sha256').update(fs.readFileSync(packageFile)).digest('hex')
  report.package = execFileSync('dpkg-query', ['-W', '-f=${Version} ${Architecture}', 'seal-office'], { encoding: 'utf8' })
  check(report.package === version + ' amd64', 'Deb package version and architecture')
  const desktop = fs.readFileSync('/usr/share/applications/sealoffice.desktop', 'utf8')
  check(desktop.includes('MimeType=') && desktop.includes('text/csv') && /Exec=.* %U/.test(desktop), 'Desktop launcher and CSV MIME registration')
  check(!fs.existsSync('/opt/海豹办公/resources/office-runtime/program/soffice.com'), 'Linux package excludes Windows compatibility binaries')
  const source = path.join(temp, '冷启动 中文.csv')
  fs.writeFileSync(source, '编号,内容\r\n0012,中文验收\r\n')
  const log = fs.openSync(path.join(output, 'application.log'), 'w')
  const child = spawn('/usr/bin/sealoffice', ['--inspect=9231', '--remote-debugging-port=9230', '--user-data-dir=' + path.join(temp, 'profile'), source], { detached: true, stdio: ['ignore', log, log] })
  processes.push(child)
  const main = await connect(9231, item => !!item.webSocketDebuggerUrl)
  const page = await connect(9230, item => item.url.endsWith('/dist/index.html'))
  const wait = async expression => {
    for (let n = 0; n < 200; n++) { if (await page.evaluate(expression)) return; await delay(100) }
    throw new Error('UI did not reach expected state: ' + expression)
  }
  await wait("!!window.electronAPI && !!document.body && document.body.innerText.includes('冷启动 中文.csv')")
  check(await page.evaluate("!document.querySelector('.ant-modal-confirm-error')"), 'Cold launch opens Unicode CSV argument without an error')
  const info = await page.evaluate('window.electronAPI.getAppInfo()')
  check(info.版本 === version, 'Installed renderer preload and IPC version')
  const integrity = await page.evaluate('window.electronAPI.checkIntegrity()')
  check(integrity.成功 && integrity.完整, 'Packaged application integrity manifest')
  const options = await main.evaluate(`(()=>{const e=process.mainModule.require('electron');return e.BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()})()`)
  check(options.sandbox && options.contextIsolation && !options.nodeIntegration, 'Renderer sandbox and context isolation remain enabled')
  const csv = await page.evaluate(`window.electronAPI.readFile(${JSON.stringify(source)})`)
  check(csv.成功 && csv.内容.includes('0012') && csv.内容.includes('中文'), 'CSV IPC read preserves Unicode and leading zeros')
  const saved = await page.evaluate(`window.electronAPI.saveToFile(${JSON.stringify(source)}, '编号,内容\\r\\n0012,修改成功\\r\\n', 'csv', ${JSON.stringify(csv.文件指纹)})`)
  check(saved.成功 && fs.readFileSync(source, 'utf8').includes('修改成功'), 'CSV native save retains original extension')
  const stale = await page.evaluate(`window.electronAPI.saveToFile(${JSON.stringify(source)}, 'bad', 'csv', ${JSON.stringify(csv.文件指纹)})`)
  check(!stale.成功 && fs.readFileSync(source, 'utf8').includes('修改成功'), 'Stale file fingerprint prevents overwriting newer content')
  await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='立即设为默认')")
  check(await page.evaluate("(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='立即设为默认');if(!button||button.disabled)return false;button.click();return true})()"), 'Default-app confirmation button is clickable')
  await wait("!document.body.innerText.includes('是否把海豹办公设为默认程序？')")
  const associations = await page.evaluate('window.electronAPI.checkDefaultAppOnStartup()')
  check(associations.成功 && associations.已全部默认, 'Explicit default-app action applies and verifies Linux MIME defaults')
  const { 文件关联 } = require('../main/linux/mimeTypes')
  check(文件关联.length === 50, 'All 50 supported document extensions registered')
  for (const [type, suffix] of [['word', 'Docx'], ['table', 'Xlsx'], ['ppt', 'Pptx']]) {
    const result = await page.evaluate(`(async()=>{const api=window.electronAPI.office;const written=await api.write${suffix}(${JSON.stringify(models[type])});if(!written.成功)throw new Error(written.错误);const read=await api.read${suffix}(written.数据);return {written:written.成功,read}})()`)
    check(result.written && result.read.成功 && JSON.stringify(result.read).includes('0012'), suffix.toLowerCase() + ' packaged IPC write and reopen')
  }
  const formats = require('../main/documentFormats.json').filter(item => item.conversion && ['word', 'table', 'ppt'].includes(item.type) && !item.readOnlySource && !['xml', 'mht', 'mhtml'].includes(item.extension))
  for (const format of formats) {
    try {
    report.phase = 'Document conversion: ' + format.extension; checkpoint()
    const model = models[format.type]
    const destination = path.join(temp, 'roundtrip.' + format.extension)
    const result = await main.evaluate(`(async()=>{
      const p=process.mainModule.require('path'),e=process.mainModule.require('electron'),f=process.mainModule.require('fs'),c=process.mainModule.require('child_process');
      const m=process.mainModule.require(p.join(e.app.getAppPath(),'main/office/compatibleFormats'));
      const bytes=await m.写入兼容文档(${JSON.stringify(format.type)},${JSON.stringify(format.extension)},${JSON.stringify(model)});
      const read=await m.读取兼容文档(${JSON.stringify(format.extension)},bytes);
      f.writeFileSync(${JSON.stringify(destination)},bytes);
      const genericMime=c.execFileSync('xdg-mime',['query','filetype',${JSON.stringify(destination)}],{encoding:'utf8',timeout:15000}).trim();
      const info=c.execFileSync('gio',['info','-a','standard::content-type',${JSON.stringify(destination)}],{encoding:'utf8',timeout:15000,env:{...process.env,LC_ALL:'C'}});
      const mime=info.match(/standard::content-type: ([^\\s]+)/)?.[1];
      if(!mime||mime==='application/octet-stream')throw new Error('Ubuntu desktop could not identify '+${JSON.stringify(format.extension)}+': '+info);
      const defaultApp=c.execFileSync('xdg-mime',['query','default',mime],{encoding:'utf8',timeout:15000}).trim();
      return {bytes:bytes.length,type:read.类型,html:read.html,slides:read.演示文稿,mime,genericMime,defaultApp};
    })()`)
    check(result.bytes > 0 && result.type === format.type && JSON.stringify(result).includes('0012'), format.extension + ' native offline save and reopen, including leading zeros')
    check(result.defaultApp === 'sealoffice.desktop', format.extension + ' actual file MIME default: ' + result.mime)
    } catch (error) { report.failures.push({ extension: format.extension, error: error.message }); checkpoint(); console.error('FAIL ' + format.extension + ': ' + error.message) }
  }
  for (const extension of ['xlsb', 'xla']) {
    const data = fs.readFileSync(path.join(root, 'scripts/fixtures/documents/readonly.' + extension)).toString('base64')
    const result = await main.evaluate(`(async()=>{const p=process.mainModule.require('path'),e=process.mainModule.require('electron');const m=process.mainModule.require(p.join(e.app.getAppPath(),'main/office/compatibleFormats'));return m.读取兼容文档(${JSON.stringify(extension)},Buffer.from(${JSON.stringify(data)},'base64'))})()`)
    check(result.html.includes('0012') && result.警告.some(item => item.includes('来源文件保持不变')), extension + ' fixture imports body and protects source')
  }
  const pdf = await main.evaluate(`(async()=>{const e=process.mainModule.require('electron'),p=process.mainModule.require('path');const lib=process.mainModule.require(p.join(e.app.getAppPath(),'node_modules/pdf-lib'));const d=await lib.PDFDocument.create();d.addPage([300,300]);return Buffer.from(await d.save()).toString('base64')})()`)
  const edited = await page.evaluate(`window.electronAPI.pdf.editPage(${JSON.stringify(pdf)},{类型:'text',页码:1,x:20,y:20,文字:'中文 PDF 验收',字号:16,颜色:'#222222'})`)
  check(edited.成功, 'PDF Chinese text embeds bundled font: ' + (edited.错误 || 'passed'))
  await page.evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='首页'||b.getAttribute('aria-label')==='返回首页')?.click()")
  await main.evaluate(`(async()=>{const e=process.mainModule.require('electron'),f=process.mainModule.require('fs');const image=await e.BrowserWindow.getAllWindows()[0].webContents.capturePage();f.writeFileSync(${JSON.stringify(path.join(output, 'ubuntu-application.png'))},image.toPNG());return !image.isEmpty()})()`)
  check(fs.statSync(path.join(output, 'ubuntu-application.png')).size > 10000, 'Installed application screenshot captured')
  await main.evaluate("setTimeout(()=>process.mainModule.require('electron').app.exit(0),250);true")
  // Node inspector can defer process exit while its debugger is connected.
  main.close(); page.close()
  if (child.exitCode === null) await once(child, 'exit')
  check(child.exitCode === 0, 'Installed application exits normally')
  if (report.failures.length) throw new Error('Document compatibility verification failures: ' + report.failures.length)
}
verify().catch(error => { report.failures.push(error.stack); console.error(error.stack); process.exitCode = 1 }).finally(() => {
  for (const socket of sockets) socket.close()
  for (const child of processes) {
    if (child.exitCode === null && Number.isInteger(child.pid) && child.pid > 0) {
      // Failed verification owns this fresh process group; close guards must
      // not leave a CI application waiting for a user to dismiss a dialog.
      try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
    }
  }
  report.passed = report.failures.length === 0; report.finishedAt = new Date().toISOString()
  checkpoint()
})
