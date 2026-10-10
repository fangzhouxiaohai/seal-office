import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import { webcrypto } from 'node:crypto'
const script = await fs.readFile(new URL('../web/public/compatibility.js', import.meta.url), 'utf8')
function run(userAgent) {
  const element = () => ({ style: {}, textContent: '', appendChild() {} })
  const context = { navigator: { userAgent }, document: { documentElement: { dataset: {} }, getElementById: element, createElement: element }, location: {}, CSS: { supports: () => true }, indexedDB: {}, TextEncoder, ResizeObserver: class {}, crypto: { getRandomValues: bytes => webcrypto.getRandomValues(bytes) }, Uint8Array, structuredClone }
  context.window = context
  vm.runInNewContext(script, context)
  return context
}
test('旧安卓内核显示更新入口，现代内核与 iOS 27 不被误拦截', () => {
  assert.equal(run('Android 9; Chrome/74.0.0.0').document.documentElement.dataset.sealUnsupported, '1')
  assert.equal(run('Android 9; Chrome/100.0.0.0').document.documentElement.dataset.sealUnsupported, undefined)
  assert.equal(run('Android 16; Chrome/146.0.0.0').document.documentElement.dataset.sealUnsupported, undefined)
  assert.equal(run('iPhone; Version/15.3 Mobile Safari/605.1.15').document.documentElement.dataset.sealUnsupported, '1')
  assert.equal(run('iPhone; Version/15.4 Mobile Safari/605.1.15').document.documentElement.dataset.sealUnsupported, undefined)
  const ios = run('iPhone; Version/27.0 Mobile Safari/605.1.15')
  assert.equal(ios.document.documentElement.dataset.sealUnsupported, undefined)
  assert.match(ios.crypto.randomUUID(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})
