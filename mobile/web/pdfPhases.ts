type Clock = { set: (callback: () => void, milliseconds: number) => ReturnType<typeof setTimeout>; clear: (id: ReturnType<typeof setTimeout>) => void }
const clock: Clock = { set: (callback, milliseconds) => setTimeout(callback, milliseconds), clear: id => clearTimeout(id) }
async function deadline<T>(work: Promise<T>, milliseconds: number, message: string, scheduler: Clock): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = scheduler.set(() => reject(new Error(message)), milliseconds) })]) }
  finally { if (timer !== undefined) scheduler.clear(timer) }
}
/** Network/module/font preparation has its own bounded deadline; layout keeps its original 60-second budget. */
export async function runPdfPhases<T>(prepare: () => Promise<() => Promise<T>>, scheduler: Clock = clock): Promise<T> {
  const render = await deadline(prepare(), 180000, 'PDF 资源加载超时，请检查网络后重试', scheduler)
  return deadline(render(), 60000, 'PDF 生成超时，请缩小文档后重试', scheduler)
}
