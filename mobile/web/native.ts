import { Buffer } from 'buffer'
import { exportMime } from './fileTypes'

type NativeEvent = { id: string; type: string; status?: number; headers?: Record<string, string>; data?: string; error?: string; path?: string }
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
  if (window.sealNative) return
  await new Promise<void>((resolve, reject) => {
    const ready = () => { clearTimeout(timer); resolve() }
    const timer = setTimeout(() => { window.removeEventListener('seal-native-ready', ready); reject(new Error('原生接口初始化超时，请重新打开应用')) }, 15000)
    window.addEventListener('seal-native-ready', ready, { once: true })
  })
}
export function nativeFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(new DOMException('已停止', 'AbortError')); return }
    const id = crypto.randomUUID(), headers = Object.fromEntries(new Headers(options.headers)), chunks: Uint8Array[] = []
    let controller: ReadableStreamDefaultController<Uint8Array>, delivered = false, started = false, finished = false
    const cleanup = () => { pending.delete(id); options.signal?.removeEventListener('abort', abort) }
    const begin = (status = 200, responseHeaders: Record<string, string> = {}) => {
      if (started) return
      started = true
      if ([204, 205, 304].includes(status)) resolve(new Response(null, { status, headers: responseHeaders }))
      else resolve(new Response(new ReadableStream<Uint8Array>({ start(c) { controller = c; for (const chunk of chunks) c.enqueue(chunk) }, cancel() { abort() } }), { status, headers: responseHeaders }))
    }
    const abort = () => {
      if (finished) return
      finished = true
      try { send({ id, action: 'abort' }) } catch { /* 宿主可能已退出 */ }
      cleanup(); const error = new DOMException('已停止', 'AbortError')
      if (started) controller?.error(error); else reject(error)
    }
    pending.set(id, (event) => {
      if (event.type === 'headers') begin(event.status, event.headers)
      else if (event.type === 'chunk') {
        delivered = true; const chunk = new Uint8Array(Buffer.from(event.data ?? '', 'base64'))
        if (started) controller?.enqueue(chunk); else chunks.push(chunk)
      } else if (event.type === 'end') {
        begin(event.status, event.headers)
        if (!delivered && event.data) controller?.enqueue(new Uint8Array(Buffer.from(event.data, 'base64')))
        finished = true; controller?.close(); cleanup()
      } else if (event.type === 'error') {
        finished = true; cleanup(); const error = new Error(event.error || '网络请求失败')
        if (started) controller?.error(error); else reject(error)
      }
    })
    options.signal?.addEventListener('abort', abort, { once: true })
    try {
      const body = options.body == null ? undefined : typeof options.body === 'string' ? Buffer.from(options.body) : Buffer.from(options.body as Uint8Array)
      let stream = new Headers(options.headers).get('accept')?.includes('event-stream') ?? false
      if (body) { try { stream ||= JSON.parse(body.toString()).stream === true } catch { /* 二进制与表单请求不使用 SSE */ } }
      send({ id, action: 'request', url, method: options.method ?? 'GET', headers, body: body?.toString('base64'), stream })
    } catch (error) { cleanup(); reject(error) }
  })
}
const browserFetch = window.fetch.bind(window)
export async function platformFetch(input: string | URL | Request, options: RequestInit = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  if (window.sealNative && /^https?:\/\//i.test(url)) return nativeFetch(url, options)
  const mapped = url.startsWith('https://seal.xingmasoft.com/api/') && /^https?:$/.test(location.protocol) ? location.origin + '/api/' + url.slice('https://seal.xingmasoft.com/api/'.length) : url
  return browserFetch(mapped, options)
}
export async function downloadFile(name: string, bytes: Uint8Array, mime = exportMime(name)) {
  if (window.sealNative) {
    await new Promise<void>((resolve, reject) => {
      const id = crypto.randomUUID()
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('导出超时，请重试')) }, 60000)
      pending.set(id, (event) => { clearTimeout(timer); pending.delete(id); if (event.type === 'saved') resolve(); else reject(new Error(event.error || '导出失败')) })
      try { send({ id, action: 'save', name, data: Buffer.from(bytes).toString('base64'), mime }) } catch (error) { clearTimeout(timer); pending.delete(id); reject(error) }
    })
    return
  }
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime })), anchor = document.createElement('a')
  anchor.href = url; anchor.download = name; anchor.rel = 'noopener'; document.body.appendChild(anchor); anchor.click(); anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

/** 静态资源在原生包内通过宿主读取，避免 file:// 的 fetch 限制。 */
export async function readBundledFont(): Promise<Uint8Array> {
  if (!window.sealNative) {
    const response = await browserFetch('./fonts/NotoSansSC.ttf')
    if (!response.ok) throw new Error('中文字体加载失败，请重新构建应用资源')
    return new Uint8Array(await response.arrayBuffer())
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
    try { send({ id, action: 'font' }) } catch (error) { cleanup(); reject(error) }
  })
}
