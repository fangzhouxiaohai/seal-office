const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { 是构建文件, 生成构建清单 } = require('./generate-integrity.cjs')

test('清单只记录实际打包的主进程文件与页面文件', () => {
  const 根目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'seal-office-package-'))
  try {
    const 文件 = [
      'main/main.js',
      'main/preload.js',
      'main/ipc/index.js',
      'main/office/docxReader.js',
      'main/ai/assistant.js',
      'main/main.test.js',
      'main/office/docxReader.spec.js',
      'main/main-test.js',
      'main/integrity-manifest.json',
      'main/pdf/node_modules/.vitest/cache/package.json',
      'dist/index.html',
    ]
    for (const 相对路径 of 文件) {
      const 目标 = path.join(根目录, ...相对路径.split('/'))
      fs.mkdirSync(path.dirname(目标), { recursive: true })
      fs.writeFileSync(目标, 相对路径)
    }
    const 清单 = 生成构建清单(根目录)
    assert.deepEqual(清单.文件.map((条目) => 条目.路径), [
      'dist/index.html',
      'main/ai/assistant.js',
      'main/ipc/index.js',
      'main/main.js',
      'main/office/docxReader.js',
      'main/preload.js',
    ])
  } finally {
    fs.rmSync(根目录, { recursive: true, force: true })
  }
})

test('清单排除规则与 Windows 打包配置同步', () => {
  const 配置 = require('../package.json')
  assert.deepEqual(配置.build.files, [
    'main/**/*',
    'dist/**/*',
    'package.json',
    '!main/**/*.test.js',
    '!main/**/*.spec.js',
    '!main/main-test.js',
    '!main/**/node_modules/**',
    '!main/**/.vitest/**',
  ])
  for (const 路径 of [
    'main/main.js',
    'main/preload.js',
    'main/ipc/index.js',
    'main/office/docxReader.js',
    'dist/index.html',
  ]) assert.equal(是构建文件(路径), true, 路径)
  for (const 路径 of [
    'main/main.test.js',
    'main/ipc/fileChannel.spec.js',
    'main/main-test.js',
    'main/pdf/node_modules/.vitest/cache/package.json',
    'main/pdf/.vitest/cache/package.json',
  ]) assert.equal(是构建文件(路径), false, 路径)
})
