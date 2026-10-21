import { Buffer } from 'buffer'
import { mergeUpdates } from 'yjs'
import path from 'path-browserify'
import core from './generated/core.mjs'
import { downloadFile, platformFetch, waitForNative, pickNativeFiles, writeNativeClipboard } from './native'
import { installExportAdapters } from './exports'
import { validateImport } from './fileTypes'
import formats from '../../main/documentFormats.json'
import { installConversionService } from './conversionService'

const { platform, storage, vault, crypto: cryptoCore } = core
const { ipcMain } = platform
const hash = (bytes: Uint8Array) => cryptoCore.createHash('sha256').update(bytes).digest('hex')
const binaryExtensions = new Set([...formats.filter(format => !('text' in format && format.text)).map(format => format.extension), 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'mp3', 'wav', 'mp4', 'webm'])
const allDocuments = formats.map(format => '.' + format.extension).join(',')
const bytes = (data: string | Uint8Array, format?: string) => typeof data === 'string' ? Buffer.from(data, format === '二进制' ? 'base64' : 'utf8') : Buffer.from(data)
const wrapped = (callback: (...args: any[]) => any) => async (_event: unknown, ...args: any[]) => {
  try { return await callback(...args) } catch (error) { return error instanceof Error && error.name === 'AbortError' ? { 成功: false, 已取消: true } : { 成功: false, 错误: error instanceof Error ? error.message : String(error) } }
}
const handle = (channel: string, callback: (...args: any[]) => any) => ipcMain.handle(channel, wrapped(callback))
const success = () => ({ 成功: true })
let unsaved = 0

async function pickFiles(accept = allDocuments, multiple = false): Promise<string[]> {
  const files = window.sealNative?.platform === 'harmony' ? await pickNativeFiles(multiple) : await new Promise<File[]>((resolve) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = window.sealNative?.platform === 'android' ? '*/*' : accept; input.multiple = multiple; input.hidden = true
    let finished = false, timer: ReturnType<typeof setTimeout> | undefined
    const finish = (value: File[]) => { if (finished) return; finished = true; clearTimeout(timer); input.remove(); window.removeEventListener('focus', focus); resolve(value) }
    const focus = () => { timer = setTimeout(() => { if (!input.files?.length) finish([]) }, 1500) }
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])), { once: true })
    input.addEventListener('cancel', () => finish([]), { once: true }); window.addEventListener('focus', focus, { once: true })
    document.body.appendChild(input); input.click()
  })
  const paths: string[] = []
  // 安卓文件提供方的 MIME 对 Markdown 等格式并不一致，选择后统一验证扩展名。
  for (const file of files) {
    validateImport(file.name, accept)
    if (file.size > 100 * 1024 * 1024) throw new Error('单个文件不能超过 100 MiB')
  }
  for (const file of files) {
    const name = path.basename(file.name.replaceAll('\\', '/')).replace(/[\u0000-\u001f]/g, '_')
    const filename = '/seal/documents/' + cryptoCore.randomUUID() + '/' + name
    storage.mkdirSync(path.dirname(filename), { recursive: true }); storage.writeFileSync(filename, Buffer.from(await file.arrayBuffer())); paths.push(filename)
  }
  await storage.flushStorage(); return paths
}
const acceptFor = (kind?: string) => kind ? formats.filter(format => format.type === kind || kind === 'table' && ['json', 'xml'].includes(format.extension)).map(format => '.' + format.extension).join(',') : allDocuments
async function save(filename: string, data: string | Uint8Array, format?: string, fingerprint?: string | null, encoding?: string) {
  if (!filename.startsWith('/seal/documents/')) throw new Error('请保存到应用文档空间')
  if (fingerprint && storage.existsSync(filename) && hash(storage.readFileSync(filename)) !== fingerprint) throw new Error('文件已被其他操作修改，请另存为，避免覆盖')
  const content = typeof data === 'string' && format !== '二进制' ? core.textCodec.编码文本(data, encoding) : bytes(data, format)
  const previous = storage.existsSync(filename) ? storage.readFileSync(filename) : null
  const expected = previous ? hash(previous) : null
  // 保存到手机文档空间即可；只有显式导出/分享才唤起系统分享面板。
  // 网页版仍通过下载给用户一份设备上的副本。
  const explicitSaveAs = platform.consumeSaveDialog(filename)
  if (!window.sealNative || explicitSaveAs) await downloadFile(path.basename(filename), content)
  if (storage.existsSync(filename) ? hash(storage.readFileSync(filename)) !== expected : expected !== null) throw new Error('导出期间文件发生变化，已导出副本但未覆盖本机来源，请重新打开')
  storage.mkdirSync(path.dirname(filename), { recursive: true }); storage.writeFileSync(filename, content)
  try { await storage.flushStorage() }
  catch (error) {
    if (hash(storage.readFileSync(filename)) === hash(content)) { if (previous) storage.writeFileSync(filename, previous); else storage.rmSync(filename, { force: true }) }
    throw error
  }
  return { 成功: true, 路径: filename, 文件指纹: hash(content) }
}
const recentFile = '/seal/private/recent.json'
const readRecents = () => storage.existsSync(recentFile) ? JSON.parse(storage.readFileSync(recentFile, 'utf8')) : []
const writeRecents = (items: unknown[]) => { storage.writeFileSync(recentFile, JSON.stringify(items)); return { 成功: true, 数据: items } }

function registerFiles() {
  handle('file.showOpenDialog', async (kind) => (await pickFiles(acceptFor(kind)))[0] ?? null)
  handle('file.showOpenDialogMany', (kind) => pickFiles(acceptFor(kind), true))
  handle('file.showSaveDialog', async (name) => (await platform.dialog.showSaveDialog({ defaultPath: name })).filePath)
  handle('file.readFile', (filename: string) => {
    const content = storage.readFileSync(filename), ext = path.extname(filename).slice(1).toLowerCase(), binary = binaryExtensions.has(ext)
    return { 成功: true, ...(binary ? { 内容: content.toString('base64') } : core.textCodec.解码文本(content)), 二进制: binary, 扩展名: ext ? '.' + ext : '', 文件指纹: hash(content) }
  })
  handle('file.saveToFile', save)
  handle('file.rename', async (filename, name, fingerprint) => {
    if (!name?.trim() || /[\\/\u0000-\u001f]/.test(name)) throw new Error('文件名称无效')
    if (fingerprint && hash(storage.readFileSync(filename)) !== fingerprint) throw new Error('文件已变化，请重新打开后重命名')
    const target = path.join(path.dirname(filename), name)
    if (target !== filename && storage.existsSync(target)) throw new Error('同名文件已存在')
    storage.renameSync(filename, target)
    return { 成功: true, 路径: target, 名称: name, 文件指纹: hash(storage.readFileSync(target)) }
  })
  handle('file.listKnownFolder', (kind: string) => {
    if (['desktop', 'download'].includes(kind)) throw new Error('请使用“文件”导入设备文档，或在“文档”中查看已导入文件')
    return { 成功: true, 路径: '应用文档空间', 文件: storage.listFiles().map((filename: string) => ({ 名称: path.basename(filename), 路径: filename, 扩展名: path.extname(filename).toLowerCase(), 大小: storage.statSync(filename).size, 修改时间: storage.statSync(filename).mtimeMs })) }
  })
  handle('file.recent.list', () => ({ 成功: true, 数据: readRecents() }))
  handle('file.recent.add', (item) => writeRecents([item, ...readRecents().filter((old: any) => old.路径 !== item.路径)].slice(0, 500)))
  handle('file.recent.remove', (filename) => writeRecents(readRecents().filter((item: any) => item.路径 !== filename)))
  handle('file.revealInFolder', (filename) => platform.exportStoredFile(filename).then(success))
  handle('file.backup.save', (content) => { storage.writeFileSync('/seal/private/workspace.json', content); return success() })
  handle('file.backup.load', () => ({ 成功: true, 内容: storage.existsSync('/seal/private/workspace.json') ? storage.readFileSync('/seal/private/workspace.json', 'utf8') : null }))
  handle('file.backup.clear', () => { storage.rmSync('/seal/private/workspace.json', { force: true }); return success() })
  handle('file.backup.preserve', (content) => {
    const filename = '/seal/private/workspace-preserved-' + Date.now() + '.json'
    storage.writeFileSync(filename, content ?? storage.readFileSync('/seal/private/workspace.json')); return { 成功: true, 路径: filename }
  })
  handle('system.reportUnsavedCount', (count) => { unsaved = count; return success() })
  handle('system.respondCloseState', success); handle('system.respondSaveAll', success)
  handle('system.presentationSessionIdentity', () => ({ 成功: true, 窗口标识: 'web-' + cryptoCore.randomUUID() }))
  handle('system.enterSlideshowFullscreen', async () => { if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); return { 成功: true, 会话标识: 'web-slideshow' } })
  handle('system.exitSlideshowFullscreen', async () => { if (document.fullscreenElement) await document.exitFullscreen(); return success() })
  handle('system.openExternal', (url) => {
    const parsed = new URL(url); if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) throw new Error('链接格式不受支持')
    const opened = window.open(url, '_blank', 'noopener,noreferrer'); void opened; return success()
  })
  handle('app.getInfo', () => ({ 名称: '海豹办公', 英文名称: 'Seal Office', 版本: __APP_VERSION__, 作者: '饮风一笑', 邮箱: '24519660@qq.com', 说明: '永久免费开源', 开源地址: 'https://github.com/fangzhouxiaohai/seal-office', 专业服务: '专业应用开发服务' }))
  handle('system.checkIntegrity', () => ({ 成功: true, 完整: true, 检查文件数: 0 }))
  window.addEventListener('beforeunload', (event) => { if (unsaved) { event.preventDefault(); event.returnValue = '' } })
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) platform.sender.send('system.slideshowEnded', 'web-slideshow') })
}

async function initialize() {
  await waitForNative()
  if (window.sealNative) window.sealClipboard = { writeText: writeNativeClipboard }
  if (navigator.locks) await new Promise<void>((resolve, reject) => {
    void navigator.locks.request('seal-office-workspace', { ifAvailable: true }, async (lock) => {
      if (!lock) { reject(new Error('海豹办公已在另一个页面打开，请先关闭那个页面再重试')); return }
      resolve()
      // 由浏览器在页面关闭时释放，避免多个页面覆盖同一份云端/工作区状态。
      await new Promise<void>(() => {})
    }).catch(reject)
  })
  await storage.initializeStorage(); await vault.initializeVault()
  for (const folder of ['/seal/private', '/seal/documents', '/seal/tmp', '/seal/private/cloud-outbox']) storage.mkdirSync(folder, { recursive: true })
  window.fetch = platformFetch as typeof fetch
  platform.configureDialogs(() => pickFiles(undefined, true), (filename: string, data: Uint8Array) => downloadFile(path.basename(filename), data))
  const services = core.services.创建服务配置存储({ 配置路径: '/seal/private/presentation-services.secure', 安全存储: vault.safeStorage })
  const cloud = core.cloudService.createService({ directory: '/seal/private', safeStorage: vault.safeStorage, mergeUpdates,
    defaultUrl: !window.sealNative && /^https?:$/.test(window.location.protocol) ? new URL('/api', window.location.origin).href : undefined,
    transport: async (url: string, options: any) => {
      const headers = { ...options.headers }; delete headers['Content-Length']
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), options.timeout ?? 30000)
      const abort = () => controller.abort()
      options.signal?.addEventListener('abort', abort, { once: true })
      try {
        if (options.signal?.aborted) controller.abort()
        const response = await platformFetch(url, { method: options.method, headers, body: options.body ? new Uint8Array(options.body) : undefined, signal: controller.signal })
        if (!response.ok) { let data: any; try { data = await response.json() } catch { data = {} }; throw Object.assign(new Error(data.error || '云服务请求失败'), { status: response.status }) }
        return options.binary ? Buffer.from(await response.arrayBuffer()) : await response.json()
      } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort) }
    } })
  installConversionService(core, cloud)
  const requireAIIdentity = () => cloud.requireAIIdentity()
  const assistantSource = core.assistant.创建助手服务({ 配置路径: '/seal/private/assistant-config.secure', 安全存储: vault.safeStorage, 请求: core.ai.创建实名AI请求(requireAIIdentity) })
  // The common assistant returned by this registration enforces the same
  // server identity check for cloud OCR, Q&A and recognition on every host.
  const assistant = core.ai.注册智能助手通道(ipcMain, { 助手服务: assistantSource, requireAIIdentity })
  core.office.注册Office通道(ipcMain)
  core.presentationAi.注册演示智能通道(ipcMain, { 助手服务: assistant, 服务存储: services, 用户数据目录: '/seal/private', requireAIIdentity })
  core.generation.注册演示生成通道(ipcMain, { 助手服务: assistant, 服务存储: services, 用户数据目录: '/seal/private', requireAIIdentity })
  core.cloud.注册云端通道(ipcMain, { cloudService: cloud, 助手服务: assistant, requireAIIdentity })
  const recording = core.recording.创建录制服务({ 捕获源: null, 最大字节: 100 * 1024 * 1024 })
  // 第二个参数是演示资源存储；服务依赖必须放在第三个参数，否则模板恢复/读取图片都会调用到错误的对象。
  core.presentation.注册演示通道(ipcMain, undefined, { 识别服务: core.recognition.创建识别服务({ 助手服务: assistant }), 录制服务: recording, requireAIIdentity })
  handle('presentation.recording.save', async (data: string, format: string, name: string) => {
    const result = await recording.保存录制({ 数据: data, 格式: format, 建议名: name })
    if (!result.取消) await platform.exportStoredFile(result.路径)
    return { 成功: true, ...result }
  })
  registerFiles(); await installExportAdapters(core, save, handle)
  // 不提供仅属于 Windows 或独立桌面窗口的能力探测。
  const api = window.electronAPI as any
  for (const key of ['database', 'setDefaultApp', 'applyDefaultApp', 'checkDefaultAppOnStartup', 'defaultAppCheckState', 'checkDefaultAppPrompt', 'presenter', 'newPresentationWindow', 'tilePresentationWindows', 'takePendingAssociatedFiles', 'onAssociatedFilesAvailable', 'checkIntegrity']) delete api[key]
  const originalCloud = api.cloud.invoke
  api.cloud.invoke = async (action: string, input: any = {}) => {
    if (['ocrImage', 'imagePresentation'].includes(action)) await platform.prepareImage(Buffer.from(input.data, 'base64'))
    const result = await originalCloud(action, input)
    // The native service queues CRDT edits before acknowledging them. Commit the
    // browser filesystem transaction too, so an offline refresh cannot drop edits.
    if (result.成功 && ['realtimeSource', 'realtimeRecovery', 'realtimeCatalog', 'realtimeStage', 'realtimeBindFile', 'realtimeQueue', 'realtimeState', 'realtimeOpen', 'realtimePush'].includes(action)) await storage.flushStorage()
    // 协作文件在应用文档空间打开，后续 Ctrl+S / 保存可以沿用安全写盘与指纹校验。
    // 明确选择“下载”时，界面的 revealInFolder 再交给系统导出，不在打开时弹分享面板。
    if (result.成功 && result.数据?.path && ['shareDownload', 'teamDownload', 'realtimeDownload'].includes(action)) {
      const source = result.数据.path
      const filename = '/seal/documents/collaboration/' + cryptoCore.randomUUID() + '/' + path.basename(result.数据.name || source)
      storage.mkdirSync(path.dirname(filename), { recursive: true })
      storage.writeFileSync(filename, storage.readFileSync(source))
      await storage.flushStorage()
      result.数据 = { ...result.数据, path: filename }
    }
    if (result.成功 && result.数据?.path && ['download', 'exportPending'].includes(action)) await platform.exportStoredFile(result.数据.path)
    return result
  }
  const compress = api.presentationTools.compressImage
  api.presentationTools.compressImage = async (input: any, options: any) => { await platform.prepareImage(Buffer.from(typeof input === 'string' ? input : input.数据, 'base64')); return compress(input, options) }
  await storage.flushStorage()
}
export const ready = initialize()
platform.setGate(ready)
export { core, pickFiles, save }
