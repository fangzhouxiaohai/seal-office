const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const yaml = require('js-yaml')

const workflow = () => yaml.load(fs.readFileSync(path.join(__dirname, '../.github/workflows/macos-universal-e2652a.yml'), 'utf8'))

test('新候选使用独立固定来源，草稿读取权限仅给不检出源码的作业', () => {
  const flow = workflow()
  assert.deepEqual(flow.permissions, { contents: 'read' })
  assert.deepEqual(flow.on, { workflow_dispatch: null, push: { branches: ['codex/macos-e2652a-ci-20261114'], paths: ['.github/workflows/macos-universal-e2652a.yml'] } })
  assert.deepEqual(flow.jobs.fetch.permissions, { contents: 'write' })
  assert.ok(flow.jobs.fetch.steps.every(step => !step.uses || step.uses === 'actions/upload-artifact@v4'))
  const source = flow.jobs.fetch.steps.map(step => step.run || '').join('\n')
  assert.doesNotMatch(source, /checkout|npm|node |git |python |bash |\.\/scripts\//)
  for (const value of ['/releases/assets/745063533', '/releases/assets/745065805', '813c2c981db0959e50c5bdb2e0328bcd161d04338f974baae0066f6668be5751', 'bd93c4aeaea72ddbed8e5bfed13e360df03c7aa6b529b0f24c5c2d74dc2fb27f', '229986587', '236536593']) assert.ok(source.includes(value), value)
  assert.doesNotMatch(source, /--location-trusted|__ARM_ASSET_ID__|__X64_ASSET_ID__/)
  assert.equal((source.match(/https:\/\/api\.github\.com\/repos\/fangzhouxiaohai\/seal-office\/releases\/assets\/\d+/g) || []).length, 2)
  assert.equal(flow.jobs.merge.needs, 'fetch')
  assert.equal(flow.jobs.verify.needs, 'merge')
})

test('合并后对相同新产物在两种原生架构执行实际系统与应用验收', () => {
  const flow = workflow(), verify = flow.jobs.verify
  assert.deepEqual(verify.strategy.matrix.include, [{runner:'macos-26',arch:'arm64'}, {runner:'macos-15-intel',arch:'x86_64'}])
  assert.ok(verify.steps.some(step => step.uses === 'actions/download-artifact@v4' && step.with.name === 'macos-e2652a-universal-test-only'))
  const all = [...flow.jobs.merge.steps, ...verify.steps].map(step => step.run || '').join('\n')
  for (const value of ['codesign --verify --deep --strict', 'lipo ', 'hdiutil verify', '校验完整性', 'verify-macos-candidate.cjs', 'verify-macos-universal.cjs --canvas']) assert.ok(all.includes(value), value)
  assert.doesNotMatch(all, /gh\s+release|git\s+push|\/admin\/release-assets/)
})
