// 插入类基础功能：超链接、书签、页码域。
//
// 三类内容在 DOCX 模型里都已有完整支持（见 office/docModel.ts 与
// editor/docxSaveRoundTrip.test.ts），这里只负责在编辑区插入符合约定的标记：
//   超链接 <a data-seal-link="目标">文字</a>
//   书签    <span data-seal-bookmark="名称" contenteditable="false"></span>
//   页码    <span data-seal-field="PAGE|NUMPAGES">缓存值</span>
import { 恢复选区 } from './selection'

/** 与 docModel 的 支持的域 保持一致 */
export type FieldName = 'PAGE' | 'NUMPAGES'

const 转义 = (文本: string): string =>
  文本.replace(/[&<>"']/g, 字符 => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[字符] ?? 字符)

/**
 * 把 Range 收敛为可插入的位置；saved 优先，失败时取当前选区，再失败取文末。
 * 弹窗打开会清空编辑区选区，所以调用方通常传入预先保存的快照。
 */
function 定位插入点(root: HTMLElement, saved: Range | null): Range {
  if (saved && 恢复选区(root, saved)) return saved
  const 选区 = window.getSelection()
  if (选区 && 选区.rangeCount > 0) {
    const 当前 = 选区.getRangeAt(0)
    if (root.contains(当前.startContainer) && root.contains(当前.endContainer)) return 当前
  }
  根焦点(root)
  const 文末 = document.createRange()
  文末.selectNodeContents(root)
  文末.collapse(false)
  return 文末
}

function 根焦点(root: HTMLElement): void {
  try { root.focus({ preventScroll: true }) } catch { /* 只读或已卸载时忽略 */ }
}

/** 在光标处插入超链接；选区有文字时作为链接文字，否则用地址本身。 */
export function insertHyperlink(root: HTMLElement, 地址: string, 显示文字: string, saved: Range | null): void {
  const 目标 = 地址.trim()
  const range = 定位插入点(root, saved)
  const 文字 = 显示文字.trim() || 目标
  const 链接 = document.createElement('a')
  // href 给浏览器渲染与点击用；data-seal-link 是保存进 DOCX 的权威目标
  链接.setAttribute('href', 目标)
  链接.setAttribute('data-seal-link', 目标)
  链接.textContent = 文字
  链接.contentEditable = 'true'
  range.deleteContents()
  range.insertNode(链接)
  // 光标移到链接之后，避免后续输入被吞进链接
  const 后 = document.createRange()
  后.setStartAfter(链接)
  后.collapse(true)
  const 选区 = window.getSelection()
  选区?.removeAllRanges()
  选区?.addRange(后)
}

/** 插入书签标记（零宽锚点），供文档内跳转与 DOCX bookmarkStart/End 使用。 */
export function insertBookmark(root: HTMLElement, 名称: string, saved: Range | null): void {
  const 干净 = 名称.trim()
  if (!干净) throw new Error('书签名不能为空')
  // Word 的书签名不允许空格，统一替换为下划线，避免 DOCX 侧写出非法名称
  const 合法 = 干净.replace(/\s+/g, '_')
  const range = 定位插入点(root, saved)
  const 标记 = document.createElement('span')
  标记.setAttribute('data-seal-bookmark', 合法)
  标记.contentEditable = 'false'
  标记.className = 'wps-bookmark-anchor'
  range.deleteContents()
  range.insertNode(标记)
  const 后 = document.createRange()
  后.setStartAfter(标记)
  后.collapse(true)
  const 选区 = window.getSelection()
  选区?.removeAllRanges()
  选区?.addRange(后)
}

/**
 * 插入页码或总页数域。
 * 缓存值给编辑器直接显示；真实页码在打开/更新时由渲染层刷新。
 */
export function insertField(root: HTMLElement, 域: FieldName, 缓存值: string, saved: Range | null): void {
  const range = 定位插入点(root, saved)
  const 元素 = document.createElement('span')
  元素.setAttribute('data-seal-field', 域)
  元素.textContent = 缓存值
  元素.contentEditable = 'false'
  元素.className = 'wps-field-value'
  range.deleteContents()
  range.insertNode(元素)
  const 后 = document.createRange()
  后.setStartAfter(元素)
  后.collapse(true)
  const 选区 = window.getSelection()
  选区?.removeAllRanges()
  选区?.addRange(后)
}

export { 转义 as 插入文本转义 }
