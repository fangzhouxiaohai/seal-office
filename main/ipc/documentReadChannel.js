const { Worker } = require('node:worker_threads')
const fs = require('node:fs/promises')
const path = require('node:path')

function registerDocumentRead(ipcMain) {
  const jobs = new Map()
  ipcMain.handle('file.size', async (_event, file) => (await fs.stat(file)).size)
  ipcMain.handle('file.cancelRead', (event, id) => jobs.get(event.sender.id + ':' + id)?.())
  ipcMain.handle('file.readLarge', (event, file, id) => new Promise((resolve, reject) => {
    const key = event.sender.id + ':' + id
    if (jobs.has(key)) return reject(new Error('打开任务已经存在'))
    const worker = new Worker(path.join(__dirname, 'documentReadWorker.js'), { workerData: { path: file } })
    const close = () => {
      jobs.delete(key)
      event.sender.removeListener('destroyed', cancel)
      void worker.terminate()
    }
    const cancel = () => { close(); resolve({ 成功: false, 错误: '已取消打开' }) }
    jobs.set(key, cancel)
    event.sender.once('destroyed', cancel)
    worker.on('message', update => {
      if (update.result) { close(); resolve(update.result) }
      else if (!event.sender.isDestroyed()) event.sender.send('file.readProgress', { id, ...update })
    })
    worker.on('error', error => { close(); reject(error) })
    worker.once('exit', () => { if (jobs.has(key)) { close(); reject(new Error('后台读取意外结束')) } })
  }))
}
module.exports = { registerDocumentRead }
