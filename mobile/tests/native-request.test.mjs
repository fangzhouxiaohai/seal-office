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

test('原生 HTTP 无回包会超时、解除等待并中止宿主；SSE 按活动续期，握手必须实际往返', async () => {
  const requests = [], previous = { window: globalThis.window, location: globalThis.location, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout }
  const timers = new Map(); let nextTimer = 0
  globalThis.window = { fetch: globalThis.fetch, sealNative: { token: 'test-token', platform: 'harmony' }, uni: { webView: { postMessage({ data }) { requests.push(data) } } } }
  globalThis.location = { search: '?native=1' }
  try {
    const bundle = await build({ entryPoints: [fileURLToPath(new URL('../web/native.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false })
    const native = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text + '\n//timeouts').toString('base64'))
    globalThis.setTimeout = (callback, ms) => { timers.set(++nextTimer, { callback, ms }); return nextTimer }
    globalThis.clearTimeout = timer => timers.delete(timer)
    const tick = ms => { for (const [id, timer] of [...timers]) if (timer.ms <= ms) { timers.delete(id); timer.callback() } }
    let busy = true
    const request = native.nativeFetch('https://example.test/api/v1/auth/sms').finally(() => { busy = false })
    const rejected = assert.rejects(request, /网络请求超时/), id = requests.at(-1).id
    assert.equal(busy, true); tick(70000); await rejected
    assert.equal(busy, false); assert.equal(timers.size, 0)
    assert.deepEqual(requests.at(-1), { id, action: 'abort', token: 'test-token' })
    assert.doesNotThrow(() => window.sealReceiveNative({ id, type: 'end', status: 200 }))
    const invalid = native.nativeFetch('https://example.test/offline')
    window.sealReceiveNative({ id: requests.at(-1).id, type: 'end', status: 0 })
    await assert.rejects(invalid, /status|range/i); assert.equal(timers.size, 0)
    const handshake = native.waitForNative()
    assert.equal(requests.at(-1).action, 'ping')
    window.sealReceiveNative({ id: requests.at(-1).id, type: 'ready' }); await handshake
    assert.equal(timers.size, 0)
    const missing = assert.rejects(native.waitForNative(), /原生接口连接超时/)
    tick(5000); await missing; assert.equal(timers.size, 0)
    const stream = native.nativeFetch('https://example.test/stream', { headers: { accept: 'text/event-stream' } })
    const streamId = requests.at(-1).id
    window.sealReceiveNative({ id: streamId, type: 'headers', status: 200 })
    const response = await stream, reader = response.body.getReader()
    assert.equal([...timers.values()][0].ms, 120000)
    window.sealReceiveNative({ id: streamId, type: 'chunk', data: 'YQ==' })
    assert.equal(new TextDecoder().decode((await reader.read()).value), 'a')
    const idle = assert.rejects(reader.read(), /网络请求超时/)
    tick(120000); await idle; assert.equal(timers.size, 0)
  } finally { Object.assign(globalThis, previous) }
})
