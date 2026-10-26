import { Buffer } from 'buffer'
import { exportMime } from './fileTypes'

type NativeEvent = { id: string; type: string; status?: number; headers?: Record<string, string>; data?: string; error?: string; path?: string; name?: string; size?: number; fonts?: unknown[] }
type Bridge = { token: string; platform: string }
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
    const id = crypto.randomUUID(), headers = Object.fromEntries(new Headers(options.headers)), chunks: Uint8Array[] = []
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
      let stream = new Headers(options.headers).get('accept')?.includes('event-stream') ?? false
      if (body) { try { stream ||= JSON.parse(body.toString()).stream === true } catch { /* 二进制与表单请求不使用 SSE */ } }
      streaming = stream; resetTimeout()
      send({ id, action: 'request', url, method: options.method ?? 'GET', headers, body: body?.toString('base64'), stream })
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
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID(), files: File[] = []
    let name = '', chunks: Uint8Array[] = [], total = 0, aggregate = 0, reading = false
    const cleanup = () => { clearTimeout(timer); pending.delete(id) }
    const timer = setTimeout(() => { cleanup(); reject(new Error('文件选择超时，请重新选择')) }, 180000)
    pending.set(id, event => {
      try {
        if (event.type === 'file-start') {
          if (reading || files.length >= 20) throw new Error('文件读取顺序无效或数量超过上限')
          name = event.name || '文档'; chunks = []; total = 0; reading = true
        }
        else if (event.type === 'chunk') {
          if (!reading) throw new Error('文件读取尚未开始')
          const chunk = new Uint8Array(Buffer.from(event.data ?? '', 'base64'))
          total += chunk.length; aggregate += chunk.length
          if (aggregate > 100 * 1024 * 1024) throw new Error('一次导入的文件总大小不能超过 100 MiB')
          chunks.push(chunk)
        } else if (event.type === 'file-end') {
          if (!reading) throw new Error('文件读取尚未开始')
          files.push(new File(chunks.map(chunk => new Uint8Array(chunk)), name)); chunks = []; reading = false
        } else if (event.type === 'end' || event.type === 'cancel') {
          if (event.type === 'end' && reading) throw new Error('文件读取未完成，请重新选择')
          cleanup(); resolve(event.type === 'cancel' ? [] : files)
        }
        else if (event.type === 'error') throw new Error(event.error || '文件读取失败')
      } catch (error) { cleanup(); reject(error) }
    })
    try { send({ id, action: 'pick-files', multiple }) } catch (error) { cleanup(); reject(error) }
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
