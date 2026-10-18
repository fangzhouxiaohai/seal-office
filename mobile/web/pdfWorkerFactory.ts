import type { DocumentInitParameters } from 'pdfjs-dist/types/src/display/api'
import LocalPdfWorker from './pdfWorker.ts?worker&inline'

/** A port belongs to one loading task, never to the whole application. A second
 * document must not reuse a port whose previous task is still being destroyed. */
export function 创建PDF线程(pdfjs: typeof import('pdfjs-dist/legacy/build/pdf.mjs')): { options: Pick<DocumentInitParameters, 'worker'>; release: () => void } {
  const port = new LocalPdfWorker()
  try {
    // The distributed 6.x declaration infers port as null although the runtime
    // explicitly supports Worker ports. Keep the mismatch at this API boundary.
    const worker = new pdfjs.PDFWorker({ port } as unknown as ConstructorParameters<typeof pdfjs.PDFWorker>[0])
    return { options: { worker }, release: () => { worker.destroy(); port.terminate() } }
  } catch (error) { port.terminate(); throw error }
}
