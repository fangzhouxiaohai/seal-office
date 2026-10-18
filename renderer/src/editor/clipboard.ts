import { 净化富文本 } from './sanitizeHtml'

declare global {
  interface Window { sealClipboard?: { writeText: (text: string) => Promise<void> } }
}
let copied: { text: string; html: string } | null = null
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') copied = null })
export function clipboardTextHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r\n?/g, '\n').replace(/\n/g, '<br>')
}
export async function writeClipboardText(text: string): Promise<void> {
  if (window.sealClipboard) return window.sealClipboard.writeText(text)
  if (!navigator.clipboard?.writeText) throw new Error('系统复制不可用，请使用长按菜单复制')
  await navigator.clipboard.writeText(text)
}
export async function copyEditorSelection(root: HTMLElement): Promise<void> {
  const selection = window.getSelection()
  if (!selection?.rangeCount || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode) || selection.isCollapsed) return
  const content = document.createElement('div')
  content.append(selection.getRangeAt(0).cloneContents())
  const value = { text: selection.toString(), html: 净化富文本(content.innerHTML) }
  if (window.sealClipboard) await window.sealClipboard.writeText(value.text)
  else if (!document.execCommand('copy')) {
    await writeClipboardText(value.text)
  }
  copied = value
}
export async function readEditorClipboard(): Promise<string | null> {
  // Do not request HarmonyOS's restricted READ_PASTEBOARD permission. The
  // keyboard's user-initiated Paste control is available when system read fails.
  if (navigator.clipboard?.readText) {
    try {
      const text = await navigator.clipboard.readText()
      if (copied?.text === text) return copied.html
      return clipboardTextHtml(text)
    } catch { /* use a user-paste field or this session's own copy */ }
  }
  return copied?.html ?? null
}
