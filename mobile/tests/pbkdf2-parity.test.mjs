// 落地页、桌面主进程与移动端 shim 必须派生出同一把访问码包裹密钥。
// 桌面端调用 node:crypto；移动端走 shim 里的 @noble 实现，结果必须完全一致。
// 注意：@noble/hashes 1.x 是位置参数，2.x 是选项对象，shim 需要两种都支持。
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pbkdf2Sync } from 'node:crypto'

const CODE = '2468'
const SALT = 'seal-share-link:11111111-2222-3333-4444-555555555555'

async function loadShim() {
  return import('../web/shims/crypto.js')
}

test('移动端 PBKDF2 shim 与桌面端派生结果一致', async () => {
  const shim = await loadShim()
  const desktop = pbkdf2Sync(CODE, SALT, 100000, 32, 'sha256').toString('hex')
  const mobile = shim.pbkdf2Sync(CODE, SALT, 100000, 32, 'sha256').toString('hex')
  assert.equal(mobile, desktop, 'PBKDF2 跨端结果必须一致，否则落地页解不开访问码链接')
  assert.equal(mobile.length, 64)
})

test('不同访问码与不同链接标识派生不同密钥', async () => {
  const shim = await loadShim()
  const a = shim.pbkdf2Sync('2468', SALT, 100000, 32).toString('hex')
  const b = shim.pbkdf2Sync('1357', SALT, 100000, 32).toString('hex')
  const other = shim.pbkdf2Sync('2468', 'seal-share-link:22222222-3333-4444-5555-666666666666', 100000, 32).toString('hex')
  assert.notEqual(a, b)
  assert.notEqual(a, other)
})

test('PBKDF2 参数校验：拒绝非 SHA-256 与非法迭代次数', async () => {
  const shim = await loadShim()
  assert.throws(() => shim.pbkdf2Sync('2468', SALT, 100000, 32, 'sha1'))
  assert.throws(() => shim.pbkdf2Sync('2468', SALT, 0, 32))
  assert.throws(() => shim.pbkdf2Sync('2468', SALT, 1000, 0))
})
