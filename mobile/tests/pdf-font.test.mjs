import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { buildCore } from '../scripts/core-build.mjs'

const require = createRequire(import.meta.url), root = fileURLToPath(new URL('../../', import.meta.url))
const { PDFDocument } = require('pdf-lib'), desktop = require('../../main/pdf/pdfTools.js')
const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'seal-pdf-core-test-'))
const coreFile = path.join(outputDirectory, 'core.mjs')
after(async () => { await fs.unlink(coreFile); await fs.rmdir(outputDirectory) })
await buildCore(coreFile)
// Bundle the real adapter and font loader, retaining the installed libraries.
// The test runs the generated browser core, not a second implementation of it.
const compiled = await build({ entryPoints: [fileURLToPath(new URL('../web/exports.ts', import.meta.url))], write: false, bundle: true, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent' })
function adapter() {
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, module, module.exports)
  return module.exports
}
async function pixels(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { createCanvas } = require('@napi-rs/canvas')
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false })
  try {
    const page = await (await task.promise).getPage(1), viewport = page.getViewport({ scale: 1 })
    const canvas = createCanvas(viewport.width, viewport.height), context = canvas.getContext('2d')
    await page.render({ canvasContext: context, viewport, intent: 'print' }).promise
    const text = (await page.getTextContent()).items.map(item => item.str || '').join('')
    assert.equal(text, '中文𠮷 é下一行 ABC 123')
    return Buffer.from(context.getImageData(0, 0, canvas.width, canvas.height).data)
  } finally { await task.destroy() }
}

for (const protocol of ['https:', 'file:']) test(`真实 browser core + PDF adapter（${protocol} 字体加载）写出与桌面像素相同、缺字拒绝`, async () => {
  const keys = ['window', 'document', 'location', 'fetch', 'XMLHttpRequest', 'sealBrowserPdfFont'], saved = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const requested = []
  const read = async url => {
    const name = new URL(url, 'https://seal.test/').pathname.split('/').pop()
    assert.ok(['NotoSansSC.ttf', 'NotoSerifCJKsc-Regular.otf'].includes(name))
    requested.push(name)
    const bytes = await fs.readFile(path.join(root, 'mobile/web/public/fonts', name))
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  }
  try {
    globalThis.window = globalThis
    globalThis.document = { baseURI: 'file:///seal/office/index.html' }
    globalThis.location = { protocol }
    globalThis.fetch = async url => new Response(await read(url), { status: 200 })
    globalThis.XMLHttpRequest = class {
      open(_method, url) { this.url = url }
      send() { read(this.url).then(bytes => { this.response = bytes; this.status = 0; this.onload() }, error => this.onerror(error)) }
    }
    const { default: core } = await import(pathToFileURL(coreFile).href)
    const handlers = new Map()
    await adapter().installExportAdapters(core, async () => {}, (name, fn) => handlers.set(name, fn))
    const document = await PDFDocument.create()
    document.addPage([400, 150])
    const original = Buffer.from(await document.save()), before = Buffer.from(original)
    const operation = { 类型: 'text', 页码: 1, x: 20, y: 20, 字号: 18, 文字: '中文𠮷 e\u0301\n下一行 ABC 123' }
    const result = await handlers.get('pdf.editPage')(original.toString('base64'), operation)
    assert.equal(result.成功, true)
    assert.deepEqual([...new Set(requested)].sort(), ['NotoSansSC.ttf', 'NotoSerifCJKsc-Regular.otf'].sort())
    const edited = Buffer.from(result.数据, 'base64'), expected = await desktop.编辑页面(original, operation)
    assert.ok(edited.length < 100000)
    assert.deepEqual(await pixels(edited), await pixels(expected))
    for (const [text, error] of [['🦭', /U\+1F9AD.*未修改原 PDF/], ['العربية', /从右向左.*未修改原 PDF/]]) {
      await assert.rejects(handlers.get('pdf.editPage')(original.toString('base64'), { ...operation, 类型: 'replace', 宽: 200, 高: 50, 文字: text }), error)
      assert.deepEqual(original, before)
    }
  } finally {
    for (const key of keys) {
      const descriptor = saved.get(key)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})
