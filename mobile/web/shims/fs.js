import { Buffer } from 'buffer'
import path from 'path-browserify'

const files = new Map(), directories = new Set(['/']), dirty = new Map(), descriptors = new Map()
let database, nextDescriptor = 1, revision = 0, commitTail = Promise.resolve()
const normalize = (name) => path.resolve('/', String(name).replaceAll('\\', '/'))
const error = (code, name) => Object.assign(new Error(`${code}: ${name}`), { code })
const requestValue = (request) => new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
const transactionDone = (transaction) => new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onabort = () => reject(transaction.error || new Error('本地保存事务已中止')); transaction.onerror = () => {} })

export async function initializeStorage(factory = globalThis.indexedDB, name = 'seal-office-mobile-v1') {
  if (!factory) throw new Error('当前环境不能使用本地存储，请检查浏览器或 WebView 设置')
  const opening = factory.open(name, 1)
  opening.onupgradeneeded = () => { opening.result.createObjectStore('files'); opening.result.createObjectStore('meta') }
  database = await requestValue(opening)
  database.onversionchange = () => database.close()
  const tx = database.transaction('files', 'readonly'), done = transactionDone(tx), store = tx.objectStore('files')
  const [keys, values] = await Promise.all([requestValue(store.getAllKeys()), requestValue(store.getAll())]); await done
  files.clear(); directories.clear(); directories.add('/'); dirty.clear()
  keys.forEach((key, i) => { if (values[i].directory) directories.add(key); else files.set(key, { bytes: Buffer.from(values[i].bytes), mtime: values[i].mtime }) })
}
export async function readMeta(key) {
  const tx = database.transaction('meta', 'readonly'), done = transactionDone(tx)
  const value = await requestValue(tx.objectStore('meta').get(key)); await done; return value
}
export async function writeMeta(key, value) {
  const tx = database.transaction('meta', 'readwrite'), done = transactionDone(tx)
  tx.objectStore('meta').put(value, key); await done
}
function mark(name, value) { dirty.set(name, { value, revision: ++revision }) }
export function flushStorage() {
  const task = commitTail.catch(() => {}).then(async () => {
    if (!dirty.size) return
    if (!database) throw new Error('本地存储尚未初始化')
    const snapshot = new Map(dirty), tx = database.transaction('files', 'readwrite'), done = transactionDone(tx), store = tx.objectStore('files')
    for (const [name, item] of snapshot) { if (item.value === null) store.delete(name); else store.put(item.value, name) }
    await done
    for (const [name, item] of snapshot) if (dirty.get(name)?.revision === item.revision) dirty.delete(name)
  })
  commitTail = task; return task
}
export function mkdirSync(name, options = {}) {
  name = normalize(name)
  if (!options.recursive && !directories.has(path.dirname(name))) throw error('ENOENT', name)
  const parts = name.split('/').filter(Boolean); let parent = ''
  for (const part of parts) { parent += '/' + part; if (!directories.has(parent)) { directories.add(parent); mark(parent, { directory: true }) } }
  return name
}
export const existsSync = (name) => files.has(normalize(name)) || directories.has(normalize(name))
export function readFileSync(name, options) {
  const item = files.get(normalize(name)); if (!item) throw error('ENOENT', name)
  const encoding = typeof options === 'string' ? options : options?.encoding
  return encoding ? item.bytes.toString(encoding) : Buffer.from(item.bytes)
}
export function writeFileSync(name, bytes, options) {
  if (typeof name === 'number') name = descriptors.get(name)
  name = normalize(name)
  if (!directories.has(path.dirname(name))) throw error('ENOENT', name)
  if (options?.flag === 'wx' && files.has(name)) throw error('EEXIST', name)
  const item = { bytes: Buffer.from(bytes, typeof options === 'string' ? options : options?.encoding), mtime: Date.now() }
  files.set(name, item); mark(name, { ...item, bytes: new Uint8Array(item.bytes) })
}
export function renameSync(source, target) {
  source = normalize(source); target = normalize(target)
  if (!files.has(source)) throw error('ENOENT', source)
  if (!directories.has(path.dirname(target))) throw error('ENOENT', target)
  const item = files.get(source); files.set(target, item); files.delete(source)
  mark(target, { ...item, bytes: new Uint8Array(item.bytes) }); mark(source, null)
}
export function unlinkSync(name) { name = normalize(name); if (!files.delete(name)) throw error('ENOENT', name); mark(name, null) }
export function rmSync(name, options = {}) {
  name = normalize(name)
  if (directories.has(name)) {
    const children = [...files.keys(), ...directories].filter((key) => key.startsWith(name + '/'))
    if (children.length && !options.recursive) throw error('ENOTEMPTY', name)
    for (const key of [...children, name]) { files.delete(key); directories.delete(key); mark(key, null) }
  } else if (files.has(name)) unlinkSync(name)
  else if (!options.force) throw error('ENOENT', name)
}
export function readdirSync(name, options = {}) {
  name = normalize(name); if (!directories.has(name)) throw error('ENOENT', name)
  const children = [...new Set([...files.keys(), ...directories].filter((key) => key !== name && path.dirname(key) === name))]
  return options.withFileTypes ? children.map((key) => ({ name: path.basename(key), isFile: () => files.has(key), isDirectory: () => directories.has(key) })) : children.map((key) => path.basename(key))
}
export function statSync(name) {
  name = normalize(name); const item = files.get(name)
  if (!item && !directories.has(name)) throw error('ENOENT', name)
  return { size: item?.bytes.length ?? 0, mtimeMs: item?.mtime ?? 0, isFile: () => !!item, isDirectory: () => directories.has(name) }
}
export function openSync(name, flags) { if (flags === 'w') writeFileSync(name, Buffer.alloc(0)); const id = nextDescriptor++; descriptors.set(id, name); return id }
export const fsyncSync = () => {}
export const closeSync = (id) => descriptors.delete(id)
export const promises = Object.fromEntries(Object.entries({ readFile: readFileSync, writeFile: writeFileSync, mkdir: mkdirSync, rename: renameSync, unlink: unlinkSync, rm: rmSync, readdir: readdirSync, stat: statSync }).map(([name, fn]) => [name, async (...args) => { const value = fn(...args); if (!['readFile', 'readdir', 'stat'].includes(name)) await flushStorage(); return value }]))
export const listFiles = (prefix = '/seal/documents/') => [...files.keys()].filter((name) => name.startsWith(prefix))
