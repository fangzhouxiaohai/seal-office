const { test } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const net = require('node:net')
const path = require('node:path')
const { EventEmitter } = require('node:events')
const { 读取目标, 打开连接, 停止进程, 有界等待, 图形表达式, 窗口表达式, 等待窗口 } = require('./verify-macos-candidate.cjs')

test('上下文未初始化和主模块未就绪均可安全重试，真实异常继续抛出', () => {
  const vm = require('node:vm')
  assert.equal(vm.runInNewContext(窗口表达式(), {}), false)
  assert.equal(vm.runInNewContext(窗口表达式(), { process: {} }), false)
  const process = { mainModule: { require: () => ({ BrowserWindow: { getAllWindows: () => [{}] } }) } }
  assert.equal(vm.runInNewContext(窗口表达式(), { process }), true)
  const 错误进程 = { mainModule: { require: () => { throw new Error('加载失败') } } }
  assert.throws(() => vm.runInNewContext(窗口表达式(), { process: 错误进程 }), /加载失败/)
})

test('等待窗口只对未就绪结果重试，真实错误和总时限立即终止', async () => {
  let 次数 = 0
  await 等待窗口(async () => ++次数 >= 3, () => {}, new AbortController().signal, 1000, 1)
  assert.equal(次数, 3)
  await assert.rejects(等待窗口(async () => { throw new Error('真实调试错误') }, () => {}, new AbortController().signal, 1000, 1), /真实调试错误/)
  const 控制 = new AbortController(), 计时 = setTimeout(() => 控制.abort(), 30)
  try { await assert.rejects(等待窗口(async () => false, () => {}, 控制.signal, 1000, 1), /超时|取消/) }
  finally { clearTimeout(计时) }
})

test('通用包工作流的架构校验把文件放在选项前面', () => {
  const yaml = require('js-yaml')
  const 流程 = yaml.load(require('node:fs').readFileSync(path.join(__dirname, '../.github/workflows/macos-universal-experiment.yml'), 'utf8'))
  const commands = Object.values(流程.jobs).flatMap(job => job.steps || []).map(step => step.run || '').join('\n')
  const 检查 = commands.split('\n').filter(line => line.includes('lipo ') && line.includes('-verify_arch'))
  assert.equal(检查.length, 4)
  for (const 行 of 检查) assert.match(行, /lipo\s+"\$[^"]+"\s+-verify_arch\s+(?:x86_64|arm64)/)
})

test('图形验收使用当前应用路径加载原生模块并检查图片签名', () => {
  const vm = require('node:vm')
  for (const 应用路径 of ['/example/app.asar', '/example/app-arm64.asar', '/example/app-x64.asar']) {
    const requests = []
    const process = { mainModule: { require(name) {
      requests.push(name)
      if (name === 'electron') return { app: { getAppPath: () => 应用路径 } }
      if (name === 'path') return path.posix
      if (name === `${应用路径}/node_modules/@napi-rs/canvas`) return { createCanvas: () => ({ toBuffer: () => Buffer.from('89504e470d0a1a0a', 'hex') }) }
      throw new Error('未知模块')
    } } }
    assert.equal(vm.runInNewContext(图形表达式(), { process }), '89504e470d0a1a0a')
    assert.ok(requests.includes(`${应用路径}/node_modules/@napi-rs/canvas`))
  }
})

test('未结束的验收阶段受总时限约束', async () => {
  const 控制 = new AbortController(), 计时 = setTimeout(() => 控制.abort(), 100)
  try { await assert.rejects(有界等待(new Promise(() => {}), 控制.signal), /超时|取消/) }
  finally { clearTimeout(计时) }
})

test('调试服务不返回响应时，读取目标按时失败', async t => {
  const 服务 = http.createServer(() => {})
  const 客户端 = new Set()
  服务.on('connection', c => { 客户端.add(c); c.on('close', () => 客户端.delete(c)) })
  await new Promise(resolve => 服务.listen(0, '127.0.0.1', resolve))
  t.after(() => { for (const c of 客户端) c.destroy(); 服务.close() })
  const 开始 = Date.now()
  await assert.rejects(读取目标(服务.address().port, AbortSignal.timeout(100)), /超时|取消/)
  assert.ok(Date.now() - 开始 < 2000)
})

test('调试连接握手无响应时按时失败并关闭连接', async t => {
  const 客户端 = new Set()
  const 服务 = net.createServer(c => { 客户端.add(c); c.on('close', () => 客户端.delete(c)); c.on('data', () => {}) })
  await new Promise(resolve => 服务.listen(0, '127.0.0.1', resolve))
  t.after(() => { for (const c of 客户端) c.destroy(); 服务.close() })
  const 开始 = Date.now()
  await assert.rejects(打开连接(`ws://127.0.0.1:${服务.address().port}`, AbortSignal.timeout(100)), /超时|取消/)
  assert.ok(Date.now() - 开始 < 2000)
})

test('应用忽略正常退出时，有限等待后强制结束', async () => {
  const 子进程 = new EventEmitter()
  子进程.pid = 12345; 子进程.exitCode = null; 子进程.signalCode = null
  const 信号 = []
  子进程.kill = signal => { 信号.push(signal); if (signal === 'SIGKILL') { 子进程.signalCode = signal; 子进程.emit('exit', null, signal) }; return true }
  await 停止进程(子进程, 30)
  assert.deepEqual(信号, ['SIGTERM', 'SIGKILL'])
})

test('未成功启动的应用不等待退出事件', async () => {
  const 子进程 = new EventEmitter()
  子进程.exitCode = null; 子进程.signalCode = null
  子进程.kill = () => { throw new Error('不能终止没有进程号的应用') }
  await 停止进程(子进程, 30)
})
