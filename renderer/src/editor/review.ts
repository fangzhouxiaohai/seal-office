// 批注与修订：以显式标记承载协作信息，接受或拒绝时按标记收敛。
//
// 说明：修订采用「显式标记」机制——插入的内容包裹为 .wps-insert，
// 删除的内容包裹为 .wps-delete，由用户显式执行接受或拒绝来收敛。
// 仅在用户明确开启修订模式后记录输入；导入的作者、时间与标识随模型保存。

export interface 批注项 {
  编号: number
  内容: string
}

export interface 修订统计 {
  插入数: number
  删除数: number
}

export interface 修订结果 {
  文本: string
  /** 本次处理的修订处数 */
  修订数: number
}
export interface 修订项 { 标识: string; 类型: string; 作者: string; 时间?: string; 部件?: string; 文本: string; 组?: string }
export function 提取修订(html: string): 修订项[] {
  const doc = new DOMParser().parseFromString(html, 'text/html'), entries = new Map<string, 修订项>()
  const source = doc.querySelector<HTMLElement>('[data-seal-docx-package]')
  if (source?.dataset.sealRevisionCatalog) { try { for (const entry of JSON.parse(decodeURIComponent(source.dataset.sealRevisionCatalog)) as 修订项[]) { if (/^\d+$/.test(entry.标识) && typeof entry.类型 === 'string') entries.set(`${entry.部件}:${entry.标识}`, { ...entry, 文本: '' }) } } catch { /* The writer rejects malformed metadata; the UI still lists visible revisions. */ } }
  for (const node of Array.from(doc.querySelectorAll<HTMLElement>('[data-seal-revision-type]'))) {
    const id = node.dataset.sealRevisionId; if (!id) continue
    const part = node.dataset.sealRevisionPart || 'word/document.xml', key = `${part}:${id}`, existing = entries.get(key)
    entries.set(key, { ...existing, 标识: id, 类型: node.dataset.sealRevisionType!, 作者: node.dataset.sealRevisionAuthor || '', 时间: node.dataset.sealRevisionDate, 部件: part, 文本: (existing?.文本 || '') + (node.textContent || '') })
  }
  for (const node of Array.from(doc.querySelectorAll<HTMLElement>('[data-seal-paragraph-revision]'))) { try { const revision = JSON.parse(decodeURIComponent(node.dataset.sealParagraphRevision!)); const key = `word/document.xml:${revision.标识}`, existing = entries.get(key); entries.set(key, { ...existing, ...revision, 类型: revision.类型, 部件: 'word/document.xml', 文本: (existing?.文本 || '') + ' [段落边界]' }) } catch { /* Model validation reports invalid markers. */ } }
  for (const node of Array.from(doc.querySelectorAll<HTMLElement>('[data-seal-format-change]'))) { try { const revision = JSON.parse(decodeURIComponent(node.dataset.sealFormatChange!)); const key = `word/document.xml:${revision.标识}`, existing = entries.get(key); entries.set(key, { ...revision, 类型: 'rPrChange', 部件: 'word/document.xml', 文本: (existing?.文本 || '') + node.textContent }) } catch { /* Invalid metadata is rejected when saving. */ } }
  return [...entries.values()]
}

const 批注类名 = 'wps-comment'
const 插入类名 = 'wps-insert'
const 删除类名 = 'wps-delete'

/** 转义 HTML 属性值中的双引号与尖括号 */
function 转义属性(文本: string): string {
  return 文本
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 生成一个批注标记 */
export function 生成批注(编号: number, 内容: string): string {
  return `<span class="${批注类名}" data-编号="${编号}" title="${转义属性(内容)}">[批注 ${编号}]</span>`
}

/** 提取文档中的全部批注 */
export function 提取批注(html: string): 批注项[] {
  if (html.length === 0) {
    return []
  }
  const 文档 = new DOMParser().parseFromString(html, 'text/html')
  return Array.from(文档.body.querySelectorAll(`.${批注类名}`)).map((节点) => ({
    编号: Number.parseInt(节点.getAttribute('data-编号') ?? '0', 10),
    内容: 节点.getAttribute('title') ?? '',
  }))
}

/** 按编号删除批注，返回删除后的内容与删除处数 */
export function 删除批注(html: string, 编号: number): { 文本: string; 删除数: number } {
  if (html.length === 0) {
    return { 文本: html, 删除数: 0 }
  }
  const 文档 = new DOMParser().parseFromString(html, 'text/html')
  const 目标 = Array.from(文档.body.querySelectorAll(`.${批注类名}[data-编号="${编号}"]`))
  目标.forEach((节点) => 节点.remove())
  return { 文本: 目标.length > 0 ? 文档.body.innerHTML : html, 删除数: 目标.length }
}

export function 生成插入标记(文本: string): string {
  return `<span class="${插入类名}">${文本}</span>`
}

export function 生成删除标记(文本: string): string {
  return `<span class="${删除类名}">${文本}</span>`
}

/** 统计插入与删除标记数量 */
export function 统计修订(html: string): 修订统计 {
  if (html.length === 0) {
    return { 插入数: 0, 删除数: 0 }
  }
  const 文档 = new DOMParser().parseFromString(html, 'text/html')
  return {
    插入数: 文档.body.querySelectorAll(`.${插入类名}`).length,
    删除数: 文档.body.querySelectorAll(`.${删除类名}`).length,
  }
}

/** 把标记元素替换为其纯文本，用于接受修订 */
function 展开为文本(节点: Element, _文档: Document): void {
  节点.replaceWith(...Array.from(节点.childNodes))
}

/** 接受修订：插入内容转为正文，删除内容移除 */
export function 接受修订(html: string, 标识?: string): 修订结果 {
  if (html.length === 0) {
    return { 文本: html, 修订数: 0 }
  }
  const 文档 = new DOMParser().parseFromString(html, 'text/html')
  const 插入节点 = Array.from(文档.body.querySelectorAll(`.${插入类名},[data-seal-revision-type="ins"],[data-seal-revision-type="moveTo"]`)).filter(node => 标识 === undefined || node.getAttribute('data-seal-revision-id') === 标识 || node.getAttribute('data-seal-revision-group') === 标识)
  const 删除节点 = Array.from(文档.body.querySelectorAll(`.${删除类名},[data-seal-revision-type="del"],[data-seal-revision-type="moveFrom"]`)).filter(node => 标识 === undefined || node.getAttribute('data-seal-revision-id') === 标识 || node.getAttribute('data-seal-revision-group') === 标识)

  插入节点.forEach((节点) => 展开为文本(节点, 文档))
  删除节点.forEach((节点) => 节点.remove())
  const 边界数 = 处理段落边界(文档, 'accept', 标识)

  const 修订数 = 插入节点.length + 删除节点.length + 边界数
  return { 文本: 修订数 > 0 ? 文档.body.innerHTML : html, 修订数 }
}

/** 拒绝修订：插入内容移除，删除内容恢复为正文 */
export function 拒绝修订(html: string, 标识?: string): 修订结果 {
  if (html.length === 0) {
    return { 文本: html, 修订数: 0 }
  }
  const 文档 = new DOMParser().parseFromString(html, 'text/html')
  const 插入节点 = Array.from(文档.body.querySelectorAll(`.${插入类名},[data-seal-revision-type="ins"],[data-seal-revision-type="moveTo"]`)).filter(node => 标识 === undefined || node.getAttribute('data-seal-revision-id') === 标识 || node.getAttribute('data-seal-revision-group') === 标识)
  const 删除节点 = Array.from(文档.body.querySelectorAll(`.${删除类名},[data-seal-revision-type="del"],[data-seal-revision-type="moveFrom"]`)).filter(node => 标识 === undefined || node.getAttribute('data-seal-revision-id') === 标识 || node.getAttribute('data-seal-revision-group') === 标识)

  插入节点.forEach((节点) => 节点.remove())
  删除节点.forEach((节点) => 展开为文本(节点, 文档))
  const 边界数 = 处理段落边界(文档, 'reject', 标识)

  const 修订数 = 插入节点.length + 删除节点.length + 边界数
  return { 文本: 修订数 > 0 ? 文档.body.innerHTML : html, 修订数 }
}
function 处理段落边界(doc: Document, action: 'accept' | 'reject', id?: string) {
  let count = 0
  for (const node of Array.from(doc.querySelectorAll<HTMLElement>('[data-seal-paragraph-revision]')).reverse()) {
    const revision = JSON.parse(decodeURIComponent(node.dataset.sealParagraphRevision!)); if (id && revision.标识 !== id) continue
    count++
    if (action === 'accept' && revision.类型 === 'del' || action === 'reject' && revision.类型 === 'ins') { const next = node.nextElementSibling; if (next && /^(?:P|H[1-6]|LI)$/.test(next.tagName)) { node.append(...Array.from(next.childNodes)); next.remove() } }
    node.removeAttribute('data-seal-paragraph-revision'); node.removeAttribute('data-seal-paragraph-revision-type')
  }
  return count
}
