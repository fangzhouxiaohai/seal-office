/** Apply a point size using Chromium's native selection editing, then replace
 * its coarse size marker only inside the affected selection. */
export function 应用精确字号(根: HTMLElement, 磅值: number): boolean {
  const 选择 = window.getSelection()
  if (!选择?.rangeCount || !根.contains(选择.anchorNode)) return false
  if (!根.contains(选择.getRangeAt(0).endContainer)) return false
  const 折叠 = 选择.isCollapsed
  document.execCommand('styleWithCSS', false, 'true')
  document.execCommand('fontSize', false, '7')
  if (折叠) return false // Chromium creates the typing wrapper on the next input.
  规范化字号标记(根, 磅值)
  return true
}

export function 规范化字号标记(根: HTMLElement, 磅值: number): void {
  const 选择 = window.getSelection()
  if (!选择?.rangeCount || !根.contains(选择.anchorNode)) return
  const 范围 = 选择.getRangeAt(0)
  for (const 元素 of 根.querySelectorAll<HTMLElement>('span[style], font[size="7"]')) {
    if (元素.style.fontSize !== 'xxx-large' && !(元素.tagName === 'FONT' && 元素.getAttribute('size') === '7')) continue
    if (!范围.intersectsNode(元素)) continue
    元素.style.fontSize = `${磅值}pt`
    元素.removeAttribute('size')
  }
}

/** Computed CSS pixels are independent of document zoom. */
export function 读取字号磅值(根: HTMLElement): number {
  const 选择 = window.getSelection()
  const 节点 = 选择?.anchorNode
  if (!节点 || !根.contains(节点)) return 10.5
  const 元素 = 节点 instanceof HTMLElement ? 节点 : 节点.parentElement
  const 像素 = 元素 ? Number.parseFloat(getComputedStyle(元素).fontSize) : NaN
  return Number.isFinite(像素) && 像素 > 0 ? 像素 * 0.75 : 10.5
}
