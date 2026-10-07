import { describe, expect, it } from 'vitest'
import { 补齐流接口, 安装异步迭代, type 兼容可读流原型 } from './pdfStreamCompat'

/** 造一个只有 getReader 的旧式流原型，模拟 Electron 25 的 ReadableStream */
function 造旧式原型(块列表: number[]): 兼容可读流原型 {
  const 待读 = [...块列表]
  return {
    getReader: () => ({
      read: async (): Promise<IteratorResult<unknown>> =>
        待读.length === 0 ? { done: true, value: undefined } : { done: false, value: 待读.shift() },
      cancel: async () => undefined,
    }),
  }
}

describe('PDF 文字层流兼容接口', () => {
  it('缺少异步迭代接口时按 getReader 补齐并可 for await 读取', async () => {
    const 原型 = 造旧式原型([1, 2])
    expect(安装异步迭代(原型)).toBe(true)
    const 收集: unknown[] = []
    for await (const 块 of 原型 as unknown as AsyncIterable<unknown>) {
      收集.push(块)
    }
    expect(收集).toEqual([1, 2])
  })

  it('已有异步迭代接口或缺少 getReader 时不改写', () => {
    const 已有 = { ...造旧式原型([1]), [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }) }
    expect(安装异步迭代(已有)).toBe(false)
    expect(安装异步迭代({})).toBe(false)
  })

  it('对成品运行环境的 ReadableStream 调用后可以 for await 遍历', async () => {
    补齐流接口()
    expect(typeof ReadableStream.prototype[Symbol.asyncIterator]).toBe('function')
    const 流 = new ReadableStream<number>({ start(控制器) { 控制器.enqueue(1); 控制器.enqueue(2); 控制器.close() } })
    const 收集: number[] = []
    for await (const 块 of 流 as unknown as AsyncIterable<number>) 收集.push(块)
    expect(收集).toEqual([1, 2])
  })
})
