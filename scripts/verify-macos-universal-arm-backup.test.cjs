const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const yaml = require('js-yaml')

const 工作流 = name => yaml.load(fs.readFileSync(path.join(__dirname, '../.github/workflows', name), 'utf8'))

test('备用复测使用官方 ARM 运行器并保持只读权限', () => {
  const flow = 工作流('macos-universal-arm-backup.yml')
  assert.deepEqual(flow.permissions, { contents: 'read', actions: 'read' })
  assert.deepEqual(Object.keys(flow.jobs), ['verify'])
  assert.equal(flow.jobs.verify['runs-on'], 'macos-26')
  assert.equal(flow.jobs.verify.env.EXPECTED_ARCH, 'arm64')
  assert.equal(flow.jobs.verify['timeout-minutes'], 60)
  assert.equal(flow.jobs.verify.permissions, undefined)
  assert.deepEqual(flow.on, { workflow_dispatch: null, push: { branches: ['codex/**'], paths: ['.github/workflows/macos-universal-arm-backup.yml'] } })
})

test('备用复测沿用原始固定产物和系统验收步骤', () => {
  const original = 工作流('macos-universal-retest.yml')
  const backup = 工作流('macos-universal-arm-backup.yml')
  const 系统步骤 = steps => steps.filter(step => step.name !== '检查验收脚本')
  assert.deepEqual(系统步骤(backup.jobs.verify.steps), 系统步骤(original.jobs.verify.steps))
  const artifact = backup.jobs.verify.steps.find(step => step.uses === 'actions/download-artifact@v4')
  assert.equal(String(artifact.with['artifact-ids']), '14067402093')
  assert.equal(String(artifact.with['run-id']), '43485198435')
  assert.equal(artifact.with.repository, 'fangzhouxiaohai/seal-office')
  const commands = backup.jobs.verify.steps.map(step => step.run || '').join('\n')
  for (const expected of ['467583156', 'ee5239b483c4823016eee38f8902d60e552b196a45d72a3c190d0a244eacd256', 'hdiutil verify', 'codesign --verify --deep --strict', 'verify-macos-candidate.cjs', 'verify-macos-universal.cjs --canvas', 'soffice --version']) assert.ok(commands.includes(expected), expected)
  assert.doesNotMatch(commands, /gh\s+release|git\s+push|release-assets/)
})

test('备用复测逐文件直接运行全部验收测试并保留隔离进程', () => {
  const 脚本 = ['verify-macos-candidate.test.cjs', 'verify-macos-universal.test.cjs', 'verify-macos-universal-retest.test.cjs']
  const 步骤 = 工作流('macos-universal-arm-backup.yml').jobs.verify.steps.find(step => step.name === '检查验收脚本')
  assert.ok(步骤)
  assert.deepEqual(步骤.run.trim().split('\n'), 脚本.map(名称 => `node scripts/${名称}`))
})
