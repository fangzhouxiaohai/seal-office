import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

test('安卓文件提供方未识别 MIME 时按扩展名验证，分享保留 Office MIME', async () => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../web/fileTypes.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false })
  const files = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
  assert.doesNotThrow(() => files.validateImport('中文文档.MD', '.docx,.txt,.md'))
  assert.doesNotThrow(() => files.validateImport('季度.报告.DOCX', '.docx,.txt,.md'))
  assert.throws(() => files.validateImport('报告.docx.exe', '.docx,.txt,.md'), /此入口支持/)
  assert.throws(() => files.validateImport('无扩展名', '.docx,.txt,.md'))
  assert.equal(files.exportMime('报告.DOCX'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  assert.equal(files.exportMime('预算.xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  assert.equal(files.exportMime('打印.pdf'), 'application/pdf')
})
