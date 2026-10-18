const styles: Record<string, string> = { 阿拉伯数字: 'decimal', 中文数字: 'cjk-ideographic', 字母: 'lower-alpha', 圆点: 'disc', 方块: 'square', 空心圆: 'circle' }

/** Selecting a new marker style must not toggle an existing list off. */
export function applyListStyle(root: HTMLElement, command: string, value?: string): boolean {
  if (!value || !styles[value] || !['insertOrderedList', 'insertUnorderedList'].includes(command)) return false
  const tag = command === 'insertOrderedList' ? 'ol' : 'ul'
  const selection = window.getSelection()
  if (!selection?.rangeCount || !root.contains(selection.anchorNode)) return false
  let range = selection.getRangeAt(0)
  let lists = [...root.querySelectorAll<HTMLElement>(tag)].filter(list => range.intersectsNode(list))
  if (!lists.length) {
    document.execCommand(command, false)
    if (!selection.rangeCount) return true
    range = selection.getRangeAt(0)
    lists = [...root.querySelectorAll<HTMLElement>(tag)].filter(list => range.intersectsNode(list))
  }
  for (const list of lists) list.style.listStyleType = styles[value]
  return true
}
