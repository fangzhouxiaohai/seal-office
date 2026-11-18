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
