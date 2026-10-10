import { Buffer } from 'buffer'
import { sha256 } from '@noble/hashes/sha256'
import { sha1 } from '@noble/hashes/sha1'
import { hkdf } from '@noble/hashes/hkdf'
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
