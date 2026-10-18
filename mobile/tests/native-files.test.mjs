import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

test('鸿蒙文件选择分块、取消、残缺响应及保存/打印的宿主确认', async () => {
  const previous = globalThis.window, messages = []
  globalThis.window = { fetch: globalThis.fetch, sealNative: { token: 'test-only', platform: 'harmony' }, uni: { webView: { postMessage: ({ data }) => messages.push(data) } } }
  try {
    const result = await build({ entryPoints: [fileURLToPath(new URL('../web/native.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false })
    const native = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
    const reply = (type, extra = {}) => window.sealReceiveNative({ id: messages.at(-1).id, type, ...extra })
    const picked = native.pickNativeFiles(true)
    assert.equal(messages.at(-1).action, 'pick-files')
    for (const name of ['中文.pdf', '数据.xlsx']) {
      reply('file-start', { name }); reply('chunk', { data: Buffer.from('数据').toString('base64') }); reply('file-end')
    }
    reply('end')
    const files = await picked
    assert.deepEqual(files.map(file => file.name), ['中文.pdf', '数据.xlsx'])
    assert.equal(await files[0].text(), '数据')
    const cancelled = native.pickNativeFiles(false); reply('cancel'); assert.deepEqual(await cancelled, [])
    const incomplete = native.pickNativeFiles(false); reply('file-start', { name: '残缺.pdf' }); reply('end')
    await assert.rejects(incomplete, /未完成/)
    const wrongOrder = native.pickNativeFiles(false); reply('chunk', { data: 'YQ==' }); await assert.rejects(wrongOrder, /尚未开始/)
    let saved = false
    const saving = native.downloadFile('文档.pdf', new Uint8Array([37,80,68,70])).then(() => { saved = true })
    assert.equal(messages.at(-1).action, 'save'); await Promise.resolve(); assert.equal(saved, false)
    reply('saved', { path: 'file://selected/document.pdf' }); await saving; assert.equal(saved, true)
    const cancelSave = native.downloadFile('取消.pdf', new Uint8Array([1])); reply('cancel'); await assert.rejects(cancelSave, { name: 'AbortError' })
    const printing = native.downloadFile('打印.pdf', new Uint8Array([1]), 'application/pdf', 'print')
    assert.equal(messages.at(-1).action, 'print'); reply('printed'); await printing
    const copying = native.writeNativeClipboard('中文与换行\n第二行')
    assert.equal(messages.at(-1).action, 'clipboard-write'); assert.equal(messages.at(-1).text, '中文与换行\n第二行'); reply('written'); await copying
  } finally { globalThis.window = previous }
})
