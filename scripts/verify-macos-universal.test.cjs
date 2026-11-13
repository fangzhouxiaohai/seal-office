const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { 对齐副本, 规范属性, 校验完整性, 图形表达式, 运行图形验收 } = require('./verify-macos-universal.cjs')

test('两架构图形验收只加载对应的应用模块，未就绪等待且错误不隐藏', () => {
  const vm = require('node:vm')
  assert.equal(vm.runInNewContext(图形表达式(), {}).就绪, false)
  for (const arch of ['arm64', 'x64']) {
    const 应用路径 = `/app/Contents/Resources/app-${arch}.asar`
    let loaded = ''
    const process = { arch, mainModule: { require(name) {
      if (name === 'electron') return { app: { getAppPath: () => 应用路径 } }
      if (name === 'path') return path.posix
      loaded = name
      return { createCanvas: () => ({ toBuffer: () => Buffer.from('89504e470d0a1a0a', 'hex') }) }
    } } }
    const result = vm.runInNewContext(图形表达式(), { process })
    assert.equal(result.架构, arch); assert.equal(result.签名, '89504e470d0a1a0a')
    assert.equal(loaded, `${应用路径}/node_modules/@napi-rs/canvas`)
  }
  const process = { arch: 'arm64', mainModule: { require: () => { throw new Error('真实加载错误') } } }
  assert.throws(() => vm.runInNewContext(图形表达式(), { process }), /真实加载错误/)
})

test('图形验收接口无响应时有界退出并清理应用', async t => {
  const http = require('node:http'), { EventEmitter } = require('node:events')
  const 客户端 = new Set(), 服务 = http.createServer(() => {})
  服务.on('connection', c => { 客户端.add(c); c.on('close', () => 客户端.delete(c)) })
  await new Promise(resolve => 服务.listen(0, '127.0.0.1', resolve))
  t.after(() => { for (const c of 客户端) c.destroy(); 服务.close() })
  const 进程 = new EventEmitter(); 进程.pid = 123; 进程.exitCode = null; 进程.signalCode = null
  进程.kill = signal => { 进程.signalCode = signal; 进程.emit('exit', null, signal); return true }
  await assert.rejects(运行图形验收(进程, { 端口: 服务.address().port, 总时限: 100 }), /超时|取消/)
  assert.equal(进程.signalCode, 'SIGTERM')
})

test('图形验收握手无响应时有界退出并清理应用', async t => {
  const http = require('node:http'), net = require('node:net'), { EventEmitter } = require('node:events')
  const 客户端 = new Set(), ws = net.createServer(c => { 客户端.add(c); c.on('close', () => 客户端.delete(c)); c.on('data', () => {}) })
  await new Promise(resolve => ws.listen(0, '127.0.0.1', resolve))
  const 服务 = http.createServer((_, res) => res.end(JSON.stringify([{ webSocketDebuggerUrl: `ws://127.0.0.1:${ws.address().port}` }])))
  await new Promise(resolve => 服务.listen(0, '127.0.0.1', resolve))
  t.after(() => { for (const c of 客户端) c.destroy(); ws.close(); 服务.close() })
  const 进程 = new EventEmitter(); 进程.pid = 123; 进程.exitCode = null; 进程.signalCode = null
  进程.kill = signal => { 进程.signalCode = signal; 进程.emit('exit', null, signal); return true }
  await assert.rejects(运行图形验收(进程, { 端口: 服务.address().port, 总时限: 100 }), /超时|取消/)
  assert.equal(进程.signalCode, 'SIGTERM')
})

test('图形验收连接后等待架构入口并检查 PNG，连接和进程均被清理', async t => {
  const http = require('node:http'), { EventEmitter } = require('node:events'), { WebSocketServer } = require('ws')
  const 服务 = http.createServer((_, res) => res.end(JSON.stringify([{ webSocketDebuggerUrl: `ws://127.0.0.1:${服务.address().port}` }])))
  const ws = new WebSocketServer({ server: 服务 })
  let 请求数 = 0
  ws.on('connection', socket => socket.on('message', message => {
    const 内容 = JSON.parse(String(message)); 请求数++
    const value = 请求数 === 1 ? { 就绪: false } : { 就绪: true, 架构: 'x64', 签名: '89504e470d0a1a0a' }
    socket.send(JSON.stringify({ id: 内容.id, result: { result: { value } } }))
  }))
  await new Promise(resolve => 服务.listen(0, '127.0.0.1', resolve))
  t.after(() => { for (const c of ws.clients) c.terminate(); ws.close(); 服务.close() })
  const 进程 = new EventEmitter(); 进程.pid = 123; 进程.exitCode = null; 进程.signalCode = null
  进程.kill = signal => { 进程.signalCode = signal; 进程.emit('exit', null, signal); return true }
  const 结果 = await 运行图形验收(进程, { 端口: 服务.address().port, 总时限: 3000, 期望架构: 'x64' })
  assert.equal(结果.架构, 'x64'); assert.equal(请求数, 2); assert.equal(进程.signalCode, 'SIGTERM')
  const 再次 = new EventEmitter(); 再次.pid = 124; 再次.exitCode = null; 再次.signalCode = null
  再次.kill = signal => { 再次.signalCode = signal; 再次.emit('exit', null, signal); return true }
  await assert.rejects(运行图形验收(再次, { 端口: 服务.address().port, 总时限: 3000, 期望架构: 'arm64' }), /架构不符/)
  assert.equal(再次.signalCode, 'SIGTERM')
})

test('通用包完整性键和每份 ASAR 头摘要均须准确', async t => {
  const plist = require('plist'), asar = require('@electron/asar'), crypto = require('node:crypto')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-integrity-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const contents = path.join(root, 'app/Contents'), resources = path.join(contents, 'Resources'), source = path.join(root, 'source')
  fs.mkdirSync(resources, { recursive: true }); fs.mkdirSync(source); fs.writeFileSync(path.join(source, 'entry.js'), '测试')
  const 项 = {}
  for (const 名称 of ['app.asar', 'app-arm64.asar', 'app-x64.asar']) {
    const 文件 = path.join(resources, 名称)
    await asar.createPackage(source, 文件)
    项['Resources/' + 名称] = { algorithm: 'SHA256', hash: crypto.createHash('sha256').update(asar.getRawHeader(文件).headerString).digest('hex') }
  }
  const 属性 = path.join(contents, 'Info.plist')
  fs.writeFileSync(属性, plist.build({ ElectronAsarIntegrity: 项 }))
  assert.doesNotThrow(() => 校验完整性(path.join(root, 'app')))
  项['Resources/app.asar'].hash = '0'.repeat(64)
  fs.writeFileSync(属性, plist.build({ ElectronAsarIntegrity: 项 }))
  assert.throws(() => 校验完整性(path.join(root, 'app')), /摘要不一致/)
  delete 项['Resources/app.asar']; 项['../E:\\Temp\\app.asar'] = { algorithm: 'SHA256', hash: '0'.repeat(64) }
  fs.writeFileSync(属性, plist.build({ ElectronAsarIntegrity: 项 }))
  assert.throws(() => 校验完整性(path.join(root, 'app')), /路径不一致/)
})

test('属性字典顺序不同但内容相同时可标准化，保留各自完整性字段', t => {
  const plist = require('plist')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-plist-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const x = path.join(root, 'x.plist'), a = path.join(root, 'a.plist')
  fs.writeFileSync(x, plist.build({ z: { b: 2, a: 1 }, a: ['first', 'second'], ElectronAsarIntegrity: { x: 'x' } }))
  fs.writeFileSync(a, plist.build({ a: ['first', 'second'], z: { a: 1, b: 2 }, ElectronAsarIntegrity: { a: 'a' } }))
  规范属性(x, a)
  const 左 = plist.parse(fs.readFileSync(x, 'utf8')), 右 = plist.parse(fs.readFileSync(a, 'utf8'))
  assert.deepEqual(左.ElectronAsarIntegrity, { x: 'x' }); assert.deepEqual(右.ElectronAsarIntegrity, { a: 'a' })
  delete 左.ElectronAsarIntegrity; delete 右.ElectronAsarIntegrity
  assert.equal(JSON.stringify(左), JSON.stringify(右))
})

test('属性值或数组顺序不同时拒绝修改两份属性文件', t => {
  const plist = require('plist')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-plist-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const x = path.join(root, 'x.plist'), a = path.join(root, 'a.plist')
  for (const [左, 右] of [[{ value: '旧' }, { value: '新' }], [{ list: ['甲', '乙'] }, { list: ['乙', '甲'] }]]) {
    const 原左 = plist.build(左), 原右 = plist.build(右)
    fs.writeFileSync(x, 原左); fs.writeFileSync(a, 原右)
    assert.throws(() => 规范属性(x, a), /不一致/)
    assert.equal(fs.readFileSync(x, 'utf8'), 原左); assert.equal(fs.readFileSync(a, 'utf8'), 原右)
  }
})

test('草稿下载权限只授予不检出代码的独立任务', () => {
  const yaml = require('js-yaml')
  const 流程 = yaml.load(fs.readFileSync(path.join(__dirname, '../.github/workflows/macos-universal-experiment.yml'), 'utf8'))
  const 下载 = 流程.jobs.fetch
  assert.equal(下载['runs-on'], 'ubuntu-latest')
  assert.equal(下载.permissions.contents, 'write')
  assert.equal(流程.permissions.contents, 'read')
  assert.equal(流程.jobs.merge.needs, 'fetch')
  assert.ok(下载.steps.every(step => !step.uses || step.uses === 'actions/upload-artifact@v4'))
  assert.ok(下载.steps.every(step => !step.run || !/checkout|npm|node |python |bash |\.\/scripts\//.test(step.run)))
  assert.ok(下载.steps.some(step => step.uses === 'actions/upload-artifact@v4'))
  assert.ok(流程.jobs.merge.steps.some(step => step.uses === 'actions/download-artifact@v4'))
  assert.ok(下载.steps.some(step => step.run?.includes('0a6637557f66f912d79f668bd40855722b1220f8508cff534b8b670c3695de80') && step.run?.includes('2d48f28992e721cd180e48ff0218142958b3238e315b46c78f57143420df8d16')))
})

test('只在隔离副本补齐两种原生模块并移除旧签名资源', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-universal-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const x = path.join(root, 'x64.app'), a = path.join(root, 'arm64.app')
  for (const [dir, arch] of [[x, 'x64'], [a, 'arm64']]) {
    const native = path.join(dir, `Contents/Resources/app.asar.unpacked/node_modules/@napi-rs/canvas-darwin-${arch}`)
    fs.mkdirSync(native, { recursive: true })
    fs.writeFileSync(path.join(native, `skia.darwin-${arch}.node`), arch)
    fs.mkdirSync(path.join(dir, 'Contents/_CodeSignature'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'Contents/_CodeSignature/CodeResources'), arch)
  }
  对齐副本(x, a)
  for (const dir of [x, a]) {
    for (const arch of ['x64', 'arm64']) assert.equal(fs.readFileSync(path.join(dir, `Contents/Resources/app.asar.unpacked/node_modules/@napi-rs/canvas-darwin-${arch}/skia.darwin-${arch}.node`), 'utf8'), arch)
    assert.equal(fs.existsSync(path.join(dir, 'Contents/_CodeSignature')), false)
  }
})

test('遇到已有目标文件拒绝覆盖', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-universal-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const x = path.join(root, 'x64.app'), a = path.join(root, 'arm64.app')
  for (const dir of [x, a]) for (const arch of ['x64', 'arm64']) {
    const native = path.join(dir, `Contents/Resources/app.asar.unpacked/node_modules/@napi-rs/canvas-darwin-${arch}`)
    fs.mkdirSync(native, { recursive: true })
    fs.writeFileSync(path.join(native, `skia.darwin-${arch}.node`), '已有文件')
  }
  assert.throws(() => 对齐副本(x, a), /已存在/)
})
