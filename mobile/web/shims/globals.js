import { Buffer } from 'buffer'
// 桌面 PPTX 对象标识使用 Node 的 base64url，浏览器 Buffer 6 需要补齐。
if (!Buffer.isEncoding('base64url')) {
  const originalToString = Buffer.prototype.toString, originalFrom = Buffer.from
  Buffer.prototype.toString = function (encoding, start, end) {
    if (encoding === 'base64url') return originalToString.call(this, 'base64', start, end).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
    return originalToString.call(this, encoding, start, end)
  }
  Buffer.from = function (value, encoding, length) { return originalFrom.call(Buffer, value, encoding === 'base64url' ? 'base64' : encoding, length) }
}
export { Buffer }
export const process = { platform: 'browser', env: {}, cwd: () => '/seal', nextTick: (fn, ...args) => queueMicrotask(() => fn(...args)) }
export const global = globalThis
export function setImmediate(fn, ...args) { return setTimeout(fn, 0, ...args) }
export const clearImmediate = clearTimeout
