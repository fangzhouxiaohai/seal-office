import { Buffer } from 'buffer'
import { gcm } from '@noble/ciphers/aes'
import { randomBytes } from './crypto.js'
import { readMeta, writeMeta } from './fs.js'

let key
export async function initializeVault() {
  if (!globalThis.crypto?.subtle) throw new Error('安全存储需要 HTTPS 或受信任的本地 WebView')
  let record = await readMeta('vault-key')
  if (!record) {
    const wrapping = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    const raw = randomBytes(32), iv = randomBytes(12)
    const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapping, raw)
    record = { wrapping, iv: new Uint8Array(iv), wrapped }
    await writeMeta('vault-key', record)
    raw.fill(0)
  }
  key = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, record.wrapping, record.wrapped))
}
export const safeStorage = {
  isEncryptionAvailable: () => key !== undefined,
  encryptString(text) { if (!key) throw new Error('安全存储未初始化'); const iv = randomBytes(12); return Buffer.concat([iv, Buffer.from(gcm(key, iv).encrypt(Buffer.from(text)))]) },
  decryptString(bytes) { if (!key || bytes.length < 28) throw new Error('安全记录无效'); return Buffer.from(gcm(key, bytes.subarray(0, 12)).decrypt(bytes.subarray(12))).toString('utf8') }
}
