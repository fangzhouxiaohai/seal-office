import { Buffer } from 'buffer'
import path from 'path-browserify'
import { safeStorage } from './vault.js'
import { flushStorage, mkdirSync, readFileSync, writeFileSync } from './fs.js'
import { createHash, randomUUID } from './crypto.js'

export { safeStorage }
export const handlers = new Map(), listeners = new Map()
let gate = Promise.resolve(), downloadHandler = async () => {}, openHandler = async () => []
export const setGate = (promise) => { gate = promise }
export const configureDialogs = (open, download) => { openHandler = open; downloadHandler = download }
export const ipcMain = { handle(channel, callback) { handlers.set(channel, callback) } }
const senderEvents = new Map()
export const sender = {
  id: 1, isDestroyed: () => false,
  send(channel, data) { for (const callback of listeners.get(channel) ?? []) callback({}, data) },
  once(channel, callback) { senderEvents.set(channel, callback) },
  removeListener(channel) { senderEvents.delete(channel) }
}
export const ipcRenderer = {
  async invoke(channel, ...args) {
    await gate
    const callback = handlers.get(channel)
    if (!callback) return { 成功: false, 错误: '此功能需要桌面操作系统，当前平台暂不支持' }
    try { const result = await callback({ sender }, ...args); await flushStorage(); return result }
    catch (err) { return { 成功: false, 错误: err instanceof Error ? err.message : String(err) } }
  },
  on(channel, callback) { const list = listeners.get(channel) ?? new Set(); list.add(callback); listeners.set(channel, list) },
  removeListener(channel, callback) { listeners.get(channel)?.delete(callback) }
}
export const contextBridge = { exposeInMainWorld(name, value) { window[name] = value } }
export const app = { getPath: () => '/seal/private' }
export const dialog = {
  async showSaveDialog(options) { const filename = '/seal/documents/' + randomUUID() + '/' + path.basename(options.defaultPath || '文档'); makeSaveDirectory(filename); return { canceled: false, filePath: filename } },
  async showOpenDialog() { const paths = await openHandler(); return { canceled: paths.length === 0, filePaths: paths } }
}
export async function exportStoredFile(filename) { await flushStorage(); await downloadHandler(filename, readFileSync(filename)) }

const images = new Map()
export async function prepareImage(bytes) {
  const id = createHash('sha256').update(bytes).digest('hex')
  if (images.has(id)) return
  const url = URL.createObjectURL(new Blob([bytes])), image = new Image()
  try { await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('图片解码失败')); image.src = url }); images.set(id, image) }
  finally { URL.revokeObjectURL(url) }
}
function fromCanvas(canvas) {
  return {
    getSize: () => ({ width: canvas.width, height: canvas.height }), isEmpty: () => !canvas.width || !canvas.height,
    toPNG: () => Buffer.from(canvas.toDataURL('image/png').split(',')[1], 'base64'),
    toJPEG: (quality) => Buffer.from(canvas.toDataURL('image/jpeg', quality / 100).split(',')[1], 'base64'),
    crop({ x, y, width, height }) { const result = document.createElement('canvas'); result.width = width; result.height = height; result.getContext('2d').drawImage(canvas, x, y, width, height, 0, 0, width, height); return fromCanvas(result) },
    resize({ width, height }) { const result = document.createElement('canvas'); result.width = width; result.height = height; result.getContext('2d').drawImage(canvas, 0, 0, width, height); return fromCanvas(result) }
  }
}
export const nativeImage = { createFromBuffer(bytes) {
  const image = images.get(createHash('sha256').update(bytes).digest('hex'))
  if (!image) throw new Error('图片尚未解码，请重新选择图片')
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; canvas.getContext('2d').drawImage(image, 0, 0)
  return fromCanvas(canvas)
} }
export const BrowserWindow = class { constructor() { throw new Error('当前功能需要桌面窗口接口') } }
export function makeSaveDirectory(filename) { mkdirSync(path.dirname(filename), { recursive: true }); return filename }
export const writeExport = (filename, bytes) => { makeSaveDirectory(filename); writeFileSync(filename, bytes) }
