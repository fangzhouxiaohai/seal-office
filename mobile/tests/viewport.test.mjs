import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
test('键盘覆盖、ROM 调整窗口、缩放和横屏使用合理的视口', async () => {
  const result = await build({ entryPoints: [fileURLToPath(new URL('../web/viewport.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false })
  const { viewportState: state } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
  assert.deepEqual(state(844, 520, 1, 844, true), { height: 520, keyboard: true })
  assert.deepEqual(state(520, 520, 1, 844, true), { height: 520, keyboard: true })
  assert.deepEqual(state(844, 422, 2, 844, true), { height: 844, keyboard: false })
  assert.deepEqual(state(390, 390, 1, 390, true), { height: 390, keyboard: false })
  assert.deepEqual(state(844, 520, 1, 844, false), { height: 520, keyboard: false })
})
