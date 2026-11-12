// 在隔离的安卓调试应用中，用系统返回键核验主导航不可见时的阅读与放映行为。
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const { PDFDocument } = require('pdf-lib')
const WebSocket = require('ws')

const adb = process.env.ANDROID_ADB || 'adb'
const packageName = 'com.sealoffice.mobile.nativeqa'
const activity = `${packageName}/com.sealoffice.mobile.MainActivity`
const run = (...args) => execFileSync(adb, args, { encoding: 'utf8', timeout: 15000 }).trim()
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

async function main() {
  run('shell', 'am', 'start', '-n', activity)
  await wait(2000)
  const pid = run('shell', 'pidof', packageName).split(/\s+/)[0]
  assert.ok(pid, '安卓调试应用未运行')
  run('forward', 'tcp:9222', `localabstract:webview_devtools_remote_${pid}`)
  const targets = await (await fetch('http://127.0.0.1:9222/json')).json()
  const target = targets.find(item => item.url.startsWith('file:///android_asset/apps/__UNI__B52B65B/www/static/office/index.html'))
  assert.ok(target, '未找到安卓工作台')
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject) })
  let serial = 0
  const pending = new Map()
  socket.on('message', raw => {
    const response = JSON.parse(String(raw)); const entry = pending.get(response.id)
    if (entry) { pending.delete(response.id); response.error ? entry.reject(new Error(response.error.message)) : entry.resolve(response.result) }
  })
  const evaluate = expression => new Promise((resolve, reject) => {
    const id = ++serial; pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true, userGesture: true } }))
  }).then(result => { if (result.exceptionDetails) throw new Error(result.exceptionDetails.text); return result.result?.value })
  const until = async (expression, label) => {
    for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(expression)) return; await wait(100) }
    throw new Error(`等待界面超时：${label}`)
  }
  const navVisible = `(()=>{const n=document.querySelector('.seal-mobile-nav');if(!n)return false;const r=n.getBoundingClientRect();if(r.width<=0||r.height<=0||r.bottom<=0||r.top>=innerHeight)return false;const x=Math.min(innerWidth-1,Math.max(0,r.left+r.width/2)),y=Math.min(innerHeight-1,Math.max(0,r.top+r.height/2));const top=document.elementFromPoint(x,y);return !!top&&(n===top||n.contains(top))})()`
  async function create(type, selector) {
    await evaluate("document.querySelectorAll('.seal-mobile-nav button')[2].click()")
    await until("Boolean(document.querySelector('.seal-mobile-create'))", '服务入口')
    await evaluate(`document.querySelector('[data-document-type=${JSON.stringify(type)}]').click()`)
    await until(`Boolean(document.querySelector(${JSON.stringify(selector)}))`, `${type} 编辑区`)
  }
  async function backFrom(selector, label) {
    assert.equal(await evaluate(navVisible), false, `${label} 时底部导航不应处于可视区`)
    run('shell', 'input', 'keyevent', '4')
    await until(`!document.querySelector(${JSON.stringify(selector)})`, `${label} 返回上一界面`)
    await wait(500)
    assert.match(run('shell', 'dumpsys', 'activity', 'activities'), /topResumedActivity=.*com\.sealoffice\.mobile\.nativeqa/, `${label} 返回后应用应仍在前台`)
    console.log(`${label}：系统返回键退出当前界面，应用保持前台`)
  }
  async function openTestPdf() {
    const pdf = await PDFDocument.create(); pdf.addPage([400, 600])
    const data = Buffer.from(await pdf.save()).toString('base64')
    const file = `/seal/documents/${randomUUID()}/返回测试.pdf`
    await evaluate(`(()=>{const api=window.electronAPI;window.__backResult=null;api.saveToFile(${JSON.stringify(file)},${JSON.stringify(data)},'二进制').then(result=>{window.__backResult=result}).catch(error=>{window.__backResult={成功:false,错误:error.message}});return true})()`)
    await until("Boolean(window.__backResult)", 'PDF 测试文件保存')
    assert.equal(await evaluate("window.__backResult.成功"), true, 'PDF 测试文件保存失败')
    await evaluate(`(()=>{const api=window.electronAPI;window.__backOpen=api.showOpenDialog;api.showOpenDialog=async()=>${JSON.stringify(file)};document.querySelectorAll('.seal-mobile-nav button')[0].click();return true})()`)
    await until("Boolean(document.querySelector('.seal-mobile-homebar [aria-label=\"导入文件\"],.seal-mobile-homebar [aria-label=\"Import file\"]'))", '导入文件入口')
    await evaluate("document.querySelector('.seal-mobile-homebar [aria-label=\"导入文件\"],.seal-mobile-homebar [aria-label=\"Import file\"]').click()")
    await until("Boolean(document.querySelector('.pdf-viewer__canvas')?.width)", '真实 PDF 页面')
    await evaluate("window.electronAPI.showOpenDialog=window.__backOpen;delete window.__backOpen")
  }
  try {
    await until("document.querySelectorAll('.seal-mobile-nav button').length===5", '底部主导航')
    await create('word', '.wps-editor-canvas__content')
    await until("Boolean(document.querySelector('.seal-reading-toolbar__modes button'))", '文字阅读模式')
    const language = await evaluate("document.documentElement.lang")
    if (language === 'en-US') {
      const editing = await evaluate("({hint:document.querySelector('.seal-reading-toolbar__hint').textContent.trim(),status:getComputedStyle(document.querySelector('.wps-editor-status__left'),'::before').content})")
      assert.equal(editing.hint, 'Editable', '英文编辑状态应显示英文')
      assert.match(editing.status, /Mobile editing view/, '英文底部状态应显示英文')
      const banner = await evaluate("(()=>{const b=document.querySelector('.seal-cloud-banner'),t=b.querySelector(':scope > span'),r=b.getBoundingClientRect(),tr=t.getBoundingClientRect();return {width:r.width,height:r.height,textWidth:tr.width,overflow:b.scrollWidth>b.clientWidth+1}})()")
      assert.ok(banner.textWidth >= banner.width - 32 && banner.height <= 150 && !banner.overflow, '窄屏英文提示条应完整显示')
    }
    await evaluate("document.querySelector('.seal-reading-toolbar__modes button').click()")
    if (language === 'en-US') {
      await until("document.querySelector('.seal-reading-toolbar')?.dataset.reading==='true'", '文字阅读状态')
      assert.equal(await evaluate("document.querySelector('.seal-reading-toolbar__hint').textContent.trim()"), 'Read-only')
      assert.match(await evaluate("getComputedStyle(document.querySelector('.wps-editor-status__left'),'::before').content"), /Mobile reading view/)
    }
    await until("Boolean(document.querySelector('.seal-reading-toolbar__actions button:last-child'))", '文字阅读入口')
    await evaluate("document.querySelector('.seal-reading-toolbar__actions button:last-child').click()")
    await until("Boolean(document.querySelector('.seal-word-reader'))", '文字全屏阅读')
    await backFrom('.seal-word-reader', '文字全屏阅读')
    await openTestPdf()
    await until("Boolean(document.querySelector('.pdf-viewer [aria-label=\"全屏左右翻页阅读\"],.pdf-viewer [aria-label=\"Read full screen with left and right page navigation\"]'))", 'PDF 阅读入口')
    await evaluate("document.querySelector('.pdf-viewer [aria-label=\"全屏左右翻页阅读\"],.pdf-viewer [aria-label=\"Read full screen with left and right page navigation\"]').click()")
    await until("Boolean(document.querySelector('.pdf-viewer--fullscreen'))", 'PDF 全屏阅读')
    await backFrom('.pdf-viewer--fullscreen', 'PDF 全屏阅读')
    await create('ppt', '.wps-ppt-canvas')
    await evaluate("[...document.querySelectorAll('.wps-ribbon-tabs button')].find(x=>/幻灯片放映|Slide Show/.test(x.textContent)).click()")
    await until("[...document.querySelectorAll('.wps-ribbon-panel button')].some(x=>/从头开始|From Beginning/.test(x.textContent))", '演示放映入口')
    await evaluate("[...document.querySelectorAll('.wps-ribbon-panel button')].find(x=>/从头开始|From Beginning/.test(x.textContent)).click()")
    await until("Boolean(document.querySelector('.wps-slideshow'))", '演示放映')
    await backFrom('.wps-slideshow', '演示放映')
  } finally {
    await evaluate("if(window.__backOpen){window.electronAPI.showOpenDialog=window.__backOpen;delete window.__backOpen}delete window.__backResult").catch(() => {})
    socket.close(); run('forward', '--remove', 'tcp:9222')
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1 })
