const { decodeDocument } = require('../../main/ipc/documentBytes')
const { createHash } = require('./shims/crypto.js')
self.onmessage = async ({ data }) => {
  try {
    const { file, ext } = data
    const bytes = Buffer.alloc(file.size), hash = createHash('sha256')
    const chunkSize = 512 * 1024
    for (let offset=0; offset<file.size; offset+=chunkSize) {
      const part = new Uint8Array(await file.slice(offset,offset+chunkSize).arrayBuffer())
      bytes.set(part,offset); hash.update(part)
      self.postMessage({ stage:'read', done:offset+part.length, total:file.size })
    }
    self.postMessage({ stage:'parse' })
    const result = await decodeDocument(bytes,ext,true)
    self.postMessage({ result:{ 成功:true, ...result, 文件指纹:hash.digest('hex'), 扩展名:ext } })
  } catch(e) { self.postMessage({ result:{ 成功:false, 错误:e.message } }) }
}
