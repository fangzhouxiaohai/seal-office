import { Buffer } from 'buffer'
import { Inflate, deflate, deflateRaw, inflateRaw } from 'pako'

export function inflateSync(input, options = {}) {
  const maximum = options.maxOutputLength ?? 100 * 1024 * 1024
  const chunks = []; let length = 0
  const stream = new Inflate()
  stream.onData = (chunk) => { length += chunk.length; if (length > maximum) throw new Error('解压数据超过上限'); chunks.push(Buffer.from(chunk)) }
  stream.push(input, true)
  if (stream.err || !stream.ended) throw new Error(stream.msg || '压缩数据损坏')
  return Buffer.concat(chunks)
}
export const deflateSync = (input) => Buffer.from(deflate(input))
export const deflateRawSync = (input) => Buffer.from(deflateRaw(input))
export const inflateRawSync = (input) => Buffer.from(inflateRaw(input))
