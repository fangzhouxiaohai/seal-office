import { clipboardTextHtml } from './clipboard'
import { 恢复选区 } from './selection'
export type NoteKind = 'footnote' | 'endnote'

/** Insert reference and editable definition together, as one history action. */
export function insertDocumentNote(root: HTMLElement, kind: NoteKind, text: string, savedRange: Range | null): void {
  const ids = [...root.querySelectorAll<HTMLElement>(`[data-seal-note-kind="${kind}"][data-seal-note-ref]`)].map(node => Number(node.dataset.sealNoteRef))
  const id = Math.max(0, ...ids.filter(Number.isSafeInteger)) + 1
  if (root.querySelectorAll('[data-seal-note-ref]').length >= 1000 || id > 10000) throw new Error('注释数量超过上限')
  if (savedRange && !恢复选区(root, savedRange)) throw new Error('原插入位置已改变，请重新选择')
  const selection = window.getSelection()
  let range = selection?.rangeCount ? selection.getRangeAt(0) : null
  if (!range || !root.contains(range.startContainer) || !root.contains(range.endContainer)) { range = document.createRange(); range.selectNodeContents(root); range.collapse(false) }
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
