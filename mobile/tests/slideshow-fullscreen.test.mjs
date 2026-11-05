import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { transform } from 'esbuild'

const source = await fs.readFile(new URL('../web/slideshowFullscreen.ts', import.meta.url), 'utf8')
const result = await transform(source, { loader: 'ts', format: 'esm' })
const { 进入移动放映全屏 } = await import('data:text/javascript;base64,' + Buffer.from(result.code).toString('base64'))

test('安卓网页视图拒绝系统全屏时保留固定视口放映', async () => {
  const document = { documentElement: { requestFullscreen: async () => { throw new Error('Fullscreen is not supported') } } }
  assert.equal(await 进入移动放映全屏(document, 'android'), 'viewport')
})

test('鸿蒙网页视图拒绝系统全屏时保留固定视口放映', async () => {
  const document = { documentElement: { requestFullscreen: async () => { throw new Error('Fullscreen is not supported') } } }
  assert.equal(await 进入移动放映全屏(document, 'harmony'), 'viewport')
})

test('网页可用系统全屏时实际进入系统全屏', async () => {
  let calls = 0
  const document = { documentElement: { requestFullscreen: async () => { calls++ } } }
  assert.equal(await 进入移动放映全屏(document, 'web'), 'native')
  assert.equal(calls, 1)
})

test('普通网页拒绝全屏时如实报告原因', async () => {
  const document = { documentElement: { requestFullscreen: async () => { throw new Error('系统拒绝全屏') } } }
  await assert.rejects(() => 进入移动放映全屏(document, 'web'), /系统拒绝全屏/)
})
