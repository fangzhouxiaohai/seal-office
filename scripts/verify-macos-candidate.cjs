const fs = require('fs')
const os = require('os')
const path = require('path')
const assert = require('assert/strict')
const { spawn } = require('child_process')
const { once } = require('events')
const { Document, Packer, Paragraph } = require('docx')

const 应用 = process.argv[2]
if (process.platform !== 'darwin' || !应用 || !path.isAbsolute(应用)) throw new Error('需要苹果系统上的隔离应用路径')
const 临时 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-macos-verify-'))
const 程序 = path.join(应用, 'Contents/MacOS/海豹办公')
const 文稿 = path.join(临时, '中文验收.docx')
const 日志 = fs.openSync(path.join(临时, 'app.log'), 'w')
const 进程 = spawn(程序, ['--inspect=127.0.0.1:19331', '--remote-debugging-port=19330', `--user-data-dir=${path.join(临时, 'profile')}`], { stdio: ['ignore', 日志, 日志] })
const 延迟 = ms => new Promise(resolve => setTimeout(resolve, ms))
let 套接字

async function 连接(port, 选择) {
  for (let 次数 = 0; 次数 < 300; 次数++) {
    if (进程.exitCode !== null) throw new Error(`应用提前退出：${fs.readFileSync(path.join(临时, 'app.log'), 'utf8')}`)
    let 目标
    try { 目标 = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(选择) } catch {}
    if (目标) {
      const ws = new WebSocket(目标.webSocketDebuggerUrl)
      await once(ws, 'open')
      let 编号 = 0
      const 待处理 = new Map()
      ws.addEventListener('message', event => {
        const 值 = JSON.parse(String(event.data)), 任务 = 待处理.get(值.id)
        if (!任务) return
        待处理.delete(值.id); clearTimeout(任务.计时)
        if (值.error || 值.result?.exceptionDetails) 任务.reject(new Error(JSON.stringify(值.error || 值.result.exceptionDetails)))
        else 任务.resolve(值.result)
      })
      return { ws, 计算: 表达式 => new Promise((resolve, reject) => {
        const id = ++编号, 计时 = setTimeout(() => { 待处理.delete(id); reject(new Error('验收执行超时')) }, 120000)
        待处理.set(id, { resolve: 值 => resolve(值.result.value), reject, 计时 })
        ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: 表达式, awaitPromise: true, returnByValue: true } }))
      }) }
    }
    await 延迟(100)
  }
  throw new Error('应用调试接口未就绪')
}

async function 执行() {
  fs.writeFileSync(文稿, await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('中文转换验收')] }] })))
  const 主进程 = await 连接(19331, 目标 => !!目标.webSocketDebuggerUrl)
  套接字 = 主进程.ws
  for (let 次数 = 0; 次数 < 300; 次数++) {
    let 已就绪 = false
    try { 已就绪 = await 主进程.计算("!!process.mainModule && process.mainModule.require('electron').BrowserWindow.getAllWindows().length > 0") } catch {}
    if (已就绪) break
    if (次数 === 299) throw new Error('应用窗口未创建')
    await 延迟(100)
  }
  const 渲染 = await 连接(19330, 目标 => 目标.url.endsWith('/dist/index.html'))
  try {
    assert.equal(await 主进程.计算("process.mainModule.require('electron').app.isPackaged"), true)
    assert.equal(await 主进程.计算("process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().sandbox"), true)
    assert.equal(await 主进程.计算(`(async()=>{const e=process.mainModule.require('electron'), p=process.mainModule.require('path'), fs=process.mainModule.require('fs'); const c=process.mainModule.require(p.join(e.app.getAppPath(),'main/office/nativeConversion.js')); const pdf=await c.转换文档(fs.readFileSync(${JSON.stringify(文稿)}),'docx','pdf','word'); return pdf.subarray(0,5).toString()})()`), '%PDF-')
    await 主进程.计算(`(()=>{const e=process.mainModule.require('electron');e.app.emit('open-file',{preventDefault(){}},${JSON.stringify(文稿)});return true})()`)
    let 已打开 = false
    for (let 次数 = 0; 次数 < 300; 次数++) {
      if (await 渲染.计算("document.body.innerText.includes('中文验收.docx')")) { 已打开 = true; break }
      await 延迟(100)
    }
    assert(已打开, '主进程文件打开事件未到达界面')
    await 主进程.计算("(()=>{const e=process.mainModule.require('electron');for(const w of e.BrowserWindow.getAllWindows())w.destroy();e.app.emit('activate');e.app.emit('activate');return true})()")
    assert.equal(await 主进程.计算("process.mainModule.require('electron').BrowserWindow.getAllWindows().length"), 1)
    console.log('通过：隔离应用启动、沙箱、文件事件、程序坞事件、实际文稿转换')
    console.log('文件及程序坞事件由测试触发，尚须真实访达与程序坞手工验收。')
  } finally { 渲染.ws.close() }
}
执行().catch(错误 => { console.error(错误); process.exitCode = 1 }).finally(async () => {
  套接字?.close()
  if (进程.exitCode === null) 进程.kill('SIGTERM')
  await Promise.race([once(进程, 'exit').catch(() => {}), 延迟(3000)])
  fs.closeSync(日志)
})
