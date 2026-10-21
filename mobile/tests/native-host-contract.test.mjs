import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import { build, transform } from 'esbuild'
import { fileURLToPath } from 'node:url'

// These are native API contract tests, not Harmony device acceptance. Run the
// shipped uni.webview SDK against host code with isolated picker/FS/HTTP adapters.
function platformSource(source, platform) {
  const enabled = new Set(['APP', 'APP-' + platform.toUpperCase()]), stack = [true]
  return source.split('\n').filter(line => {
    const marker = line.match(/^\s*\/\/ #(ifdef|ifndef|endif)(?:\s+([A-Z-]+))?/)
    if (!marker) return stack.at(-1)
    if (marker[1] === 'endif') stack.pop()
    else stack.push(stack.at(-1) && (marker[1] === 'ifdef' ? enabled.has(marker[2]) : !enabled.has(marker[2])))
    return false
  }).join('\n').replace(/^import .*$/gm, '')
}
async function importSource(source) {
  const compiled = await transform(source, { loader: 'ts', format: 'esm' })
  return import('data:text/javascript;base64,' + Buffer.from(compiled.code + '\n//' + Math.random()).toString('base64'))
}
const read = name => fs.readFile(new URL(name, import.meta.url), 'utf8')
const hostSource = (await read('../pages/workspace/workspace.uvue')).match(/<script lang="uts">([\s\S]*?)<\/script>/)[1]
const utilitySource = await read('../native/workspace.uts'), exportSource = await read('../native/export.uts')

test('Harmony plain JSON / Android UTS 对象消息均分发；空消息、伪令牌不会触发系统 API，系统异常明确回复', async () => {
  const utility = await importSource(platformSource(utilitySource, 'harmony'))
  const options = (await importSource(platformSource(hostSource, 'harmony'))).default
  const keys = ['messageString', 'messageBoolean', 'messageNumber', 'uni']
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]))
  const replies = [], actions = []
  try {
    for (const key of keys.slice(0, 3)) globalThis[key] = utility[key]
    const host = Object.assign(options.data(), options.methods, {
      reply: event => replies.push(event), pickFiles: (...args) => actions.push(['pick', ...args]),
      save: (...args) => actions.push(['save', ...args]), request: (...args) => actions.push(['request', ...args]),
    })
    class AndroidUTSObject {
      constructor(value) { Object.assign(this, value) }
      getString(key) { return this[key] ?? null }
      getBoolean(key) { return this[key] ?? null }
      getNumber(key) { return this[key] ?? null }
    }
    host.onMessage({ detail: { data: [] } })
    host.onMessage({ detail: { data: [null, undefined, {}, [], { token: 'wrong', id: 'fake', action: 'pick-files' }] } })
    assert.equal(actions.length, 0)
    for (const wrap of [value => JSON.parse(JSON.stringify(value)), value => new AndroidUTSObject(value)]) {
      const send = data => host.onMessage({ detail: { data: [wrap({ token: host.token, ...data })] } })
      send({ action: 'state', atHome: false, unsaved: 3 })
      assert.equal(host.atHome, false); assert.equal(host.unsaved, 3); assert.equal(host.workspaceReady, true)
      send({ id: 'picker', action: 'pick-files', multiple: true })
      assert.deepEqual(actions.at(-1), ['pick', 'picker', true])
      send({ id: 'save', action: 'save', name: '中文.sldoc', data: 'YQ==' })
      assert.equal(actions.at(-1)[0], 'save')
      send({ id: 'sms', action: 'request', url: 'https://example.test/sms' })
      assert.equal(actions.at(-1)[0], 'request')
      send({ id: 'ping', action: 'ping' }); assert.deepEqual(replies.at(-1), { id: 'ping', type: 'ready' })
      host.pickFiles = () => { throw new Error('native picker failure') }
      send({ id: 'failed', action: 'pick-files' }); assert.equal(replies.at(-1).type, 'error'); assert.match(replies.at(-1).error, /系统操作/)
      host.pickFiles = (...args) => actions.push(['pick', ...args])
      send({ id: 'unknown', action: 'unsupported' }); assert.equal(replies.at(-1).type, 'error')
    }
    host.onMessage({ detail: { data: [{ token: host.token, action: 'state', atHome: 'yes', unsaved: '3' }] } })
    assert.equal(host.atHome, false); assert.equal(host.unsaved, 0)
  } finally { Object.assign(globalThis, previous) }
})

test('实际 uni.webview SDK → Harmony 宿主 → 系统选择/持久保存：四个新格式及旧格式字节不变，HTTP短信链无真实发送', async () => {
  const keys = ['window', 'uni', 'messageString', 'messageBoolean', 'messageNumber', 'onUIThread', 'isWorkspaceDocument', 'UTSHarmony', 'picker', 'fileIo', 'exportDocument', 'printDocument']
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]))
  const stored = new Map(), pickerOptions = [], requests = [], scripts = [], errors = [], frames = []
  let pickerResolve, httpResponse, host, webWindow, serial = 0
  const names = ['中文𠀋🦭.sldoc', '公式.slxls', '演示.slppt', '批注.spdf', '旧文字.sealdoc', '旧表格.sealsheet', '旧演示.sealshow']
  const bytes = names.map((name, index) => new Uint8Array([0, 255, index, ...Buffer.from(name + '\n中文𠀋🦭')]))
  try {
    const utility = await importSource(platformSource(utilitySource, 'harmony'))
    for (const key of ['messageString', 'messageBoolean', 'messageNumber', 'isWorkspaceDocument']) globalThis[key] = utility[key]
    globalThis.onUIThread = callback => callback()
    globalThis.UTSHarmony = { getUIAbilityContext: () => ({ cacheDir: '/private/cache' }) }
    globalThis.picker = { DocumentViewPicker: class { save(options) { pickerOptions.push(options); return new Promise(resolve => { pickerResolve = resolve }) } } }
    globalThis.fileIo = { OpenMode: { READ_WRITE: 2, CREATE: 64, TRUNC: 512 },
      openSync: uri => ({ fd: uri }), closeSync: () => {}, copyFileSync: (source, destination) => stored.set(destination, new Uint8Array(stored.get(source))) }
    const exporter = await importSource(platformSource(exportSource, 'harmony'))
    globalThis.exportDocument = exporter.exportDocument; globalThis.printDocument = exporter.printDocument
    globalThis.uni = {
      env: { USER_DATA_PATH: '/private/data' },
      base64ToArrayBuffer: data => Uint8Array.from(Buffer.from(data, 'base64')).buffer,
      arrayBufferToBase64: data => Buffer.from(data).toString('base64'),
      createWebViewContext: () => ({ evalJS: script => { scripts.push(script); vm.runInNewContext(script, { window: webWindow }) } }),
      chooseFile: options => { assert.equal(options.type, 'all'); assert.equal(options.count, 20); options.success({ tempFiles: names.map((name, index) => ({ name, size: bytes[index].length, path: '/import/' + index })) }) },
      getFileSystemManager: () => ({
        readFile: options => options.success({ data: Buffer.from(stored.get(options.filePath)).toString('base64') }),
        writeFile: options => { assert.equal(options.encoding, 'base64'); stored.set(options.filePath, new Uint8Array(Buffer.from(options.data, 'base64'))); options.success({}) },
      }),
      request: options => { requests.push(options); httpResponse = options; return { abort: () => { errors.push('abort') }, onHeadersReceived: () => {}, onChunkReceived: () => {} } },
    }
    for (let index = 0; index < names.length; index++) stored.set('/import/' + index, bytes[index])
    const page = (await importSource(platformSource(hostSource, 'harmony'))).default
    host = Object.assign(page.data(), page.methods)
    // This proxy reproduces the exact JSON.parse(...).data dispatch in the
    // installed Harmony SDK's WebView.ets; no UTSJSONObject methods are added.
    webWindow = { fetch: globalThis.fetch, addEventListener() {}, sealNative: { token: host.token, platform: 'harmony' },
      __uniapp_x_: { postMessage: value => { const data = JSON.parse(value).data ?? ''; frames.push(data); host.onMessage({ detail: { data: [data] } }) } } }
    const sdkContext = { window: webWindow, navigator: { userAgent: 'uni-app OpenHarmony' }, document: { addEventListener() {}, dispatchEvent() {}, readyState: 'complete' }, CustomEvent: class {} }
    vm.runInNewContext(await read('../web/public/uni.webview.js'), sdkContext)
    webWindow.uni = sdkContext.uni
    assert.equal(typeof webWindow.uni.webView.postMessage, 'function')
    globalThis.window = webWindow
    const compiled = await build({ entryPoints: [fileURLToPath(new URL('../web/native.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false })
    const bridge = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text + '\n//host-contract').toString('base64'))
    const files = await bridge.pickNativeFiles(true)
    assert.deepEqual(files.map(file => file.name), names)
    for (let index = 0; index < files.length; index++) {
      assert.deepEqual(new Uint8Array(await files[index].arrayBuffer()), bytes[index])
      const saving = bridge.downloadFile(files[index].name, bytes[index])
      assert.equal(frames.at(-1).mime, ['application/vnd.seal-office.word', 'application/vnd.seal-office.sheet', 'application/vnd.seal-office.presentation', 'application/vnd.seal-office.pdf', 'application/vnd.seal-office.word', 'application/vnd.seal-office.sheet', 'application/vnd.seal-office.presentation'][index])
      assert.deepEqual(pickerOptions.at(-1).newFileNames, [names[index]])
      const destination = 'file://persisted/' + serial++ + '/' + names[index]
      pickerResolve([destination]); await saving
      assert.deepEqual(stored.get(destination), bytes[index])
    }
    const cancelled = bridge.downloadFile('取消.spdf', bytes[0]); pickerResolve([])
    await assert.rejects(cancelled, { name: 'AbortError' })
    const sms = bridge.nativeFetch('https://example.test/api/v1/auth/sms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: 'test-not-a-real-number' }) })
    assert.equal(requests.length, 1); assert.equal(httpResponse.timeout, 60000)
    assert.equal(httpResponse.method, 'POST'); assert.equal(httpResponse.header['content-type'], 'application/json')
    assert.deepEqual(JSON.parse(Buffer.from(httpResponse.data).toString()), { phone: 'test-not-a-real-number' })
    const body = Buffer.from(JSON.stringify({ error: '模拟短信限流，请稍后重试' }))
    httpResponse.success({ statusCode: 429, header: { 'content-type': 'application/json' }, data: Uint8Array.from(body).buffer })
    httpResponse.complete({})
    const response = await sms; assert.equal(response.status, 429); assert.match(await response.text(), /模拟短信限流/)
    const offline = bridge.nativeFetch('https://example.test/api/v1/auth/sms')
    httpResponse.fail({ errMsg: 'connection refused' }); httpResponse.complete({})
    await assert.rejects(offline, /网络请求失败.*connection refused/)
    assert.equal(host.tasks.size, 0); assert.equal(errors.length, 0); assert.ok(scripts.length > 20)
  } finally { Object.assign(globalThis, previous) }
})
