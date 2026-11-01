import { 净化富文本 } from './sanitizeHtml'

declare global {
  interface Window { sealClipboard?: { writeText: (text: string) => Promise<void> } }
}
let copied: { text: string; html: string } | null = null
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') copied = null })
export function clipboardTextHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r\n?/g, '\n').replace(/\n/g, '<br>')
}
/** 粘贴事件的文字内容：本会话自己复制的内容保留格式，其余按纯文本转义。没有文字时返回 null。 */
export function 粘贴数据HTML(data: DataTransfer): string | null {
  const text = data.getData('text/plain')
  if (!text) return null
  if (copied?.text === text) return copied.html
  return clipboardTextHtml(text)
}
/** 粘贴事件中的图片文件（Windows 截图、QQ/微信截图、浏览器复制图片等只提供图片数据）。 */
export function 粘贴图片文件(data: DataTransfer): File[] {
  // 资源管理器复制的图片文件可能没有 MIME 类型，按扩展名识别；插入前仍会按文件头解码校验。
  const files = Array.from(data.files ?? []).filter(file => file.type.startsWith('image/') || /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(file.name))
  if (files.length) return files
  return Array.from(data.items ?? []).flatMap(item => { const file = item.kind === 'file' && item.type.startsWith('image/') ? item.getAsFile() : null; return file ? [file] : [] })
}
const 读取文字 = (blob: Blob) => typeof blob.text === 'function' ? blob.text() : new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result ?? ''))
  reader.onerror = () => reject(new Error('剪贴板文字读取失败'))
  reader.readAsText(blob)
})
/**
 * 主动读取系统剪贴板（Ctrl+V 命令与右键“粘贴”使用）：截图类剪贴板只有图片，必须用 read() 才能取得。
 * 桌面 file:// 页面属于安全上下文，Electron 允许读取；不支持 read() 的环境退回只读文字。
 */
export async function 读取系统剪贴板(): Promise<{ 图片: File[]; 文本: string }> {
  const clipboard = navigator.clipboard
  if (clipboard?.read) {
    const 图片: File[] = []
    let 文本 = ''
    for (const item of await clipboard.read()) {
      const 图片类型 = item.types.find(type => type.startsWith('image/'))
      if (图片类型) { 图片.push(new File([await item.getType(图片类型)], `剪贴板图片.${图片类型.slice(6).replace('jpeg', 'jpg').replace('svg+xml', 'svg')}`, { type: 图片类型 })); continue }
      if (!文本 && item.types.includes('text/plain')) 文本 = await 读取文字(await item.getType('text/plain'))
    }
    return { 图片, 文本 }
  }
  if (clipboard?.readText) return { 图片: [], 文本: await clipboard.readText() }
  throw new Error('当前环境无法读取系统剪贴板，请使用系统粘贴菜单')
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
