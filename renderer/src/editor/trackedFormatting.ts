import { nextRevision } from './trackedEditing'
export function prepareTrackedFormatting(root: HTMLElement, author: string): { changed: boolean; error?: string } {
  const selection = window.getSelection(); if (!selection?.rangeCount) return { changed: false }
  const range = selection.getRangeAt(0).cloneRange(); if (range.collapsed || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return { changed: false }
  for (const node of Array.from(root.querySelectorAll('[data-seal-ooxml-locked],[data-seal-format-change],.wps-delete'))) if (range.intersectsNode(node)) return { changed: false, error: '所选内容含受保护结构或尚未审阅的格式修订，请先审阅' }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), texts: Text[] = []; let current: Node | null
  while ((current = walker.nextNode())) if (range.intersectsNode(current) && current.textContent) texts.push(current as Text)
  const identity = nextRevision(root, author), spans: HTMLElement[] = []
  for (const text of texts) {
    const start = text === range.startContainer ? range.startOffset : 0, end = text === range.endContainer ? range.endOffset : text.length
    if (start === end) continue
    const style = getComputedStyle(text.parentElement!), decoration = style.textDecorationLine || style.textDecoration
    const before = { 加粗: Number.parseInt(style.fontWeight, 10) >= 600 || style.fontWeight === 'bold', 倾斜: style.fontStyle === 'italic', 下划线: decoration.includes('underline'), 删除线: decoration.includes('line-through'), 字体: style.fontFamily.split(',')[0].replace(/["']/g, '').trim() || undefined, 字号: Number.parseFloat(style.fontSize) * 0.75 || undefined, 颜色: style.color || undefined, 底纹: style.backgroundColor || undefined }
    const local = document.createRange(); local.setStart(text, start); local.setEnd(text, end)
    const span = document.createElement('span'); span.dataset.sealFormatChange = encodeURIComponent(JSON.stringify({ 标识: identity.id, 作者: identity.author, 时间: identity.date, 原来格式: before })); span.appendChild(local.extractContents()); local.insertNode(span); spans.push(span)
  }
  if (!spans.length) return { changed: false }
  const formatted = document.createRange(); formatted.setStartBefore(spans[0]); formatted.setEndAfter(spans[spans.length - 1]); selection.removeAllRanges(); selection.addRange(formatted)
  return { changed: true }
}
