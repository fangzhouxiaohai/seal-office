let handler: ((id?:string) => Promise<void>) | null = null
/** 关闭前把最新改动落入本机加密队列，网络失败不阻止本地备份。 */
export function registerCloudFlush(flush: (id?:string) => Promise<void>) {
  handler = flush
  return () => { if (handler === flush) handler = null }
}
export async function flushCloudBeforeClose(id?:string) { await handler?.(id) }
