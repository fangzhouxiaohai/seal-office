import type { PDFDocumentProxy } from 'pdfjs-dist'
import { 创建PDF线程 } from './pdfWorkerFactory'
import { 补齐Promise接口 } from './pdfPromiseCompat'
import { 补齐流接口 } from './pdfStreamCompat'

type PDF加载结果 = { 文档: PDFDocumentProxy; 关闭: () => void }

/** 从本地文件的 Base64 内容生成独立字节数组，供阅读器交给工作线程。 */
export function 解码PDF数据(数据: string): Uint8Array {
  const 二进制 = atob(数据)
  const 字节 = new Uint8Array(二进制.length)
  for (let 索引 = 0; 索引 < 二进制.length; 索引 += 1) {
    字节[索引] = 二进制.charCodeAt(索引)
  }
  return 字节
}

export async function 载入PDF(数据: string): Promise<PDF加载结果> {
  补齐Promise接口()
  补齐流接口()
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const 线程 = 创建PDF线程(pdfjs)
  let 任务: ReturnType<typeof pdfjs.getDocument> | undefined, 关闭中 = false
  const 关闭 = () => {
    if (关闭中) return
    关闭中 = true
    void Promise.resolve(任务?.destroy()).catch(() => {}).finally(线程.release)
  }
  try {
    任务 = pdfjs.getDocument({ data: 解码PDF数据(数据), useSystemFonts: true, ...线程.options })
    const 文档 = await 任务.promise
    return { 文档, 关闭 }
  } catch (错误) {
    关闭()
    throw 错误
  }
}
