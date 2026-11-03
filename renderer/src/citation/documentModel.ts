// 文档级引文模型：在编辑区 HTML 里维护引文域与参考文献表域。
//
// 设计要点：域由「不可编辑的原子节点 + 属性里的域代码」表示。
// 可见文字只是缓存，域代码才是数据来源；因此换样式、删引文、刷新时
// 只需要读回全部域代码、按文档顺序重排、再写回可见文字，不会丢信息。

import { 创建引文引擎 } from './engine'
import { 解析域代码, 序列化书目域, 序列化引文域, 提取可见文字, type 书目域数据 } from './fieldCode'
import type { Csl条目, 引文簇引用, 引文样式, 渲染结果, 书目条目 } from './types'

/** 引文域节点属性名，与主进程 docx 读写端保持一致 */
export const 引文域属性 = 'data-seal-citation'
export const 引文域代码属性 = 'data-seal-citation-code'
/** 参考文献表域节点属性名 */
export const 书目域属性 = 'data-seal-bibliography'
export const 书目域代码属性 = 'data-seal-bibliography-code'

/** 文档中的一个域节点 */
export interface 域节点 {
  元素: HTMLElement
  代码: string
}

/** 读取文档中的全部引文域，按文档顺序 */
export function 收集引文域(根: ParentNode): 域节点[] {
  const 结果: 域节点[] = []
  for (const 元素 of Array.from(根.querySelectorAll<HTMLElement>(`[${引文域属性}]`))) {
    const 代码 = 元素.getAttribute(引文域代码属性) ?? ''
    结果.push({ 元素, 代码 })
  }
  return 结果
}

/** 读取文档中的全部参考文献表域，按文档顺序 */
export function 收集书目域(根: ParentNode): 域节点[] {
  const 结果: 域节点[] = []
  for (const 元素 of Array.from(根.querySelectorAll<HTMLElement>(`[${书目域属性}]`))) {
    const 代码 = 元素.getAttribute(书目域代码属性) ?? ''
    结果.push({ 元素, 代码 })
  }
  return 结果
}

/** 按文档顺序解析出全部引文簇；无法解析的域单独返回，供界面如实提示 */
export function 读取引文簇(根: ParentNode): { 簇: 引文簇引用[]; 异常: Array<{ 代码: string; 原因: string }> } {
  const 簇: 引文簇引用[] = []
  const 异常: Array<{ 代码: string; 原因: string }> = []
  for (const { 代码 } of 收集引文域(根)) {
    const 解析 = 解析域代码(代码)
    if (解析.类别 === '引文') 簇.push({ ...解析.簇, citationID: 解析.簇.citationID || `cluster-${簇.length + 1}` })
    else 异常.push({ 代码, 原因: 解析.类别 === '未知' ? 解析.原因 : '域类型不匹配' })
  }
  return { 簇, 异常 }
}

/** 文档里出现过的全部文献键，用于向引擎注册条目 */
export function 收集引用键(簇列表: 引文簇引用[]): string[] {
  const 集合 = new Set<string>()
  for (const 簇 of 簇列表) for (const 项 of 簇.citationItems) 集合.add(项.id)
  return [...集合]
}

function 转义属性(值: string): string {
  return 值
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 生成一个引文域节点的 HTML */
export function 生成引文域Html(簇: 引文簇引用, 文字: string): string {
  const 代码 = 序列化引文域(簇)
  return `<span class="seal-citation-field" contenteditable="false" ${引文域属性}="${转义属性(簇.citationID)}" ${引文域代码属性}="${转义属性(代码)}">${文字}</span>`
}

/** 生成一个参考文献表域节点的 HTML；条目文字由 citeproc 给出，已含上下标等标记 */
export function 生成书目域Html(条目列表: 书目条目[], 数据: 书目域数据 = {}): string {
  const 代码 = 序列化书目域(数据)
  const 行 = 条目列表
    .map((条目) => {
      const 编号 = 条目.编号文字 ? `<span class="seal-bibliography-number">${条目.编号文字}</span>` : ''
      return `<p class="seal-bibliography-entry">${编号}${条目.文字}</p>`
    })
    .join('')
  return `<div class="seal-bibliography-field" contenteditable="false" ${书目域属性}="1" ${书目域代码属性}="${转义属性(代码)}"><p class="seal-bibliography-title">参考文献</p>${行}</div>`
}

/** 刷新结果：写回了多少个域、跳过了哪些、书目是否已生成 */
export interface 刷新结果 {
  引文数: number
  书目数: number
  异常: Array<{ 代码: string; 原因: string }>
  渲染: 渲染结果
}

/**
 * 按当前样式重排整篇文档的引文与参考文献表。
 *
 * 只改写域节点的可见内容与代码，不动其它正文，因此可以安全地在每次
 * 插入、删除、换样式后调用。
 */
export function 刷新文档域(
  根: ParentNode,
  { 样式, 语言, 条目 }: { 样式: 引文样式; 语言: string; 条目: Record<string, Csl条目> },
): 刷新结果 {
  const { 簇, 异常 } = 读取引文簇(根)
  if (簇.length === 0) {
    // 没有引文时仍要清空旧书目，避免残留上一次的参考文献表
    for (const { 元素 } of 收集书目域(根)) 元素.remove()
    return { 引文数: 0, 书目数: 0, 异常, 渲染: { 引文: [], 书目: [] } }
  }

  const 引擎 = 创建引文引擎({ 样式, 语言, 条目 })
  const 渲染 = 引擎.渲染(簇)
  const 文字表 = new Map(渲染.引文.map((项) => [项.标识, 项.文字]))

  for (const { 元素, 代码 } of 收集引文域(根)) {
    const 解析 = 解析域代码(代码)
    if (解析.类别 !== '引文') continue
    const 标识 = 解析.簇.citationID || ''
    const 文字 = 文字表.get(标识)
    if (文字 === undefined) continue
    元素.innerHTML = 文字
  }

  const 书目域列表 = 收集书目域(根)
  if (书目域列表.length > 0) {
    const 数据 = (() => {
      const 解析 = 解析域代码(书目域列表[0].代码)
      return 解析.类别 === '书目' ? 解析.数据 : {}
    })()
    const html = 生成书目域Html(渲染.书目, 数据)
    const 模板 = document.createElement('div')
    模板.innerHTML = html
    const 新节点 = 模板.firstElementChild as HTMLElement | null
    if (新节点) {
      // 保留原节点的全部属性（含用户可能加的样式），只替换代码与内容。
      // class 需要合并而不是覆盖，否则用户加的样式类会丢失。
      for (const 属性 of Array.from(书目域列表[0].元素.attributes)) {
        if (属性.name === 'class') {
          for (const 类名 of 属性.value.split(/\s+/).filter(Boolean)) 新节点.classList.add(类名)
        } else if (!新节点.hasAttribute(属性.name)) {
          新节点.setAttribute(属性.name, 属性.value)
        }
      }
      书目域列表[0].元素.replaceWith(新节点)
    }
  }

  return { 引文数: 簇.length, 书目数: 书目域列表.length, 异常, 渲染 }
}

/**
 * 取消链接：删除域代码，把引文与参考文献表变成普通文字。
 * 与 Zotero 的「取消链接引注」语义一致，不可逆，因此调用方必须先提示用户另存副本。
 */
export function 取消链接(根: ParentNode): number {
  let 数量 = 0
  for (const 元素 of Array.from(根.querySelectorAll<HTMLElement>(`[${引文域属性}], [${书目域属性}]`))) {
    元素.removeAttribute(引文域属性)
    元素.removeAttribute(引文域代码属性)
    元素.removeAttribute(书目域属性)
    元素.removeAttribute(书目域代码属性)
    元素.removeAttribute('contenteditable')
    元素.classList.remove('seal-citation-field', 'seal-bibliography-field')
    if (元素.tagName === 'DIV') {
      // 参考文献表转为普通段落，便于用户继续排版
      const 容器 = document.createElement('div')
      容器.innerHTML = 元素.innerHTML
      const 片段 = document.createDocumentFragment()
      for (const 子 of Array.from(容器.childNodes)) 片段.appendChild(子)
      元素.replaceWith(片段)
    }
    数量 += 1
  }
  return 数量
}

/** 新建一个引文簇，citationID 用递增序号保证文档内唯一 */
export function 新建引文簇(现有: 引文簇引用[], citationItems: 引文簇引用['citationItems']): 引文簇引用 {
  const 已用 = new Set(现有.map((簇) => 簇.citationID))
  let 序号 = 现有.length + 1
  while (已用.has(`c${序号}`)) 序号 += 1
  return { citationID: `c${序号}`, citationItems, properties: { noteIndex: 0 } }
}

/** 把文献库条目转成引擎可直接使用的映射，保持文档内 id 稳定 */
export function 建立条目表(列表: Csl条目[]): Record<string, Csl条目> {
  const 表: Record<string, Csl条目> = {}
  for (const 条目 of 列表) 表[条目.id] = 条目
  return 表
}

/** 引文域节点的可见文字，供纯文本导出与 docx 缓存结果使用 */
export function 读取引文可见文字(根: ParentNode): string[] {
  return 收集引文域(根).map(({ 元素 }) => 提取可见文字(元素.innerHTML))
}
