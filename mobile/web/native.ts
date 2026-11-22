import { Buffer } from 'buffer'
import { exportMime } from './fileTypes'
import { 图片格式 } from '../../renderer/src/scan/imageFormat'

type NativeEvent = { id: string; type: string; status?: number; headers?: Record<string, string>; data?: string; error?: string; path?: string; name?: string; size?: number; fonts?: unknown[]; value?: any }
type Bridge = { token: string; platform: string; cameraPreview?: boolean; speechInput?: boolean; audioRecorder?: boolean }
declare global {
  interface Window {
    sealNative?: Bridge
    sealReceiveNative?: (event: NativeEvent) => void
    uni?: { webView?: { postMessage: (input: { data: unknown }) => void } }
  }
}
const pending = new Map<string, (event: NativeEvent) => void>()
window.sealReceiveNative = (event) => pending.get(event.id)?.(event)
function send(data: Record<string, unknown>) {
  if (!window.sealNative || !window.uni?.webView) throw new Error('原生接口尚未就绪')
  window.uni.webView.postMessage({ data: { ...data, token: window.sealNative.token } })
}

/** 原生更新进度只来自实际宿主事件；订阅者可随时解除监听。 */
export function onNativeUpdate(callback: (state: any) => void): () => void {
  const listener = (event: Event) => callback((event as CustomEvent).detail)
  window.addEventListener('seal-native-update', listener)
  return () => window.removeEventListener('seal-native-update', listener)
}

export function nativeUpdate(action: 'update-download' | 'update-cancel' | 'update-status' | 'update-install' | 'update-store-open', fields: Record<string, unknown> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID()
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('更新操作超时，请检查网络或重试')) }, action === 'update-download' ? 30 * 60 * 1000 : 120000)
    pending.set(id, event => {
      if (event.type !== 'update-result' && event.type !== 'error') return
      clearTimeout(timer); pending.delete(id)
      if (event.type === 'error') reject(new Error(event.error || '原生更新操作失败'))
      else if (!event.value || typeof event.value.成功 !== 'boolean') reject(new Error('原生更新返回内容无效'))
      else resolve(event.value)
    })
    try { send({ ...fields, id, action }) } catch (error) { clearTimeout(timer); pending.delete(id); reject(error) }
  })
}
export async function waitForNative() {
  if (!new URLSearchParams(location.search).has('native')) return
  if (!window.sealNative) await new Promise<void>((resolve, reject) => {
    const ready = () => { clearTimeout(timer); resolve() }
    const timer = setTimeout(() => { window.removeEventListener('seal-native-ready', ready); reject(new Error('原生接口初始化超时，请重新打开应用')) }, 15000)
    window.addEventListener('seal-native-ready', ready, { once: true })
  })
  // A config object alone does not prove that WebView -> host -> WebView works.
  // Fail at startup with a usable retry screen instead of inert file/login UI.
  await new Promise<void>((resolve, reject) => {
    const id = crypto.randomUUID()
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('原生接口连接超时，请重新打开应用')) }, 5000)
    pending.set(id, event => {
      clearTimeout(timer); pending.delete(id)
      event.type === 'ready' ? resolve() : reject(new Error(event.error || '原生接口连接失败，请重新打开应用'))
    })
    try { send({ id, action: 'ping' }) } catch (error) { clearTimeout(timer); pending.delete(id); reject(error) }
  })
}
/** HarmonyOS 原生系统字体列表；Android/WebView 不公开字体文件枚举，继续用导入字体与内置字体。 */
export function listNativeSystemFonts(): Promise<Array<Record<string, unknown>>> {
  if (!window.sealNative || window.sealNative.platform !== 'harmony') return Promise.resolve([])
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID()
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('系统字体列表读取超时')) }, 15000)
    pending.set(id, (event) => {
      clearTimeout(timer); pending.delete(id)
      if (event.type === 'system-fonts' && Array.isArray(event.fonts)) resolve(event.fonts as Array<Record<string, unknown>>)
      else reject(new Error(event.error || '系统字体列表读取失败'))
    })
    try { send({ id, action: 'font-system-list' }) } catch (error) { clearTimeout(timer); pending.delete(id); reject(error) }
  })
}

export function nativeFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(new DOMException('已停止', 'AbortError')); return }
    // PATCH 在传输层改发 POST，并用覆盖头保留语义：Android 的 uni.request 与
    // 鸿蒙的 @ohos.net.http 都没有 PATCH 常量，直接降级成 GET 会让重命名、移动、
    // 标签改名等写操作变成读取，服务端匹配不到路由后返回「接口不存在」。
    // 在这里把方法与头一次定好；原生宿主只需「按名字取值」，不做任何集合遍历——
    // UTS 编译到 Kotlin 时遍历 UTSJSONObject 会产生签名不匹配的编译错误。
    const requestedMethod = options.method ?? 'GET'
    const id = crypto.randomUUID(), outHeaders: Record<string, string> = {};
    for (const [key, value] of new Headers(options.headers)) outHeaders[key] = value
    if (requestedMethod === 'PATCH') outHeaders['X-Seal-Method-Override'] = 'PATCH'
    const headers = outHeaders, requestMethod = requestedMethod === 'PATCH' ? 'POST' : requestedMethod, headerNames = Object.keys(headers), chunks: Uint8Array[] = []
    let controller: ReadableStreamDefaultController<Uint8Array>, delivered = false, started = false, finished = false, streaming = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const cleanup = () => { clearTimeout(timer); pending.delete(id); options.signal?.removeEventListener('abort', abort) }
    const fail = (error: unknown) => {
      if (finished) return
      finished = true; cleanup()
      if (started) controller?.error(error); else reject(error)
    }
    const resetTimeout = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        try { send({ id, action: 'abort' }) } catch { /* 宿主可能已退出 */ }
        fail(new Error('网络请求超时，请检查网络后重试'))
      }, streaming && started ? 120000 : 70000)
    }
    const begin = (status = 200, responseHeaders: Record<string, string> = {}): boolean => {
      // The Harmony/Android host reports status 0 when the connection never
      // produced an HTTP response. Response() rejects that value, leaking an
      // English DOMException into the login form. Treat it as a network error.
      if (!Number.isInteger(status) || status < 200 || status > 599) {
        fail(new Error('网络连接失败，请检查网络后重试'))
        return false
      }
      if (started) return true
      const response = [204, 205, 304].includes(status) ? new Response(null, { status, headers: responseHeaders })
        : new Response(new ReadableStream<Uint8Array>({ start(c) { controller = c; for (const chunk of chunks) c.enqueue(chunk) }, cancel() { abort() } }), { status, headers: responseHeaders })
      started = true; resolve(response)
      return true
    }
    const abort = () => {
      if (finished) return
      finished = true
      try { send({ id, action: 'abort' }) } catch { /* 宿主可能已退出 */ }
      cleanup(); const error = new DOMException('已停止', 'AbortError')
      if (started) controller?.error(error); else reject(error)
    }
    pending.set(id, (event) => {
      if (finished) return
      try {
      if (event.type === 'headers') {
        if (!begin(event.status === undefined ? 200 : event.status, event.headers)) return
      }
      else if (event.type === 'chunk') {
        delivered = true; const chunk = new Uint8Array(Buffer.from(event.data ?? '', 'base64'))
        if (started) controller?.enqueue(chunk); else chunks.push(chunk)
      } else if (event.type === 'end') {
        if (!begin(event.status === undefined ? 200 : event.status, event.headers)) return
        if (!delivered && event.data) controller?.enqueue(new Uint8Array(Buffer.from(event.data, 'base64')))
        finished = true; cleanup(); controller?.close()
      } else if (event.type === 'error') {
        fail(new Error(event.error || '网络请求失败'))
      }
      if (!finished) resetTimeout()
      } catch (error) { fail(error) }
    })
    options.signal?.addEventListener('abort', abort, { once: true })
    try {
      const body = options.body == null ? undefined : typeof options.body === 'string' ? Buffer.from(options.body) : Buffer.from(options.body as Uint8Array)
      // Harmony's uni.request adapter handles a string body more reliably than an
      // ArrayBuffer for JSON/form posts. Keep the base64 body for binary paths.
      const bodyText = typeof options.body === 'string' ? options.body : ''
      let stream = new Headers(options.headers).get('accept')?.includes('event-stream') ?? false
      if (body) { try { stream ||= JSON.parse(body.toString()).stream === true } catch { /* 二进制与表单请求不使用 SSE */ } }
      streaming = stream; resetTimeout()
      send({ id, action: 'request', url, method: requestMethod, headers, headerNames, body: body?.toString('base64'), bodyText, stream })
    } catch (error) { fail(error) }
  })
}
const browserFetch = window.fetch.bind(window)
export function writeNativeClipboard(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID()
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('复制超时，请重试')) }, 15000)
    pending.set(id, event => { clearTimeout(timer); pending.delete(id); event.type === 'written' ? resolve() : reject(new Error(event.error || '复制失败')) })
    try { send({ id, action: 'clipboard-write', text }) } catch (error) { clearTimeout(timer); pending.delete(id); reject(error) }
  })
}
/** Native file-picker bytes avoid ArkWeb trying to fetch a foreign file URI. */
export function pickNativeFiles(multiple: boolean): Promise<File[]> {
  return receiveFiles(crypto.randomUUID(), 'pick-files', { multiple })
}

function mediaChunk(data?: string): Uint8Array<ArrayBuffer> {
  if (!data || data.length % 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('媒体数据传输不完整，请重新选择')
  return new Uint8Array(Buffer.from(data, 'base64'))
}

function recordingFormat(bytes: Uint8Array): [string, string] {
  const header = String.fromCharCode(...bytes.subarray(0, 16))
  if (header.slice(4, 8) === 'ftyp') return ['audio/mp4', 'm4a']
  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WAVE') return ['audio/wav', 'wav']
  if (bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) return ['audio/aac', 'aac']
  throw new Error('录音文件格式无效，请重新录制')
}

function receiveFiles(id:string, action:string, fields:Record<string,unknown>, signal?:AbortSignal, started?:()=>void): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const files: File[] = []
    let name = '', chunks: Uint8Array<ArrayBuffer>[] = [], total = 0, aggregate = 0, reading = false, expected: number | undefined
    const cleanup = () => { clearTimeout(timer); pending.delete(id); signal?.removeEventListener('abort', cancel) }
    const cancel = () => { if(started) {try{send({id,action:'audio-record-cancel'})}catch{}} cleanup(); resolve([]) }
    const timer = setTimeout(() => { if(started) {try{send({id,action:'audio-record-cancel'})}catch{}} cleanup(); reject(new Error('等待原生文件超时，请重试')) }, started ? 12*60000 : 180000)
    if(signal?.aborted) { cleanup(); resolve([]); return }
    signal?.addEventListener('abort',cancel,{once:true})
    pending.set(id, event => {
      try {
        if (event.type === 'audio-started') { started?.(); return }
        if (event.type === 'file-start') {
          if (reading || files.length >= 20) throw new Error('文件读取顺序无效或数量超过上限')
          name = event.name || '文档'; chunks = []; total = 0; reading = true; expected = event.size
        }
        else if (event.type === 'chunk') {
          if (!reading) throw new Error('文件读取尚未开始')
          const chunk = mediaChunk(event.data)
          total += chunk.length; aggregate += chunk.length
          if (aggregate > 100 * 1024 * 1024) throw new Error('一次导入的文件总大小不能超过 100 MiB')
          chunks.push(chunk)
        } else if (event.type === 'file-end') {
          if (!reading) throw new Error('文件读取尚未开始')
          if (expected !== undefined && expected > 0 && expected !== total) throw new Error('文件传输不完整，请重新选择')
          let type = exportMime(name)
          if (started) {
            if (!total) throw new Error('录音为空，请重新录制')
            const [mime, ext] = recordingFormat(Buffer.concat(chunks, Math.min(16, total)))
            type = mime
            name = name.replace(/\.[^.]*$/, '') + '.' + ext
          }
          files.push(new File(chunks, name, {type})); chunks = []; reading = false
        } else if (event.type === 'end' || event.type === 'cancel') {
          if (event.type === 'end' && reading) throw new Error('文件读取未完成，请重新选择')
          cleanup(); resolve(event.type === 'cancel' ? [] : files)
        }
        else if (event.type === 'error') throw new Error(event.error || '文件读取失败')
      } catch (error) { cleanup(); reject(error) }
    })
    try { send({ id, action, ...fields }) } catch (error) { cleanup(); reject(error) }
  })
}

export function recordNativeAudio(signal:AbortSignal, started:()=>void) {
  const id=crypto.randomUUID()
  const result=receiveFiles(id,'audio-record-start',{},signal,started).then(files=>files[0]??null)
  return {停止:()=>{if(pending.has(id)) send({id,action:'audio-record-stop'})},结果:result}
}
/** 原生宿主拍照（2.7.1 拍照扫描）：复用文件分块协议；用户拒绝相机权限时抛出 CameraDeniedError，界面据此提示并保留相册导入。 */
export function captureNativePhoto(): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID(), files: File[] = []
    let name = '', chunks: Uint8Array<ArrayBuffer>[] = [], reading = false, total = 0, expected: number | undefined
    const cleanup = () => { clearTimeout(timer); pending.delete(id) }
    const timer = setTimeout(() => { cleanup(); reject(new Error('拍照超时，请重新拍摄')) }, 600000)
    pending.set(id, event => {
      try {
        if (event.type === 'file-start') { if (reading || files.length) throw new Error('照片读取顺序无效'); name = event.name || 'photo.jpg'; chunks = []; reading = true; expected = event.size }
        else if (event.type === 'chunk') {
          if (!reading) throw new Error('照片读取尚未开始')
          const chunk = mediaChunk(event.data); total += chunk.length
          if (total > 100 * 1024 * 1024) throw new Error('照片超过 100 MiB，无法导入')
          chunks.push(chunk)
        } else if (event.type === 'file-end') {
          if (!reading || !total || (expected !== undefined && expected !== total)) throw new Error('照片数据不完整，请重新拍摄')
          const type = 图片格式(Buffer.concat(chunks, Math.min(total, 128)))
          if (!type) throw new Error('系统相机返回的文件无法识别，请重新拍摄')
          const ext = type === 'image/jpeg' ? 'jpg' : type.slice(6)
          files.push(new File(chunks, name.replace(/\.[^.]*$/, '') + '.' + ext, { type }))
          chunks = []; reading = false
        }
        else if (event.type === 'end' || event.type === 'cancel') { if (event.type === 'end' && reading) throw new Error('照片读取未完成，请重新拍摄'); cleanup(); resolve(event.type === 'cancel' ? [] : files) }
        else if (event.type === 'camera-denied') { cleanup(); reject(Object.assign(new Error(event.error || '未获得相机权限'), { name: 'CameraDeniedError' })) }
        else if (event.type === 'error') throw new Error(event.error || '拍照失败')
      } catch (error) { cleanup(); reject(error) }
    })
    try { send({ id, action: 'camera-capture' }) } catch (error) { cleanup(); reject(error) }
  })
}

export function prepareNativeCamera(signal: AbortSignal): Promise<void> {
  if (!window.sealNative?.cameraPreview) return Promise.reject(new DOMException('此宿主仅支持系统相机', 'NotSupportedError'))
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID()
    const cleanup = () => { pending.delete(id); clearTimeout(timer); signal.removeEventListener('abort', cancel) }
    const cancel = () => {
      cleanup()
      try { send({ id, action: 'camera-preview-cancel' }) } finally { reject(new DOMException('取景已取消', 'AbortError')) }
    }
    const timer = setTimeout(() => { cleanup(); reject(new Error('相机授权等待超时，请重试')) }, 120000)
    if (signal.aborted) { cancel(); return }
    signal.addEventListener('abort', cancel, { once: true })
    pending.set(id, event => {
      cleanup()
      if (event.type === 'camera-ready') resolve()
      else if (event.type === 'camera-denied') reject(new DOMException('未获得相机权限', 'NotAllowedError'))
      else reject(new Error(event.error || '无法准备摄像头，请重试'))
    })
    try { send({ id, action: 'camera-preview' }) } catch (error) { cleanup(); reject(error) }
  })
}

/** 系统语音界面自己申请麦克风权限；应用只接收用户确认的识别文字。 */
export function nativeSpeechInput(signal: AbortSignal): Promise<string | null> {
  return new Promise((resolve, reject) => {
    if (!window.sealNative?.speechInput) { reject(new Error('当前设备没有系统语音识别服务')); return }
    if (signal.aborted) { resolve(null); return }
    const id = crypto.randomUUID()
    const cleanup = () => { pending.delete(id); signal.removeEventListener('abort', cancel) }
    const cancel = () => {
      cleanup()
      try { send({ id, action: 'speech-input-cancel' }) } catch { /* 原生工作台已退出。 */ }
      resolve(null)
    }
    signal.addEventListener('abort', cancel, { once: true })
    pending.set(id, event => {
      cleanup()
      if (event.type === 'cancel') resolve(null)
      else if (event.type === 'speech-text' && typeof event.value === 'string' && event.value.trim()) resolve(event.value.trim())
      else reject(new Error(event.error || '系统未返回转写文字，请重新录音'))
    })
    try { send({ id, action: 'speech-input' }) } catch (error) { cleanup(); reject(error) }
  })
}
export async function platformFetch(input: string | URL | Request, options: RequestInit = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  if (window.sealNative && /^https?:\/\//i.test(url)) return nativeFetch(url, options)
  const mapped = url.startsWith('https://seal.xingmasoft.com/api/') && /^https?:$/.test(location.protocol) ? location.origin + '/api/' + url.slice('https://seal.xingmasoft.com/api/'.length) : url
  return browserFetch(mapped, options)
}
export async function downloadFile(name: string, bytes: Uint8Array, mime = exportMime(name), action: 'save' | 'print' = 'save') {
  if (window.sealNative) {
    await new Promise<void>((resolve, reject) => {
      const id = crypto.randomUUID()
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(action === 'print' ? '打开打印界面超时，请重试' : '导出超时，请重试')) }, 180000)
      pending.set(id, (event) => { clearTimeout(timer); pending.delete(id); if (event.type === (action === 'print' ? 'printed' : 'saved')) resolve(); else if (event.type === 'cancel') reject(new DOMException('已取消保存', 'AbortError')); else reject(new Error(event.error || '导出失败')) })
      try { send({ id, action, name, data: Buffer.from(bytes).toString('base64'), mime }) } catch (error) { clearTimeout(timer); pending.delete(id); reject(error) }
    })
    return
  }
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime })), anchor = document.createElement('a')
  anchor.href = url; anchor.download = name; anchor.rel = 'noopener'; document.body.appendChild(anchor); anchor.click(); anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

/** 静态资源在原生包内通过宿主读取，避免 file:// 的 fetch 限制。 */
export async function readBundledFont(family: 'sans' | 'serif' = 'sans'): Promise<Uint8Array> {
  const filename = family === 'serif' ? 'NotoSerifCJKsc-Regular.otf' : 'NotoSansSC.ttf'
  // ArkWeb allows access to bundled resources but fetch(file://) does not work
  // consistently. XHR reads the same local resource without hundreds of evalJS
  // callbacks containing a 24 MB Base64 font. Retain the native reader fallback.
  if (location.protocol === 'file:' || location.protocol === 'resource:') {
    try {
      return await new Promise<Uint8Array>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('GET', new URL('./fonts/' + filename, document.baseURI).href)
        xhr.responseType = 'arraybuffer'
        xhr.timeout = 10000
        xhr.onload = () => xhr.response instanceof ArrayBuffer && xhr.response.byteLength > 0 && (xhr.status === 0 || xhr.status === 200)
          ? resolve(new Uint8Array(xhr.response)) : reject(new Error('包内中文字体读取失败'))
        xhr.onerror = xhr.ontimeout = () => reject(new Error('包内中文字体读取失败'))
        xhr.send()
      })
    } catch (error) { if (!window.sealNative) throw error }
  }
  if (!window.sealNative) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 180000)
    try {
      const response = await browserFetch('./fonts/' + filename, { signal: controller.signal })
      if (!response.ok) throw new Error('中文字体加载失败，请重新构建应用资源')
      return new Uint8Array(await response.arrayBuffer())
    } catch (error) { if (controller.signal.aborted) throw new Error('中文字体下载超时，请检查网络后重试'); throw error }
    finally { clearTimeout(timer) }
  }
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID(), parts: Uint8Array[] = []
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('本地字体加载超时')) }, 60000)
    const cleanup = () => { clearTimeout(timer); pending.delete(id) }
    pending.set(id, (event) => {
      if (event.type === 'chunk') parts.push(new Uint8Array(Buffer.from(event.data ?? '', 'base64')))
      else if (event.type === 'end') { cleanup(); resolve(new Uint8Array(Buffer.concat(parts))) }
      else if (event.type === 'error') { cleanup(); reject(new Error(event.error || '中文字体加载失败')) }
    })
    try { send({ id, action: 'font', family }) } catch (error) { cleanup(); reject(error) }
  })
}
