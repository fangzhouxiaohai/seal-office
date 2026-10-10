import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

test('原生 SSE 在首块到达时交给阅读器，中止同步到宿主', async () => {
  const requests = [], previousWindow = globalThis.window
  globalThis.window = { fetch: globalThis.fetch, sealNative: { token: 'test-token', platform: 'android' }, uni: { webView: { postMessage({ data }) { requests.push(data) } } } }
  try {
    const bundle = await build({ entryPoints: [fileURLToPath(new URL('../web/native.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false })
    const module = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
    const controller = new AbortController()
    const request = module.nativeFetch('https://example.test/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stream: true }), signal: controller.signal })
    assert.equal(requests[0].stream, true)
    assert.equal(requests[0].token, 'test-token')
    const id = requests[0].id
    window.sealReceiveNative({ id, type: 'headers', status: 200, headers: { 'content-type': 'text/event-stream' } })
    const response = await request, reader = response.body.getReader()
    window.sealReceiveNative({ id, type: 'chunk', data: Buffer.from('data: 中文\n\n').toString('base64') })
    const chunk = await reader.read()
    assert.equal(new TextDecoder().decode(chunk.value), 'data: 中文\n\n')
    controller.abort()
    assert.equal(requests.at(-1).action, 'abort')
    assert.equal(requests.at(-1).id, id)
    await assert.rejects(reader.read(), { name: 'AbortError' })
    // 清理后的迟到分块不会再次触发阅读器。
    assert.doesNotThrow(() => window.sealReceiveNative({ id, type: 'chunk', data: 'YQ==' }))
  } finally { globalThis.window = previousWindow }
})
