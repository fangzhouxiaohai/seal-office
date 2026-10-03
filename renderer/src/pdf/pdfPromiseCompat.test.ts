import { describe, expect, it } from 'vitest'
import { 补齐Promise接口 } from './pdfPromiseCompat'

describe('PDF 工作线程兼容接口', () => {
  it('旧版浏览器没有 Promise.withResolvers 时仍可建立并完成任务', async () => {
    const 原定义 = Object.getOwnPropertyDescriptor(Promise, 'withResolvers')
    Object.defineProperty(Promise, 'withResolvers', { configurable: true, writable: true, value: undefined })
    try {
      补齐Promise接口()
      const 构造器 = Promise as PromiseConstructor & {
        withResolvers: <T>() => { promise: Promise<T>; resolve: (值: T) => void }
      }
      const 任务 = 构造器.withResolvers<number>()
      任务.resolve(3)
      await expect(任务.promise).resolves.toBe(3)
    } finally {
      if (原定义) Object.defineProperty(Promise, 'withResolvers', 原定义)
      else Reflect.deleteProperty(Promise, 'withResolvers')
    }
  })
})
