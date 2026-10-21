import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { inlineMarketImages } from '../../scripts/inline-image-plugin.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url)), require = createRequire(import.meta.url)
const { 写入pptx, 读取pptx } = require('../../main/office/pptxCodec.js')
const mobileImages = path.join(root, 'mobile/assets/template-images')
const sha = value => createHash('sha256').update(value).digest('hex')
test('mobile template derivatives retain matching fingerprints, MIME and bytes through PPTX save/reopen; desktop keeps originals', async () => {
  const records = JSON.parse(fs.readFileSync(path.join(mobileImages, 'manifest.json')))
  assert.equal(records.length, 12)
  const entries = []
  for (const record of records) {
    const original = path.join(root, record.source), group = path.basename(path.dirname(original))
    const plugin = inlineMarketImages({ mobileImages })
    const metaPath = plugin.resolveId('./metadata.json', original)
    const meta = JSON.parse(fs.readFileSync(metaPath))[path.basename(original, '.png')]
    const url = JSON.parse(plugin.load(original + '?seal-image').slice('export default '.length))
    const bytes = Buffer.from(url.split(',')[1], 'base64'), mime = url.slice(5, url.indexOf(';'))
    assert.equal(sha(fs.readFileSync(original)), record.sourceSha256)
    assert.equal(sha(bytes), record.sha256)
    assert.equal(meta.id, sha(bytes)); assert.equal(meta.bytes, bytes.length); assert.equal(meta.type, mime)
    assert.deepEqual([meta.width, meta.height], record.size)
    assert.ok(url.startsWith(group === 'market' ? 'data:image/png;' : 'data:image/jpeg;'))
    const desktop = JSON.parse(inlineMarketImages().load(original + '?seal-image').slice('export default '.length))
    assert.equal(sha(Buffer.from(desktop.split(',')[1], 'base64')), record.sourceSha256)
    entries.push({ 标识: meta.id, 类型: mime, 数据: bytes.toString('base64') })
  }
  const slides = entries.map((entry, i) => ({ id: String(i), 对象列表: [{ id: 'picture-' + i, 类型: '图片', x: 10, y: 10, width: 500, height: 300, 资源标识: entry.标识 }] }))
  const reopened = await 读取pptx(await 写入pptx({ 页面尺寸: { 宽: 960, 高: 540 }, 幻灯片: slides, 资源条目: entries }))
  for (const entry of entries) assert.deepEqual(reopened.资源条目.find(resource => resource.标识 === entry.标识), entry)
  assert.equal(reopened.演示文稿.幻灯片列表.length, 12)
})
