// citeproc-js 没有类型声明，这里只声明本项目实际用到的成员，
// 避免用 any 把整个引擎的类型检查关掉。
declare module 'citeproc' {
  export interface CiteprocSys {
    retrieveLocale(lang: string): string
    retrieveItem(id: string): Record<string, unknown>
  }

  export interface 书目元数据 {
    entry_ids: string[][]
    [字段: string]: unknown
  }

  export class Engine {
    constructor(sys: CiteprocSys, style: string, lang?: string, forceLang?: boolean)
    opt: Record<string, unknown>
    setOutputFormat(format: string): void
    updateItems(ids: string[]): void
    makeCitationCluster(items: Record<string, unknown>[]): string
    makeBibliography(): [书目元数据, string[]] | false
    rebuildProcessorState(
      citations: Record<string, unknown>[],
      format: string,
      uncitedItems?: unknown,
    ): Array<[string, number, string]>
  }

  const CSL: { Engine: typeof Engine }
  export default CSL
}
