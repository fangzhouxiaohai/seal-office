const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { 对齐副本, 规范属性, 校验完整性 } = require('./verify-macos-universal.cjs')

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
  assert.ok(下载.steps.some(step => step.run?.includes('60ba1e86ab11833c07033087c82ed2374ab1181687545c0c9cc90257e0ebe53e') && step.run?.includes('ba2d413092f604d58a6de671e44d4788b6ceac15ff9ea2c85ebf01173f22d2c3')))
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
