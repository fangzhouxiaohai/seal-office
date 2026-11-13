const fs = require('fs')
const os = require('os')
const path = require('path')
const assert = require('assert/strict')
const { spawn } = require('child_process')
const WebSocket = require('ws')
const { Document, Packer, Paragraph } = require('docx')

const 延迟 = ms => new Promise(resolve => setTimeout(resolve, ms))
const 中断错误 = () => new Error('验收超时或已取消')
const 限时 = (信号, 毫秒) => AbortSignal.any([信号, AbortSignal.timeout(毫秒)])
const 图形表达式 = () => `(()=>{const e=process.mainModule.require('electron'),p=process.mainModule.require('path');const canvas=process.mainModule.require(p.join(e.app.getAppPath(),'node_modules/@napi-rs/canvas'));return canvas.createCanvas(2,2).toBuffer('image/png').subarray(0,8).toString('hex')})()`

function 有界等待(任务, 信号) {
  return new Promise((resolve, reject) => {
    if (信号.aborted) return reject(中断错误())
    const 中断 = () => { 清理(); reject(中断错误()) }
    const 清理 = () => 信号.removeEventListener('abort', 中断)
    信号.addEventListener('abort', 中断, { once: true })
    Promise.resolve(任务).then(值 => { 清理(); resolve(值) }, 错误 => { 清理(); reject(错误) })
  })
}

async function 读取目标(端口, 信号) {
  try {
    const 响应 = await fetch(`http://127.0.0.1:${端口}/json/list`, { signal: 信号 })
    if (!响应.ok) throw new Error('调试接口状态异常：' + 响应.status)
    return await 响应.json()
  } catch (错误) { if (信号.aborted) throw 中断错误(); throw 错误 }
}

function 打开连接(地址, 信号) {
  return new Promise((resolve, reject) => {
    if (信号.aborted) return reject(中断错误())
    const ws = new WebSocket(地址)
    // terminate 后可能异步产生 error，始终保留错误监听，避免进程异常退出。
    ws.on('error', () => {})
    const 清理 = () => { 信号.removeEventListener('abort', 中断); ws.removeListener('open', 成功); ws.removeListener('error', 失败); ws.removeListener('close', 关闭) }
    const 中断 = () => { 清理(); ws.terminate(); reject(中断错误()) }
    const 成功 = () => { 清理(); resolve(ws) }
    const 失败 = 错误 => { 清理(); ws.terminate(); reject(错误) }
    const 关闭 = () => { 清理(); reject(new Error('调试连接在握手前关闭')) }
    ws.once('open', 成功); ws.once('error', 失败); ws.once('close', 关闭); 信号.addEventListener('abort', 中断, { once: true })
    if (信号.aborted) 中断()
  })
}

async function 停止进程(进程, 等待 = 3000) {
  if (!Number.isInteger(进程.pid) || 进程.exitCode !== null || 进程.signalCode !== null) return
  const 等待退出 = () => new Promise(resolve => {
    if (进程.exitCode !== null || 进程.signalCode !== null) return resolve()
    const 完成 = () => { clearTimeout(计时); 进程.removeListener('exit', 完成); resolve() }
    const 计时 = setTimeout(完成, 等待)
    进程.once('exit', 完成)
  })
  进程.kill('SIGTERM')
  await 等待退出()
  if (进程.exitCode === null && 进程.signalCode === null) {
    进程.kill('SIGKILL')
    await 等待退出()
    if (进程.exitCode === null && 进程.signalCode === null) throw new Error('隔离应用未能结束')
  }
}

async function 验收(应用) {
  if (process.platform !== 'darwin' || !应用 || !path.isAbsolute(应用)) throw new Error('需要苹果系统上的隔离应用路径')
  const 控制 = new AbortController()
  const 总信号 = 控制.signal
  const 总计时 = setTimeout(() => 控制.abort(), 240000)
  const 临时 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-macos-verify-'))
  const 文稿 = path.join(临时, '中文验收.docx')
  const 日志路径 = path.join(临时, 'app.log')
  const 日志 = fs.openSync(日志路径, 'w')
  const 进程 = spawn(path.join(应用, 'Contents/MacOS/海豹办公'), ['--inspect=127.0.0.1:19331', '--remote-debugging-port=19330', `--user-data-dir=${path.join(临时, 'profile')}`], { stdio: ['ignore', 日志, 日志] })
  let 进程错误
  进程.on('error', 错误 => { 进程错误 = 错误 })
  const 连接集 = new Set()
  let 阶段 = '启动应用'
  const 进度 = 值 => { 阶段 = 值; console.log('验收阶段：' + 值) }
  function 检查进程() {
    if (总信号.aborted) throw 中断错误()
    if (进程错误) throw new Error('应用无法启动：' + 进程错误.message)
    if (进程.exitCode !== null || 进程.signalCode !== null) throw new Error('应用提前退出：' + fs.readFileSync(日志路径, 'utf8').slice(-12000))
  }
  async function 连接(port, 选择) {
    const 截止 = Date.now() + 30000
    while (Date.now() < 截止) {
      检查进程()
      let 目标
      try { 目标 = (await 读取目标(port, 限时(总信号, 2000))).find(选择) } catch (错误) { if (总信号.aborted) throw 错误 }
      if (目标) {
        const ws = await 打开连接(目标.webSocketDebuggerUrl, 限时(总信号, 5000))
        连接集.add(ws)
        let 编号 = 0
        const 待处理 = new Map()
        const 清空 = 错误 => { for (const 任务 of 待处理.values()) 任务.拒绝(错误) }
        ws.on('close', () => 清空(new Error('调试连接已关闭')))
        ws.on('error', 错误 => 清空(错误))
        ws.on('message', 消息 => {
          let 值
          try { 值 = JSON.parse(String(消息)) } catch { return 清空(new Error('调试接口返回无效内容')) }
          const 任务 = 待处理.get(值.id)
          if (!任务) return
          if (值.error || 值.result?.exceptionDetails) 任务.拒绝(new Error(JSON.stringify(值.error || 值.result.exceptionDetails)))
          else 任务.完成(值.result.result.value)
        })
        return { ws, 计算: (表达式, 毫秒 = 5000) => new Promise((resolve, reject) => {
          if (总信号.aborted) return reject(中断错误())
          const id = ++编号, 信号 = 限时(总信号, 毫秒)
          const 清理 = () => { 待处理.delete(id); 信号.removeEventListener('abort', 超时) }
          const 完成 = 值 => { 清理(); resolve(值) }, 拒绝 = 错误 => { 清理(); reject(错误) }
          const 超时 = () => 拒绝(new Error('调试执行超时：' + 阶段))
          待处理.set(id, { 完成, 拒绝 }); 信号.addEventListener('abort', 超时, { once: true })
          if (信号.aborted) return 超时()
          try { ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: 表达式, awaitPromise: true, returnByValue: true } })) } catch (错误) { 拒绝(错误) }
        }) }
      }
      await 延迟(100)
    }
    throw new Error('应用调试接口未就绪：' + port)
  }
  try {
    进度('准备隔离文稿')
    fs.writeFileSync(文稿, await 有界等待(Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('中文转换验收')] }] })), 总信号))
    进度('连接主进程调试接口')
    const 主进程 = await 连接(19331, 目标 => !!目标.webSocketDebuggerUrl)
    进度('等待应用窗口')
    const 截止 = Date.now() + 30000
    let 已就绪 = false
    while (Date.now() < 截止) {
      检查进程()
      已就绪 = await 主进程.计算("!!process.mainModule && process.mainModule.require('electron').BrowserWindow.getAllWindows().length > 0")
      if (已就绪) break
      await 延迟(100)
    }
    if (!已就绪) throw new Error('应用窗口未创建')
    进度('连接界面调试接口')
    const 渲染 = await 连接(19330, 目标 => 目标.url.endsWith('/dist/index.html'))
    进度('核对应用与沙箱')
    assert.equal(await 主进程.计算("process.mainModule.require('electron').app.isPackaged"), true)
    assert.equal(await 主进程.计算("process.mainModule.require('electron').BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().sandbox"), true)
    进度('加载原生图形模块')
    assert.equal(await 主进程.计算(图形表达式(), 20000), '89504e470d0a1a0a')
    进度('转换文稿')
    assert.equal(await 主进程.计算(`(async()=>{const e=process.mainModule.require('electron'), p=process.mainModule.require('path'), fs=process.mainModule.require('fs'); const c=process.mainModule.require(p.join(e.app.getAppPath(),'main/office/nativeConversion.js')); const pdf=await c.转换文档(fs.readFileSync(${JSON.stringify(文稿)}),'docx','pdf','word'); return pdf.subarray(0,5).toString()})()`, 110000), '%PDF-')
    进度('验证文件事件')
    await 主进程.计算(`(()=>{const e=process.mainModule.require('electron');e.app.emit('open-file',{preventDefault(){}},${JSON.stringify(文稿)});return true})()`)
    const 打开截止 = Date.now() + 30000
    let 已打开 = false
    while (Date.now() < 打开截止) {
      检查进程()
      if (await 渲染.计算("document.body.innerText.includes('中文验收.docx')")) { 已打开 = true; break }
      await 延迟(100)
    }
    assert(已打开, '主进程文件打开事件未到达界面')
    进度('验证程序坞事件')
    await 主进程.计算("(()=>{const e=process.mainModule.require('electron');for(const w of e.BrowserWindow.getAllWindows())w.destroy();e.app.emit('activate');e.app.emit('activate');return true})()")
    assert.equal(await 主进程.计算("process.mainModule.require('electron').BrowserWindow.getAllWindows().length"), 1)
    console.log('通过：隔离应用启动、沙箱、文件事件、程序坞事件、实际文稿转换')
    console.log('文件及程序坞事件由测试触发，尚须真实访达与程序坞手工验收。')
  } catch (错误) {
    throw new Error(`验收失败（${阶段}）：${错误.message}\n应用日志：\n${fs.readFileSync(日志路径, 'utf8').slice(-12000)}`, { cause: 错误 })
  } finally {
    clearTimeout(总计时)
    for (const ws of 连接集) ws.terminate()
    try { await 停止进程(进程) } finally { fs.closeSync(日志) }
  }
}

module.exports = { 读取目标, 打开连接, 停止进程, 有界等待, 图形表达式 }
if (require.main === module) 验收(process.argv[2]).catch(错误 => { console.error(错误); process.exitCode = 1 })
