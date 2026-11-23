const { parentPort, workerData } = require('node:worker_threads')
const fs = require('node:fs/promises')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { decodeDocument } = require('./documentBytes')

async function read() {
  const handle = await fs.open(workerData.path, 'r')
  try {
    const { size } = await handle.stat()
    const buffer = Buffer.allocUnsafe(size), chunk = 512 * 1024
    const absolute = path.resolve(workerData.path)
    const hash = createHash('sha256').update(process.platform === 'win32' ? absolute.toLowerCase() : absolute).update('\0')
    let read = 0
    while (read < size) {
      const { bytesRead } = await handle.read(buffer, read, Math.min(chunk, size-read), read)
      if (!bytesRead) throw new Error('文件在读取期间被截断')
      hash.update(buffer.subarray(read, read + bytesRead))
      read += bytesRead
      parentPort.postMessage({ stage: 'read', done: read, total: size })
    }
    if ((await handle.stat()).size !== size) throw new Error('文件在读取期间发生变化')
    const ext = path.extname(absolute).toLowerCase()
    parentPort.postMessage({ stage: 'parse' })
    const decoded = await decodeDocument(buffer, ext, true)
    parentPort.postMessage({ result: { 成功: true, ...decoded, 扩展名: ext, 文件指纹: hash.digest('hex') } })
  } finally { await handle.close() }
}
read().catch(error => parentPort.postMessage({ result: { 成功: false, 错误: error.message } }))
