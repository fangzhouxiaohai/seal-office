import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

test('移动更新通过原生宿主接收进度、结果及取消响应', async () => {
  const previous = globalThis.window, messages = [], events = new Map()
  globalThis.window = { fetch: globalThis.fetch, sealNative: { token: 'isolated-token', platform: 'android' },
    uni: { webView: { postMessage: ({data}) => messages.push(data) } },
    addEventListener: (name, cb) => events.set(name, cb), removeEventListener: name => events.delete(name) }
  try {
    const compiled = await build({ entryPoints: [fileURLToPath(new URL('../web/native.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false })
    const api = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text + '\n//update-test').toString('base64'))
    const updates = [], stop = api.onNativeUpdate(value => updates.push(value))
    events.get('seal-native-update')({ detail: { 阶段: '下载中', 已下载: 4, 总大小: 10 } })
    assert.equal(updates[0].已下载, 4)
    const pending = api.nativeUpdate('update-download', { release: { version: '2.8.0' }, base: 'https://example.com/api' })
    assert.equal(messages.at(-1).action, 'update-download'); assert.equal(messages.at(-1).token, 'isolated-token')
    window.sealReceiveNative({ id: messages.at(-1).id, type: 'update-result', value: { 成功: true, 数据: { 阶段: '已就绪' } } })
    assert.equal((await pending).数据.阶段, '已就绪')
    const cancel = api.nativeUpdate('update-cancel')
    window.sealReceiveNative({ id: messages.at(-1).id, type: 'update-result', value: { 成功: true, 数据: { 阶段: '已取消' } } })
    assert.equal((await cancel).数据.阶段, '已取消')
    stop(); assert.equal(events.has('seal-native-update'), false)
  } finally { globalThis.window = previous }
})

test('安卓更新接口复用云服务地址并完整暴露统一契约', async () => {
  const compiled = await build({ entryPoints: [fileURLToPath(new URL('../web/update.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false })
  const api = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'))
  const calls = [], cloud = { status: () => ({ url: 'https://seal.example/api' }), request: async () => ({ hasUpdate: false }) }
  const adapter = api.createNativeUpdateApi('android', '2.7.2', cloud, async (action, data) => { calls.push({action,data}); return { 成功:true, 数据:{阶段:'空闲'} } }, () => () => {})
  assert.equal((await adapter.info()).平台, 'android')
  await adapter.download({ version:'2.8.0' })
  assert.equal(calls[0].action, 'update-download');assert.equal(calls[0].data.base, 'https://seal.example/api')
  await adapter.status();await adapter.cancel();await adapter.installReady()
  assert.deepEqual(calls.map(item => item.action), ['update-download','update-status','update-cancel','update-install'])
})

test('鸿蒙更新交给应用市场，不能伪造下载或安装进度', async () => {
  const compiled = await build({ entryPoints: [fileURLToPath(new URL('../web/update.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false })
  const api = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'))
  const calls = [], cloud = { status: () => ({ url: 'https://seal.example/api' }), request: async () => ({ hasUpdate: true, version: '2.8.0' }) }
  const adapter = api.createHarmonyStoreUpdateApi('2.7.2', cloud, async action => { calls.push(action); return { 成功:true, 数据:{已显示:true} } })
  assert.equal((await adapter.info()).平台, 'harmony')
  assert.equal((await adapter.check()).数据.version, '2.8.0')
  assert.equal((await adapter.openStore()).数据.已显示, true)
  assert.deepEqual(calls, ['update-store-open'])
  assert.equal(adapter.download, undefined)
})

test('鸿蒙工作源码和交付宿主均通过应用市场检查并显示更新窗口', async () => {
  const { readFile } = await import('node:fs/promises')
  const work = await readFile(new URL('../pages/workspace/workspace.uvue', import.meta.url), 'utf8')
  const shipped = await readFile(new URL('../../harmony-mobile/pages/workspace/workspace.uvue', import.meta.url), 'utf8')
  assert.equal(shipped, work, '鸿蒙交付宿主必须同步工作源码')
  for (const source of [work, shipped]) {
    assert.match(source, /import \{ updateManager \} from '@kit\.AppGalleryKit'/)
    assert.match(source, /action == 'update-store-open'\) this\.openHarmonyStoreUpdate\(id\)/)
    assert.match(source, /updateManager\.checkAppUpdate\(context\)/)
    assert.match(source, /updateManager\.showUpdateDialog\(context\)/)
    assert.match(source, /已显示: true/)
  }
})

test('鸿蒙市场不可用或取消调用时返回真实失败信息，不伪报已完成', async () => {
  const compiled = await build({ entryPoints: [fileURLToPath(new URL('../web/update.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false })
  const api = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'))
  const cloud = { request: async () => ({ hasUpdate: true }) }
  const failed = api.createHarmonyStoreUpdateApi('2.7.2', cloud, async () => ({ 成功: false, 错误: '华为应用市场暂未发现可更新版本，请稍后再试' }))
  assert.deepEqual(await failed.openStore(), { 成功: false, 错误: '华为应用市场暂未发现可更新版本，请稍后再试' })
  const unavailable = api.createHarmonyStoreUpdateApi('2.7.2', cloud, async () => { throw new Error('原生接口不可用') })
  assert.deepEqual(await unavailable.openStore(), { 成功: false, 错误: '原生接口不可用' })
})

test('下载请求及时确认后，原生进度、失败和取消事件继续独立送达', async () => {
  const compiled = await build({ entryPoints: [fileURLToPath(new URL('../web/native.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false })
  const previousWindow = globalThis.window
  const messages = [], listeners = new Map(), states = []
  globalThis.window = { fetch: globalThis.fetch, sealNative: { token: 'isolated-token', platform: 'android' },
    uni: { webView: { postMessage: ({data}) => messages.push(data) } },
    addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) }
  try {
    const api = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text + '\n//async-update-test').toString('base64'))
    const stop = api.onNativeUpdate(state => states.push(state))
    const download = api.nativeUpdate('update-download', { release: { version: '2.8.0' } })
    window.sealReceiveNative({ id: messages.at(-1).id, type: 'update-result', value: { 成功: true, 数据: { 阶段: '下载中', 已下载: 0, 总大小: 100, 任务标识: 'task-1' } } })
    assert.equal((await download).数据.阶段, '下载中')
    for (const state of [{ 阶段: '下载中', 已下载: 50, 总大小: 100, 任务标识: 'task-1' },
      { 阶段: '失败', 已下载: 0, 总大小: 100, 任务标识: 'task-1', 错误: '网络连接中断' },
      { 阶段: '已取消', 已下载: 0, 总大小: 0, 任务标识: 'task-1' }]) listeners.get('seal-native-update')({ detail: state })
    assert.deepEqual(states.map(state => state.阶段), ['下载中', '失败', '已取消'])
    assert.equal(states[1].错误, '网络连接中断')
    stop()
  } finally {
    globalThis.window = previousWindow
  }
})
