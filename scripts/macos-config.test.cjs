const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const config = require('../build/electron-macos.cjs')

test('Apple Silicon 测试包声明与架构兼容的最低系统版本', () => {
  assert.equal(config.mac.minimumSystemVersion, '11.0')
})

test('苹果云端构建配置足够的 JavaScript 堆空间', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/macos-test.yml'), 'utf8')
  assert.match(workflow, /NODE_OPTIONS:\s*['"]?--max-old-space-size=4096/)
})

test('苹果通用更新包来自同一次构建，两个架构复验同一份封装成品', () => {
  const workflow = require('js-yaml').load(fs.readFileSync(path.join(__dirname, '../.github/workflows/macos-test.yml'), 'utf8'))
  const 合并 = workflow.jobs['merge-universal'], 复验 = workflow.jobs['verify-universal']
  assert.ok(合并 && 复验, '缺少通用包合并或双架构复验')
  assert.equal(合并.needs, 'build-and-test')
  const 来源 = 合并.steps.find(step => step.uses === 'actions/download-artifact@v4').with
  assert.equal(来源.pattern, 'macos-*-test-only')
  assert.equal(来源['run-id'], undefined)
  assert.equal(复验.needs, 'merge-universal')
  assert.equal(复验.steps.find(step => step.uses === 'actions/download-artifact@v4').with.name,
    合并.steps.find(step => step.uses === 'actions/upload-artifact@v4').with.name)
  assert.deepEqual(复验.strategy.matrix.include.map(项 => 项.machine).sort(), ['arm64', 'x86_64'])
  const 步骤 = 复验.steps.map(step => step.run || '').join('\n')
  for (const 校验 of ['shasum -a 256 -c', 'hdiutil verify', 'codesign --verify --deep --strict', 'lipo ', 'verify-macos-candidate.cjs', 'verify-macos-universal.cjs --canvas']) assert.ok(步骤.includes(校验), 校验)
})
