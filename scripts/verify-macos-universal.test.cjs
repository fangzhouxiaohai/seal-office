const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { 对齐副本 } = require('./verify-macos-universal.cjs')

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
