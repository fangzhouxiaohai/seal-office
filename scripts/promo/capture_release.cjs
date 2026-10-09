// Record the shipped application with an isolated profile and public demo files.
// No user profile, account, secret or personal document is read.
const fs = require('fs')
const path = require('path')
const net = require('net')
const { spawn } = require('child_process')
const root = path.resolve(__dirname, '../..')
const config = JSON.parse(fs.readFileSync(path.join(root, 'docs/promo/storyboard.json'), 'utf8'))
const work = path.join(root, `release/promo/work-v${config.版本}`)
const executable = path.join(root, `release/v${config.版本}/win-unpacked/SealOffice.exe`)
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function listener() {
  const server = net.createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { server, port: server.address().port }
}
async function connect(port) {
  let target
  for (let i = 0; i < 150; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.webSocketDebuggerUrl) } catch {}
    if (target) break
    await pause(100)
  }
  if (!target) throw new Error('Release inspector did not start')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', ({ data }) => {
    const message = JSON.parse(String(data)), task = pending.get(message.id)
    if (!task) return
    pending.delete(message.id); clearTimeout(task.timer)
    if (message.error || message.result?.exceptionDetails) task.reject(new Error(message.error?.message || message.result.exceptionDetails.exception?.description))
    else task.resolve(message.result.result.value)
  })
  return { ws, evaluate: expression => new Promise((resolve, reject) => {
    const serial = ++id, timer = setTimeout(() => { pending.delete(serial); reject(new Error('Capture setup timed out')) }, 20000)
    pending.set(serial, { resolve, reject, timer })
    ws.send(JSON.stringify({ id: serial, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
  }) }
}
async function main() {
  fs.mkdirSync(work, { recursive: true })
  const demo = path.join(work, 'demo'), profile = path.join(work, `profile-${Date.now()}`)
  const files = ['产品发布计划.docx', '项目预算.xlsx', '秋季发布汇报.pptx', '发布资料清单.pdf'].map(name => path.join(demo, name))
  if (!fs.existsSync(executable) || files.some(file => !fs.existsSync(file))) throw new Error('Verified release or demonstration files are missing')
  const page = await listener(), mainPort = await listener()
  await Promise.all([new Promise(resolve => page.server.close(resolve)), new Promise(resolve => mainPort.server.close(resolve))])
  const stderr = fs.openSync(path.join(work, 'app-stderr.log'), 'w')
  const app = spawn(executable, [`--user-data-dir=${profile}`, '--skip-default-app-check', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${page.port}`, `--inspect=127.0.0.1:${mainPort.port}`, ...files], { windowsHide: true, stdio: ['ignore', 'ignore', stderr] })
  let channel
  try {
    channel = await connect(mainPort.port)
    let ready = false
    for (let i = 0; i < 100; i++) { ready = await channel.evaluate("Boolean(process.mainModule?.require) && process.mainModule.require('electron').BrowserWindow.getAllWindows().some(w=>w.webContents.getURL().endsWith('/dist/index.html'))"); if (ready) break; await pause(100) }
    if (!ready) throw new Error('Release main window did not load')
    const messages = [
      { 角色: 'user', 内容: '示例对话：请给出项目行动清单与预算计算代码。' },
      { 角色: 'assistant', 内容: '# 项目行动清单\n\n**目标：**按时完成发布准备。\n\n- [x] 整理资料\n- [ ] 核对预算\n- [ ] 准备团队汇报\n\n| 项目 | 建议 |\n| --- | --- |\n| 资料 | 统一标题与格式 |\n| 预算 | 核对数量和单价 |\n\n以上为排版展示示例。', 状态: '完成' },
      { 角色: 'assistant', 内容: '```python\n# 计算项目预算（示例）\nqty = 3\nprice = 1200\ntotal = qty * price\n\nprint(f"项目预算：{total:,.2f} 元")\n```', 状态: '完成' },
    ]
    const actual = await channel.evaluate(`(async()=>{
      const electron=process.mainModule.require('electron'),path=process.mainModule.require('path')
      const win=electron.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/dist/index.html'))
      win.unmaximize();win.setBounds({x:40,y:40,width:1440,height:900});win.webContents.setBackgroundThrottling(false)
      const memory=process.mainModule.require(path.join(electron.app.getAppPath(),'main/ai/sessionMemory.js')).创建会话存储({目录:path.join(electron.app.getPath('userData'),'assistant-sessions'),安全存储:electron.safeStorage})
      await memory.保存(${JSON.stringify('file:' + files[0].replace(/\\/g, '/').toLowerCase())},{模型消息:[],显示消息:${JSON.stringify(messages)},摘要:'公开演示会话，不代表实际模型返回。',计划:[],压缩次数:0})
      return {version:electron.app.getVersion(),isolated:electron.app.getPath('userData')===${JSON.stringify(profile)}}
    })()`)
    if (actual.version !== config.版本 || !actual.isolated) throw new Error('Capture must use the matching release and isolated profile')
    await pause(2000)
    const child = spawn(process.execPath, [path.join(__dirname, 'record_app.cjs'), String(page.port), ...process.argv.slice(2)], { windowsHide: true, stdio: 'inherit' })
    const code = await new Promise(resolve => child.once('exit', resolve))
    if (code) throw new Error('Release capture failed')
    fs.writeFileSync(path.join(work, 'capture-source.json'), JSON.stringify({ version: config.版本, executable, profile, files: files.map(file => path.basename(file)), assistant: '公开示例会话；没有调用模型服务', recorded: new Date().toISOString() }, null, 2))
    console.log('Latest release recording complete')
  } finally {
    if (channel) { await channel.evaluate("process.mainModule.require('electron').app.exit(0)").catch(() => {}); channel.ws.close() }
    if (app.exitCode === null) app.kill()
    fs.closeSync(stderr)
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
