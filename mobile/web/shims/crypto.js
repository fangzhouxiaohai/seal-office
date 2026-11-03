import { Buffer } from 'buffer'
import { sha256 } from '@noble/hashes/sha256'
import { sha1 } from '@noble/hashes/sha1'
import { hkdf } from '@noble/hashes/hkdf'
import { pbkdf2 } from '@noble/hashes/pbkdf2'
import { gcm } from '@noble/ciphers/aes'

export function randomBytes(size) {
  const bytes = Buffer.alloc(size)
  for (let offset = 0; offset < size; offset += 65536) globalThis.crypto.getRandomValues(bytes.subarray(offset, offset + 65536))
  return bytes
}
export function randomUUID() {
  const b = randomBytes(16); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128
  const hex = b.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
export function createHash(algorithm) {
  const hash = algorithm === 'sha256' ? sha256.create() : algorithm === 'sha1' ? sha1.create() : null
  if (!hash) throw new Error(`不支持的摘要算法：${algorithm}`)
  const api = { update(data, encoding) { hash.update(typeof data === 'string' ? Buffer.from(data, encoding) : data); return api }, digest(encoding) { const bytes = Buffer.from(hash.digest()); return encoding ? bytes.toString(encoding) : bytes } }
  return api
}
export const hkdfSync = (algorithm, key, salt, info, length) => {
  if (algorithm !== 'sha256') throw new Error('只支持 SHA-256 HKDF')
  return Buffer.from(hkdf(sha256, key, salt, info, length))
}
// 分享链接的访问码包裹密钥用到 PBKDF2；浏览器没有同步实现，用纯 JS 版本。
// 签名与 Node 保持一致：(password, salt, iterations, keylen, digest)。
export const pbkdf2Sync = (password, salt, iterations, keylen, digest = 'sha256') => {
  if (digest !== 'sha256') throw new Error('只支持 SHA-256 PBKDF2')
  if (!Number.isInteger(iterations) || iterations < 1) throw new Error('PBKDF2 迭代次数无效')
  if (!Number.isInteger(keylen) || keylen < 1) throw new Error('PBKDF2 密钥长度无效')
  // @noble/hashes 1.x 为位置参数，2.x 改为选项对象；两种都兼容。
  let derived
  try { derived = pbkdf2(sha256, Buffer.from(password), Buffer.from(salt), { c: iterations, dkLen: keylen }) }
  catch { derived = pbkdf2(sha256, Buffer.from(password), Buffer.from(salt), iterations, keylen) }
  return Buffer.from(derived)
}
function cipher(algorithm, key, iv, decrypt) {
  if (algorithm !== 'aes-256-gcm' || key.length !== 32 || iv.length !== 12) throw new Error('加密参数无效')
  let aad, tag, result
  const chunks = []
  return {
    setAAD(value) { aad = value }, setAuthTag(value) { tag = value },
    update(value) { chunks.push(Buffer.from(value)); return Buffer.alloc(0) },
    final() {
      const engine = gcm(key, iv, aad), input = Buffer.concat(chunks)
      if (decrypt) return Buffer.from(engine.decrypt(Buffer.concat([input, tag])))
      result = Buffer.from(engine.encrypt(input)); return result.subarray(0, -16)
    },
    getAuthTag() { if (!result) throw new Error('加密尚未完成'); return result.subarray(-16) }
  }
}
export const createCipheriv = (algorithm, key, iv) => cipher(algorithm, key, iv, false)
export const createDecipheriv = (algorithm, key, iv) => cipher(algorithm, key, iv, true)
