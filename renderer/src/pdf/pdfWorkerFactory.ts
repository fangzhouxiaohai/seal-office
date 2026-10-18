import type { DocumentInitParameters } from 'pdfjs-dist/types/src/display/api'
import workerUrl from './pdfWorker.ts?worker&url'

export function 创建PDF线程(pdfjs: typeof import('pdfjs-dist/legacy/build/pdf.mjs')): { options: Pick<DocumentInitParameters, 'worker'>; release: () => void } {
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  return { options: {}, release: () => {} }
}
