// CSL 排版引擎封装。
//
// 为什么必须本地排版而不是逐个问 Zotero：
// 数字型样式的引文编号取决于全文档引文出现顺序，Local API 的 format=bib
// 只对传入条目单独渲染，编号会从 1 重新开始，拼起来必然错号；
// 删除中间一条引文后，后续编号与书目顺序也只有在掌握全文档上下文时才能算对。
//
// 引擎使用 citeproc-js（与 Zotero 自身同源，CPAL-1.0），
// 中文双语样式依赖它的 CSL-M 扩展能力，因此不替换为其他实现。
import CSL from 'citeproc'
import type { Csl条目, 引文簇引用, 引文样式, 渲染结果 } from './types'
import { 内置语言包, 取内置样式 } from './styles'

/** 引擎输入：样式、语言、可用条目 */
export interface 引文引擎输入 {
  样式: 引文样式
  /** 语言标识，必须是内置语言包或用户导入语言包中的键 */
  语言: string
  /** 文档内全部文献，键为 CSL 条目 id */
  条目: Record<string, Csl条目>
  /** 用户导入的额外语言包，覆盖内置同名项 */
  语言包?: Record<string, string>
}

export interface 引文引擎 {
  样式: 引文样式
  语言: string
  /** 按文档顺序重排全部引文，并给出整篇书目 */
  渲染: (簇列表: 引文簇引用[]) => 渲染结果
  /** 仅渲染单个簇，用于插入时的即时预览；不含书目 */
  预览: (簇: 引文簇引用) => string
}

/** 任意 citeproc 异常都转成中文提示，不把英文栈抛给用户 */
function 排版失败(原因: unknown): never {
  const 细节 = 原因 instanceof Error ? 原因.message : String(原因)
  throw new Error(`引文排版失败，请检查样式与文献信息是否完整（${细节}）`)
}

function 清理富文本(片段: string): string {
  return 片段
    .replace(/\s*\n\s*/g, ' ')
    .replace(/>\s+</g, '><')
    .trim()
}

/**
 * citeproc 的书目段落固定包一层 csl-entry，这里剥掉以复用编辑区段落。
 *
 * 真机（Zotero 10.0.7）对照发现：citeproc 输出里 csl-entry 与 csl-left-margin
 * 都带 `style` 属性，且正文另外包在 `<div class="csl-right-inline">` 里。
 * 早期实现只按无属性的 `<div class="csl-entry">` 匹配，导致两处都剥不掉，
 * 书目正文会带着块级 div 写进段落，插入后打断排版。
 * 因此这里不以属性为准，统一按 div 标签名剥除，只保留行内标签（如 i、span）。
 */
function 取书目正文(条目html: string): string {
  return 清理富文本(
    条目html
      .replace(/<div\b[^>]*>/gi, '')
      .replace(/<\/div>/gi, ' '),
  ).replace(/\s+([，。；：、）》】])/g, '$1')
}

/** 左侧编号列（如 [1]）单独取出，交给书目渲染排版 */
function 取书目编号(条目html: string): string {
  // 同样不能假设标签无属性：真实输出是 <div class="csl-left-margin" style="...">
  const 匹配 = /<div\b[^>]*\bcsl-left-margin\b[^>]*>([\s\S]*?)<\/div>/i.exec(条目html)
  return 匹配 ? 清理富文本(匹配[1]).replace(/<[^>]+>/g, '').trim() : ''
}

/**
 * 创建引文引擎。
 * 每次渲染都会重建 citeproc 状态，因此删除引文后编号与书目会自动重排。
 */
export function 创建引文引擎({ 样式, 语言, 条目, 语言包 }: 引文引擎输入): 引文引擎 {
  const 语言表 = { ...内置语言包, ...(语言包 ?? {}) }
  const 采用语言 = 语言表[语言] ? 语言 : 'en-US'

  const 引擎 = new CSL.Engine(
    {
      retrieveLocale: (标识: string) => 语言表[标识] ?? 语言表['en-US'],
      retrieveItem: (id: string) => {
        const 条目项 = 条目[id]
        if (!条目项) throw new Error(`引文排版失败，文献 ${id} 不在文档文献库中`)
        return 条目项 as unknown as Record<string, unknown>
      },
    },
    样式.内容,
    采用语言,
    true,
  )
  // 数字样式与双语样式都依赖 citeproc 的附加能力，统一开启，行为与 Zotero 一致。
  ;(引擎.opt as Record<string, Record<string, unknown>>).development_extensions.csl_reverse_lookup_support = true
  引擎.setOutputFormat('html')

  const 转引用 = (簇: 引文簇引用) => 簇.citationItems.map((项) => {
    const 引用: Record<string, unknown> = { id: 项.id }
    if (项.locator) 引用.locator = 项.locator
    if (项.label) 引用.label = 项.label
    if (项.prefix) 引用.prefix = 项.prefix
    if (项.suffix) 引用.suffix = 项.suffix
    if (项['suppress-author']) 引用['suppress-author'] = true
    if (项['author-only']) 引用['author-only'] = true
    return 引用
  })

  return {
    样式,
    语言: 采用语言,
    预览(簇) {
      try {
        const 全部 = new Set<string>()
        for (const 项 of 簇.citationItems) 全部.add(项.id)
        引擎.updateItems([...全部])
        return 清理富文本(引擎.makeCitationCluster(转引用(簇)))
      } catch (错误) {
        排版失败(错误)
      }
    },
    渲染(簇列表) {
      if (簇列表.length === 0) return { 引文: [], 书目: [] }
      try {
        // rebuildProcessorState 会按传入顺序重排全部簇，是 citeproc 的全文档刷新入口。
        const 结果 = 引擎.rebuildProcessorState(
          簇列表.map((簇) => ({
            citationID: 簇.citationID,
            citationItems: 转引用(簇),
            properties: { noteIndex: 簇.properties?.noteIndex ?? 0 },
          })),
          'html',
        )
        const 引文 = 结果.map(([标识, , 文字]) => ({ 标识, 文字: 清理富文本(文字) }))
        const 书目结果 = 引擎.makeBibliography()
        const 书目 = 书目结果
          ? 书目结果[1].map((条目html, 下标) => ({
              序号: 下标 + 1,
              标识: 书目结果[0].entry_ids[下标]?.[0] ?? String(下标 + 1),
              文字: 取书目正文(条目html),
              编号文字: 取书目编号(条目html),
            }))
          : []
        return { 引文, 书目 }
      } catch (错误) {
        排版失败(错误)
      }
    },
  }
}

/** 取样式的默认语言；样式标识不存在时回退内置默认样式 */
export function 样式语言(样式标识: string): string {
  return 取内置样式(样式标识).语言
}
