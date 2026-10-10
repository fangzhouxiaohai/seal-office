import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash as nodeHash, createCipheriv as nodeCipher, hkdfSync as nodeHkdf } from 'node:crypto'
import { indexedDB } from 'fake-indexeddb'
import { Buffer } from 'buffer'
import * as crypto from '../web/shims/crypto.js'
import * as fs from '../web/shims/fs.js'
import { initializeVault, safeStorage } from '../web/shims/vault.js'
import { androidArguments } from '../scripts/pack.mjs'

test('浏览器 SHA-256、HKDF 和 AES-GCM 与桌面 Node 实现完全兼容', () => {
  const key = Buffer.alloc(32, 7), iv = Buffer.alloc(12, 3), aad = Buffer.from('seal-data:test'), plain = Buffer.from('海豹办公跨端云文档')
  assert.equal(crypto.createHash('sha256').update(plain).digest('hex'), nodeHash('sha256').update(plain).digest('hex'))
  assert.deepEqual(crypto.hkdfSync('sha256', key, aad, plain, 32), Buffer.from(nodeHkdf('sha256', key, aad, plain, 32)))
  const browser = crypto.createCipheriv('aes-256-gcm', key, iv); browser.setAAD(aad)
  const ciphertext = Buffer.concat([browser.update(plain), browser.final()])
  const desktop = nodeCipher('aes-256-gcm', key, iv); desktop.setAAD(aad)
  assert.deepEqual(ciphertext, Buffer.concat([desktop.update(plain), desktop.final()]))
  assert.deepEqual(browser.getAuthTag(), desktop.getAuthTag())
  const decrypt = crypto.createDecipheriv('aes-256-gcm', key, iv); decrypt.setAAD(aad); decrypt.setAuthTag(browser.getAuthTag())
  assert.deepEqual(Buffer.concat([decrypt.update(ciphertext), decrypt.final()]), plain)
  const corrupt = Buffer.from(ciphertext); corrupt[0] ^= 1
  const invalid = crypto.createDecipheriv('aes-256-gcm', key, iv); invalid.setAAD(aad); invalid.setAuthTag(browser.getAuthTag()); invalid.update(corrupt)
  assert.throws(() => invalid.final())
})
test('IndexedDB 原子重命名、二进制与安全记录重新初始化后可恢复', async () => {
  const database = 'test-seal-' + crypto.randomUUID()
  await fs.initializeStorage(indexedDB, database); await initializeVault()
  fs.mkdirSync('/seal/private', { recursive: true })
  const secret = 'offline-test-secret-do-not-use'
  fs.writeFileSync('/seal/private/config.tmp', safeStorage.encryptString(secret)); fs.renameSync('/seal/private/config.tmp', '/seal/private/config.secure')
  assert.equal(fs.readFileSync('/seal/private/config.secure').includes(Buffer.from(secret)), false)
  await fs.flushStorage()
  await fs.initializeStorage(indexedDB, database); await initializeVault()
  assert.equal(safeStorage.decryptString(fs.readFileSync('/seal/private/config.secure')), secret)
  assert.equal(fs.existsSync('/seal/private/config.tmp'), false)
  assert.equal((await fs.readMeta('vault-key')).wrapping.extractable, false)
  await fs.promises.unlink('/seal/private/config.secure')
  await fs.initializeStorage(indexedDB, database)
  assert.throws(() => fs.readFileSync('/seal/private/config.secure'), { code: 'ENOENT' })
})
test('安卓打包命令只包含 android，参数中的路径保持完整且不经过 shell', () => {
  const args = androidArguments({ androidPackage: 'com.sealoffice.mobile' }, 'E:/project with spaces/mobile')
  assert.equal(args[args.indexOf('--platform') + 1], 'android')
  assert.equal(args[args.indexOf('--project') + 1], 'E:/project with spaces/mobile')
  assert.equal(args.some((arg) => /ios|harmony|--win/.test(arg)), false)
  assert.throws(() => androidArguments({ androidPackage: '../unsafe' }, 'E:/seal-office/mobile'))
})
