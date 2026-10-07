export type 可读流读取器 = {
  read: () => Promise<IteratorResult<unknown>>
  cancel?: (原因?: unknown) => Promise<unknown>
}

export type 兼容可读流原型 = {
  getReader?: () => 可读流读取器
  [Symbol.asyncIterator]?: () => AsyncIterator<unknown>
}

/** 用 getReader 补出等价的异步迭代接口，返回是否实际补齐 */
export function 安装异步迭代(原型: 兼容可读流原型): boolean {
  if (typeof Symbol.asyncIterator !== 'symbol') return false
  if (typeof 原型[Symbol.asyncIterator] === 'function' || typeof 原型.getReader !== 'function') return false
  原型[Symbol.asyncIterator] = function (this: { getReader: () => 可读流读取器 }): AsyncIterator<unknown> {
    const 读取器 = this.getReader()
    const 迭代器: AsyncIterator<unknown> & AsyncIterable<unknown> = {
      next: () => 读取器.read(),
      return: async () => {
        try { await 读取器.cancel?.() } catch { /* 流已结束或已释放，忽略 */ }
        return { done: true, value: undefined }
      },
      [Symbol.asyncIterator]() { return this },
    }
    return 迭代器
  }
  return true
}

/**
 * pdfjs 6 的 getTextContent 用 for await 遍历文本流，
 * 而 Electron 25（Chromium 114）的 ReadableStream 还没有 Symbol.asyncIterator，
 * 缺少时取 PDF 文字层会抛出「is not async iterable」，整页预览随之失败。
 * 阅读器主线程与工作线程都需要这个接口。
 */
export function 补齐流接口(): void {
  if (typeof ReadableStream === 'undefined') return
  安装异步迭代(ReadableStream.prototype as unknown as 兼容可读流原型)
}
