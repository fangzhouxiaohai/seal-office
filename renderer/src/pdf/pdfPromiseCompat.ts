type 兼容Promise构造器 = PromiseConstructor & {
  withResolvers?: <T>() => {
    promise: Promise<T>
    resolve: (value: T | PromiseLike<T>) => void
    reject: (reason?: unknown) => void
  }
}

/** 阅读器主线程和工作线程均需要此接口，旧版 Chromium 尚未内置。 */
export function 补齐Promise接口(): void {
  const 构造器 = Promise as 兼容Promise构造器
  if (typeof 构造器.withResolvers === 'function') return
  构造器.withResolvers = <T>() => {
    let resolve!: (value: T | PromiseLike<T>) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((完成, 失败) => {
      resolve = 完成
      reject = 失败
    })
    return { promise, resolve, reject }
  }
}
