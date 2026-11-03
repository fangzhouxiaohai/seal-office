import { clipboardTextHtml } from './clipboard'
import { 恢复选区 } from './selection'
export type NoteKind = 'footnote' | 'endnote'

/** 段落锚点：记下光标所在段落，供弹窗关闭后在 DOM 变动时重新定位。 */
export interface NoteAnchor { blockIndex: number; offset: number }

/** 把 Range 转成「第几个块级子节点 + 节点内偏移」，不持有会失效的 DOM 引用。 */
export function 注释锚点(root: HTMLElement, range: Range | null): NoteAnchor | null {
  if (!range || !root.contains(range.startContainer)) return null
  const blocks = Array.from(root.children)
  let block: Node | null = range.startContainer
  while (block && block.parentNode !== root) block = block.parentNode
  if (!block) return null
  const blockIndex = blocks.indexOf(block as Element)
  if (blockIndex < 0) return null
  // 光标直接落在块元素上时用子节点序号，否则用文本偏移
  const offset = range.startContainer === block ? range.startOffset : range.startOffset
  return { blockIndex, offset }
}

/** 按锚点重建 Range；目标段落已不存在时返回 null，由调用方退回文末。 */
export function 注释锚点范围(root: HTMLElement, anchor: NoteAnchor | null): Range | null {
  if (!anchor) return null
  const block = root.children[anchor.blockIndex]
  if (!block) return null
  const range = document.createRange()
  try {
    if (block.childNodes.length === 0) { range.selectNodeContents(block); range.collapse(false) }
    else {
      const target = block.childNodes[Math.min(anchor.offset, block.childNodes.length - 1)]
      range.setStart(target, 0)
      range.collapse(true)
    }
    return range
  } catch { return null }
}

/** Insert reference and editable definition together, as one history action. */
export function insertDocumentNote(root: HTMLElement, kind: NoteKind, text: string, savedRange: Range | null): void {
  const ids = [...root.querySelectorAll<HTMLElement>(`[data-seal-note-kind="${kind}"][data-seal-note-ref]`)].map(node => Number(node.dataset.sealNoteRef))
  const id = Math.max(0, ...ids.filter(Number.isSafeInteger)) + 1
  if (root.querySelectorAll('[data-seal-note-ref]').length >= 1000 || id > 10000) throw new Error('注释数量超过上限')
  const selection = window.getSelection()
  // 优先用调用方保存的快照。弹窗打开会把焦点移到输入框并清空编辑区选区，
  // 但快照仍指向原位置，因此恢复失败不能直接报错，要退回到可用位置。
  let range: Range | null = null
  if (savedRange && 恢复选区(root, savedRange)) {
    range = savedRange
  } else if (selection?.rangeCount && root.contains(selection.getRangeAt(0).startContainer) && root.contains(selection.getRangeAt(0).endContainer)) {
    range = selection.getRangeAt(0)
  }
  if (!range) { range = document.createRange(); range.selectNodeContents(root); range.collapse(false) }
  root.focus({ preventScroll: true })
  if ((range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest('[data-seal-notes]')) throw new Error('请在正文中插入注释引用')
  const ref = document.createElement('sup')
  ref.dataset.sealNoteKind = kind; ref.dataset.sealNoteRef = String(id); ref.contentEditable = 'false'; ref.textContent = String(id)
  ref.title = `${kind === 'footnote' ? '脚注' : '尾注'} ${id}`
  range.deleteContents(); range.insertNode(ref); range.setStartAfter(ref); range.collapse(true)
  let section = root.querySelector<HTMLElement>(`[data-seal-notes="${kind}"]`)
  if (!section) {
    section = document.createElement('section'); section.dataset.sealNotes = kind
    const label = document.createElement('h4'); label.dataset.sealNoteLabel = 'true'; label.contentEditable = 'false'; label.textContent = kind === 'footnote' ? '脚注' : '尾注'
    section.append(label); root.append(section)
  }
  const definition = document.createElement('div')
  definition.dataset.sealNoteId = String(id); definition.id = `seal-${kind}-${id}`
  definition.innerHTML = `<span data-seal-note-label="true" contenteditable="false">${id}. </span><p>${clipboardTextHtml(text)}</p>`
  section.append(definition)
  selection?.removeAllRanges(); selection?.addRange(range)
}
