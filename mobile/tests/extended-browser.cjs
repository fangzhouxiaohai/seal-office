const { app, BrowserWindow } = require('electron')
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict')
const project = path.resolve(__dirname, '../..'), output = path.join(project, '.upgrade-private/mobile-verification')
const group = process.argv.find(arg => arg.startsWith('--group='))?.slice(8)
assert.ok(['reading', 'editor', 'workspace', 'diagram'].includes(group))
const webRoot = path.resolve(__dirname, process.argv.includes('--web') ? '../unpackage/web' : '../static/office'), localFile = process.argv.includes('--file')
app.setPath('userData', path.join(output, `browser-profile-${group}-${process.pid}`)); app.disableHardwareAcceleration()
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' }
app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true })
  const server = http.createServer((request, response) => {
    const filename = path.resolve(webRoot, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/\/$/, '/index.html'))
    if (!filename.startsWith(webRoot + path.sep)) { response.writeHead(403); response.end(); return }
    fs.stat(filename, (error, stat) => { if (error || !stat.isFile()) { response.writeHead(404); response.end(); return }; response.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' }); fs.createReadStream(filename).on('error', () => response.destroy()).pipe(response) })
  })
  await new Promise(resolve => server.listen(5191, '127.0.0.1', resolve))
  const win = new BrowserWindow({ show: false, width: 390, height: 844, webPreferences: { offscreen: false, backgroundThrottling: false, contextIsolation: true, sandbox: true, nodeIntegration: false } })
  const capture = win.capturePage.bind(win)
  win.capturePage = async (...args) => {
    win.webContents.focus()
    let last
    for (let attempt = 0; attempt < 20; attempt++) {
      try { const snapshot = await capture(...args); assert.ok(!snapshot.isEmpty(), '截图必须包含真实绘制的页面'); return snapshot }
      catch (error) { if (!/Current display surface not available/.test(error.message)) throw error; last = error; if (!attempt) { const [width, height] = win.getContentSize(); win.setContentSize(width, height + 1); win.setContentSize(width, height) }; await new Promise(resolve => setTimeout(resolve, 100)) }
    }
    throw last
  }
  const errors = [], checks = []
  win.webContents.on('console-message', (_, level, message) => { if (level >= 3) errors.push(message) })
  win.webContents.on('will-prevent-unload', event => event.preventDefault())
  win.webContents.session.on('will-download', (_, item) => item.cancel())
  const evaluate = async code => { const result = await win.webContents.executeJavaScript(`(async()=>{try{return {value:await (0,eval)(${JSON.stringify(code)})}}catch(error){return {error:error.stack || String(error)}}})()`, true); if (result.error) throw new Error(result.error); return result.value }
  const until = async (code, label) => { for (let i = 0; i < 120; i++) { if (await evaluate(code)) return; await new Promise(resolve => setTimeout(resolve, 100)) }; throw Error(label) }
  try {
    if (localFile) await win.loadFile(path.join(webRoot, 'index.html')); else await win.loadURL('http://127.0.0.1:5191/')
    await until(`!!document.querySelector('.wps-app')`, '生产应用必须挂载')
    if (localFile) await evaluate(`window.sealNative={token:'offline-test',platform:'android'};window.uni={webView:{postMessage:async({data})=>{if(data.action==='save'){window.sealReceiveNative({id:data.id,type:'saved'});return}if(data.action==='font'){const result=await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('GET','http://127.0.0.1:5191/fonts/NotoSansSC.ttf');xhr.responseType='arraybuffer';xhr.onload=()=>resolve(xhr.response);xhr.onerror=reject;xhr.send()});const bytes=new Uint8Array(result);for(let start=0;start<bytes.length;start+=98304){let text='';for(const b of bytes.slice(start,start+98304))text+=String.fromCharCode(b);window.sealReceiveNative({id:data.id,type:'chunk',data:btoa(text)})}window.sealReceiveNative({id:data.id,type:'end'})}}}};true`)
    if (group === 'reading') await require('./reading-pages-actions.cjs')({ win, evaluate, output, checks })
    if (group === 'editor') {
      await evaluate(`document.querySelector('[aria-label="全部功能"]').click()`)
      await until(`!!document.querySelector('.seal-mobile-create [data-document-type="word"]')`, '新建文字入口')
      await evaluate(`document.querySelector('.seal-mobile-create [data-document-type="word"]').click()`)
      await until(`!!document.querySelector('.wps-editor-canvas__content[contenteditable="true"]')`, '图片验收必须进入真实可编辑文字文档')
      for (const helper of ['image-actions', 'revision-browser-actions', 'spill-browser-actions']) await require('./' + helper + '.cjs')({ win, evaluate, output, checks })
    }
    if (group === 'workspace') await require('./workspace-tools-actions.cjs')({ win, evaluate, output, checks })
    if (group === 'diagram') await require('./diagram-browser-actions.cjs')({ win, evaluate, output, checks })
    assert(checks.length > 0)
    assert.equal(errors.filter(message => !/ERR_ABORTED|favicon/.test(message)).length, 0, errors.join('\n'))
    const result = { passed: true, group, version: require('../../package.json').version, checks, errors, scheme: localFile ? 'file' : 'http' }
    fs.writeFileSync(path.join(output, `${localFile ? 'file' : 'http'}-${group}-result.json`), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); app.exit(0)
  } catch (error) { console.error(error); fs.writeFileSync(path.join(output, `${localFile ? 'file' : 'http'}-${group}-result.json`), JSON.stringify({ passed: false, group, errors, checks, error: error.stack }, null, 2)); app.exit(1) }
  finally { server.close(); win.destroy() }
})
