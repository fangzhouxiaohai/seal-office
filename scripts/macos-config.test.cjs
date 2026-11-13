const test = require('node:test')
const assert = require('node:assert/strict')
const config = require('../build/electron-macos.cjs')

test('Apple Silicon 测试包声明与架构兼容的最低系统版本', () => {
  assert.equal(config.mac.minimumSystemVersion, '11.0')
})
