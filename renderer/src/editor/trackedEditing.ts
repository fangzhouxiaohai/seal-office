import { 净化富文本 } from './sanitizeHtml'
import { clipboardTextHtml } from './clipboard'

/** Persistent revision editing. Browser beforeinput supplies intent; IME is
 * committed once after composition so a syllable is never stored as many edits. */
export interface RevisionIdentity { id: string; author: string; date: string }
export function nextRevision(root: HTMLElement, author: string): RevisionIdentity {
  const ids = new Set(Array.from(root.querySelectorAll<HTMLElement>('[data-seal-revision-id]'), node => node.dataset.sealRevisionId))
  for (const node of root.querySelectorAll<HTMLElement>('[data-seal-paragraph-revision],[data-seal-format-change],[data-seal-revision-catalog]')) {
    for (const value of [node.dataset.sealParagraphRevision, node.dataset.sealFormatChange, node.dataset.sealRevisionCatalog]) {
      if (!value) continue
      try { const records = JSON.parse(decodeURIComponent(value)); for (const record of Array.isArray(records) ? records : [records]) ids.add(String(record.标识)) } catch { /* Invalid imported metadata is rejected by the document codec. */ }
    }
  }
  let id = Date.now() % 1_500_000_000 + 1
  while (ids.has(String(id))) id = id === 2_147_483_647 ? 1 : id + 1
  return { id: String(id), author: author.slice(0, 512) || '本机用户', date: new Date().toISOString() }
}
export function revisionElement(type: 'ins' | 'del', identity: RevisionIdentity): HTMLSpanElement {
  const span = document.createElement('span'); span.className = type === 'ins' ? 'wps-insert' : 'wps-delete'
  span.dataset.sealRevisionType = type; span.dataset.sealRevisionId = identity.id; span.dataset.sealRevisionAuthor = identity.author; span.dataset.sealRevisionDate = identity.date
  span.title = `${identity.author} · ${identity.date}`
  if (type === 'del') span.contentEditable = 'false'
  return span
}
const elementOf = (node: Node) => node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement
function selectedRange(root: HTMLElement) { const selection = window.getSelection(); if (!selection?.rangeCount) return null; const range = selection.getRangeAt(0); return root.contains(range.startContainer) && root.contains(range.endContainer) ? range.cloneRange() : null }
function setCaret(node: Node, end = true) { const range = document.createRange(); range.selectNodeContents(node); range.collapse(!end); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range) }
function blockOf(node: Node, root: HTMLElement) { const element = elementOf(node); return element?.closest('p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote') ?? root }
function blocked(range: Range, root: HTMLElement) { return Array.from(root.querySelectorAll('[data-seal-ooxml-locked],[data-seal-native-protected],[data-seal-docx-package],.wps-delete,[data-seal-revision-type="moveFrom"]')).some(node => range.collapsed ? node.contains(range.startContainer) : range.intersectsNode(node)) }
const paragraphsOf = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('p,h1,h2,h3,h4,h5,h6,li')).filter(node => !node.querySelector('p,h1,h2,h3,h4,h5,h6,li'))
function markParagraph(node: HTMLElement, type: 'ins' | 'del', identity: RevisionIdentity) { node.dataset.sealParagraphRevision = encodeURIComponent(JSON.stringify({ 类型: type, 标识: identity.id, 作者: identity.author, 时间: identity.date })); node.dataset.sealParagraphRevisionType = type }
function extendDeletion(range: Range, direction: 'backward' | 'forward', root: HTMLElement) {
  const walker = document.createTreeWalker(blockOf(range.startContainer, root), NodeFilter.SHOW_TEXT)
  const texts: Text[] = []; let node: Node | null; while ((node = walker.nextNode())) texts.push(node as Text)
  const probe = range.cloneRange(); probe.selectNodeContents(blockOf(range.startContainer, root)); probe.setEnd(range.startContainer, range.startOffset)
  const position = probe.toString().length, all = texts.map(text => text.data).join('')
  if (direction === 'backward' && position === 0 || direction === 'forward' && position >= all.length) return false
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale: undefined, options: { granularity: 'grapheme' }) => { segment: (text: string) => Iterable<{ index: number; segment: string }> } }).Segmenter
  const segments = Segmenter ? Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(all), item => ({ start: item.index, end: item.index + item.segment.length })) : Array.from(all).map((text, index, array) => ({ start: array.slice(0, index).join('').length, end: array.slice(0, index).join('').length + text.length }))
  const segment = direction === 'backward' ? segments.find(item => item.start < position && item.end >= position) : segments.find(item => item.start <= position && item.end > position)
  if (!segment) return false
  const boundary = (offset: number) => { let current = 0; for (const text of texts) { if (current + text.length >= offset) return { text, offset: offset - current }; current += text.length } return null }
  const start = boundary(segment.start), end = boundary(segment.end); if (!start || !end) return false
  range.setStart(start.text, start.offset); range.setEnd(end.text, end.offset); return true
}
export function applyTrackedInput(root: HTMLElement, inputType: string, text: string | null, identity: RevisionIdentity, rich?: DocumentFragment): { changed: boolean; error?: string } {
  const range = selectedRange(root); if (!range) return { changed: false, error: '请先把光标放在正文中' }
  if (inputType.startsWith('delete') && range.collapsed && !extendDeletion(range, inputType.includes('Forward') ? 'forward' : 'backward', root)) {
    const paragraphs = paragraphsOf(root), block = blockOf(range.startContainer, root) as HTMLElement, index = paragraphs.indexOf(block), forward = inputType.includes('Forward'), other = paragraphs[index + (forward ? 1 : -1)]
    if (!other || block.closest('td,th') !== other.closest('td,th') || other.closest('[data-seal-ooxml-locked]') || block.closest('[data-seal-ooxml-locked]')) return { changed: false }
    markParagraph(forward ? block : other, 'del', identity); return { changed: true }
  }
  if (blocked(range, root)) return { changed: false, error: '所选内容含受保护的原生结构或删除历史，请先在修订列表审阅' }
  if (inputType === 'insertParagraph') {
    if (!range.collapsed) { const result = applyTrackedInput(root, 'deleteContent', null, identity); if (!result.changed) return result; const updated = selectedRange(root); if (!updated) return { changed: false }; range.setStart(updated.startContainer, updated.startOffset); range.collapse(true) }
    const paragraph = blockOf(range.startContainer, root) as HTMLElement
    if (!/^(?:P|H[1-6]|LI)$/.test(paragraph.tagName) || paragraph.dataset.sealParagraphRevision) return { changed: false, error: '此段落已有边界修订，请先审阅该修订后再拆段' }
    const tail = range.cloneRange(); tail.setEnd(paragraph, paragraph.childNodes.length)
    const next = paragraph.cloneNode(false) as HTMLElement; next.removeAttribute('id'); next.removeAttribute('data-seal-paragraph-revision'); next.removeAttribute('data-seal-paragraph-revision-type'); next.appendChild(tail.extractContents())
    if (!paragraph.childNodes.length) paragraph.appendChild(document.createElement('br')); if (!next.childNodes.length) next.appendChild(document.createElement('br'))
    markParagraph(paragraph, 'ins', identity); paragraph.after(next); setCaret(next, false); return { changed: true }
  }
  if (blockOf(range.startContainer, root) !== blockOf(range.endContainer, root)) {
    const startBlock = blockOf(range.startContainer, root), endBlock = blockOf(range.endContainer, root)
    if (startBlock.closest('td,th') !== endBlock.closest('td,th')) return { changed: false, error: '跨单元格结构修改受保护，请逐格修订；原文未更改' }
    const paragraphs = paragraphsOf(root).filter(node => range.intersectsNode(node))
    if (paragraphs.length < 2 || paragraphs.some(node => node.dataset.sealParagraphRevision)) return { changed: false, error: '所选段落已有边界修订，请先审阅；原文未更改' }
    const ranges = paragraphs.map(paragraph => { const local = document.createRange(); local.selectNodeContents(paragraph); if (paragraph.contains(range.startContainer)) local.setStart(range.startContainer, range.startOffset); if (paragraph.contains(range.endContainer)) local.setEnd(range.endContainer, range.endOffset); return local })
    let caret: Range | null = null
    ranges.forEach((local, index) => { if (!local.collapsed) { const deletion = revisionElement('del', identity); deletion.appendChild(local.extractContents()); local.insertNode(deletion); if (!caret) { caret = document.createRange(); caret.setStartBefore(deletion); caret.collapse(true) } } if (index < ranges.length - 1) markParagraph(paragraphs[index], 'del', identity) })
    if (caret && (text || rich?.childNodes.length) && !inputType.startsWith('delete')) { const insertion = revisionElement('ins', identity); if (rich) insertion.appendChild(rich.cloneNode(true)); else insertion.textContent = text; (caret as Range).insertNode(insertion); setCaret(insertion) }
    else if (caret) { window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(caret) }
    return { changed: true }
  }
  const existing = elementOf(range.startContainer)?.closest<HTMLElement>('[data-seal-revision-type="ins"]')
  if (existing && existing.contains(range.endContainer) && existing.dataset.sealRevisionAuthor === identity.author) {
    range.deleteContents(); if (rich) range.insertNode(rich.cloneNode(true)); else if (text) range.insertNode(document.createTextNode(text)); setCaret(existing)
    if (!existing.textContent && !existing.querySelector('img,br')) existing.remove()
    return { changed: true }
  }
  const deletion = range.collapsed ? null : revisionElement('del', identity)
  if (deletion) deletion.appendChild(range.extractContents())
  const fragment = document.createDocumentFragment(); if (deletion) fragment.appendChild(deletion)
  const insertion = text !== null && !inputType.startsWith('delete') ? revisionElement('ins', identity) : null
    if (insertion) { if (rich) insertion.appendChild(rich.cloneNode(true)); else if (inputType === 'insertLineBreak') insertion.appendChild(document.createElement('br')); else insertion.textContent = text; fragment.appendChild(insertion) }
  range.insertNode(fragment)
  if (insertion) setCaret(insertion)
  else if (deletion) { const caret = document.createRange(); caret.setStartAfter(deletion); caret.collapse(true); window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(caret) }
  return { changed: Boolean(insertion || deletion) }
}
/** Rich inline replacement shares the same deletion/paragraph history path as
 * keyboard input. Structural paste is protected until its own history can be
 * represented; it must never silently delete the selected original content. */
export function applyTrackedHtml(root: HTMLElement, html: string, identity: RevisionIdentity) {
  const template = document.createElement('template'); template.innerHTML = 净化富文本(html)
  if (template.content.querySelector('p,div,table,thead,tbody,tfoot,tr,td,th,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,section,article,hr,[data-seal-docx-package],[data-seal-ooxml-block]')) return { changed: false, error: '修订模式下暂不支持粘贴块级结构，请先关闭修订或改为纯文本；原文未更改' }
  return applyTrackedInput(root, template.content.childNodes.length ? 'insertFromPaste' : 'deleteContent', template.content.childNodes.length ? template.content.textContent ?? '' : null, identity, template.content.childNodes.length ? template.content : undefined)
}
const nodePath = (root: Node, node: Node): number[] => { const path: number[] = []; while (node !== root && node.parentNode) { path.unshift(Array.from(node.parentNode.childNodes).indexOf(node as ChildNode)); node = node.parentNode } return path }
export function installTrackedEditing(root: HTMLElement, options: { enabled: () => boolean; readOnly: () => boolean; author: () => string; notice: (text: string) => void; composition?: (active: boolean) => void; changed: () => void }) {
  let composing = false, finishing = false, snapshot: { html: string; start: number[]; end: number[]; startOffset: number; endOffset: number } | null = null
  const before = (event: InputEvent) => {
    if (options.readOnly()) { event.preventDefault(); return }
    if (!options.enabled() || composing || event.isComposing) return
    if (finishing && event.inputType === 'insertFromComposition') { event.preventDefault(); return }
    if (['insertFromPaste', 'insertFromDrop'].includes(event.inputType)) { event.preventDefault(); options.notice('请使用编辑器粘贴操作；拖放和无法读取内容的结构修改已保护原文'); return }
    if (['insertText', 'insertReplacementText', 'insertLineBreak', 'insertParagraph', 'deleteContentBackward', 'deleteContentForward', 'deleteByCut', 'deleteByDrag', 'deleteContent', 'deleteWordBackward', 'deleteWordForward'].includes(event.inputType)) {
      event.preventDefault(); const result = applyTrackedInput(root, event.inputType, event.inputType.startsWith('delete') ? null : event.data ?? '', nextRevision(root, options.author()))
      if (result.error) options.notice(result.error); if (result.changed) options.changed()
    }
  }
  const paste = (event: ClipboardEvent) => {
    if (options.readOnly()) { event.preventDefault(); return }
    if (!options.enabled()) return
    event.preventDefault()
    if (!event.clipboardData) { options.notice('无法读取粘贴内容，原文未更改'); return }
    const html = event.clipboardData.getData('text/html') || clipboardTextHtml(event.clipboardData.getData('text/plain'))
    const result = applyTrackedHtml(root, html, nextRevision(root, options.author())); if (result.error) options.notice(result.error); if (result.changed) options.changed()
  }
  const start = () => { composing = true; options.composition?.(true); const range = selectedRange(root); snapshot = options.enabled() && range ? { html: root.innerHTML, start: nodePath(root, range.startContainer), end: nodePath(root, range.endContainer), startOffset: range.startOffset, endOffset: range.endOffset } : null }
  const end = (event: CompositionEvent) => {
    composing = false; finishing = true
    if (snapshot && event.data) { root.innerHTML = snapshot.html; const at = (path: number[]) => path.reduce((node, index) => node.childNodes[index], root as Node); const range = document.createRange(); range.setStart(at(snapshot.start), snapshot.startOffset); range.setEnd(at(snapshot.end), snapshot.endOffset); window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range); const result = applyTrackedInput(root, 'insertText', event.data, nextRevision(root, options.author())); if (result.error) options.notice(result.error) }
    snapshot = null; options.composition?.(false); options.changed(); queueMicrotask(() => { finishing = false })
  }
  root.addEventListener('beforeinput', before as EventListener); root.addEventListener('paste', paste); root.addEventListener('compositionstart', start); root.addEventListener('compositionend', end as EventListener)
  return () => { root.removeEventListener('beforeinput', before as EventListener); root.removeEventListener('paste', paste); root.removeEventListener('compositionstart', start); root.removeEventListener('compositionend', end as EventListener) }
}
