import type { 文件读取结果 } from './ipc/bridge'
import type { Sheet } from './sheet/model'

export type ReadStage = { stage: 'read'|'parse'|'sheets'|'screen'; done?: number; total?: number }
export interface DocumentReader {
  size: (path: string) => Promise<number>
  read: (path: string, id: string, update: (p: ReadStage) => void) => Promise<文件读取结果>
  cancel: (id: string) => Promise<unknown>
}
export const needsBackgroundRead = (size: number) => size > 5_000_000
export const preparedSnapshots = new WeakMap<Sheet[], string>()
export const progressEvent = 'seal-document-open-progress'
export const openJobs = new Map<string, OpenJob>()
export type OpenJob = ReturnType<typeof makeJob>
const publish = () => window.dispatchEvent(new Event(progressEvent))

function makeJob(path: string, size: number, backend: DocumentReader) {
  const id = crypto.randomUUID(), controller = new AbortController()
  let state: ReadStage = { stage: 'read', done: 0, total: size }
  const finish = () => { openJobs.delete(id); publish() }
  return { id, path, backend, signal: controller.signal, get state() { return state },
    update: (s: ReadStage) => { if (openJobs.has(id)) { state = s; publish() } },
    finish, cancel: () => { controller.abort(); void backend.cancel(id).catch(() => {}); finish() },
  }
}
export async function beginOpen(path: string) {
  const backend = window.electronAPI?.documentRead
  if (!backend) return
  const size = await backend.size(path)
  return trackOpen(path, size, backend)
}
export function trackOpen(path: string, size: number, backend: DocumentReader) {
  if (!needsBackgroundRead(size)) return
  const job = makeJob(path, size, backend)
  openJobs.set(job.id, job); publish()
  return job
}
export function afterPaint(fn: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(fn))
}
export function pdfFirstPageReady(path?: string | null) {
  for (const job of openJobs.values()) if (job.path === path && job.state.stage === 'screen') afterPaint(job.finish)
}

export async function prepareModel(job: OpenJob, input: unknown) {
  const { default: ModelWorker } = await import('./sheet/openModelWorker?worker&inline')
  job.signal.throwIfAborted()
  return new Promise<{ sheets: Sheet[]; loss: string[]; html?: string }>((resolve, reject) => {
    const worker = new ModelWorker()
    const close = () => { worker.terminate(); job.signal.removeEventListener('abort', aborted) }
    const aborted = () => { close(); reject(new DOMException('已取消打开', 'AbortError')) }
    job.signal.addEventListener('abort', aborted, { once: true })
    worker.onmessage = e => {
      if (e.data.stage) job.update(e.data)
      else {
        close()
        if (e.data.error) reject(new Error(e.data.error))
        else {
          if (e.data.result.sheets) preparedSnapshots.set(e.data.result.sheets, e.data.result.snapshot)
          resolve(e.data.result)
        }
      }
    }
    worker.onerror = e => { close(); reject(new Error(e.message || '后台解析失败')) }
    worker.postMessage(input)
  })
}
