/** 搜索索引按段落划界，允许跨越粗体、超链接等内联节点。不会向正文插入搜索标记。 */
export interface 文字索引 { 文字: string; 节点: Array<{ 节点: Text; 开始: number; 结束: number }> }
export function 索引文字(根: HTMLElement): 文字索引 {
  const 节点: 文字索引['节点'] = []
  let 文字 = '', 前块: Element | null = null
  const 遍历 = document.createTreeWalker(根, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  for (let 项 = 遍历.nextNode(); 项; 项 = 遍历.nextNode()) {
    if (项 instanceof HTMLElement && 项.tagName === 'BR') { 文字 += '\n'; continue }
    if (!(项 instanceof Text) || !项.data || 项.parentElement?.closest('script,style')) continue
    const 块 = 项.parentElement?.closest('p,h1,h2,h3,h4,h5,h6,li,td,th,div') ?? 根
    if (前块 && 前块 !== 块) 文字 += '\n'
    前块 = 块
    节点.push({ 节点: 项, 开始: 文字.length, 结束: 文字.length + 项.data.length })
    文字 += 项.data
  }
  return { 文字, 节点 }
}
export function 文字范围(索引: 文字索引, 开始: number, 结束: number): Range | null {
  const 首 = 索引.节点.find(项 => 项.开始 <= 开始 && 项.结束 > 开始)
  const 尾 = 索引.节点.find(项 => 项.开始 < 结束 && 项.结束 >= 结束)
  if (!首 || !尾 || 结束 <= 开始) return null
  const 范围 = document.createRange()
  范围.setStart(首.节点, 开始 - 首.开始); 范围.setEnd(尾.节点, 结束 - 尾.开始)
  return 范围
}
export function 查找文字(根: HTMLElement, 关键词: string, 区分大小写 = false): Range[] {
  if (!关键词) return []
  const 索引 = 索引文字(根), 结果: Range[] = []
  const 正则 = new RegExp(关键词.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 区分大小写 ? 'g' : 'gi')
  for (const 项 of 索引.文字.matchAll(正则)) {
    const 范围 = 文字范围(索引, 项.index!, 项.index! + 项[0].length)
    if (范围) 结果.push(范围)
  }
  return 结果
}
type 高亮环境 = { highlights?: Map<string, unknown> }
let 使用旧缩放坐标: boolean | undefined
function 坐标比例(元素: HTMLElement): number {
  // Chromium 128 以前的 DOMRect 会除以 CSS zoom；用能力探测兼容桌面与新版浏览器。
  if (使用旧缩放坐标 === undefined) {
    const 探针 = document.createElement('div')
    探针.style.cssText = 'position:fixed;left:0;top:0;width:4px;height:4px;zoom:2;visibility:hidden;pointer-events:none'
    document.body.append(探针)
    使用旧缩放坐标 = Math.abs(探针.getBoundingClientRect().width - 4) < 0.1
    探针.remove()
  }
  let 比例 = 1
  if (使用旧缩放坐标) for (let 父: HTMLElement | null = 元素; 父; 父 = 父.parentElement) {
    比例 *= Number((getComputedStyle(父) as CSSStyleDeclaration & { zoom: string }).zoom) || 1
  }
  return 比例
}
export function 清除搜索高亮(): void {
  const 注册 = (window.CSS as 高亮环境 | undefined)?.highlights
  注册?.delete('seal-search'); 注册?.delete('seal-search-current')
}
export function 高亮搜索(范围: Range[], 当前?: Range): void {
  清除搜索高亮()
  const 环境 = window as unknown as { Highlight?: new (...范围: Range[]) => unknown }
  const 注册 = (window.CSS as 高亮环境 | undefined)?.highlights
  if (环境.Highlight && 注册) {
    注册.set('seal-search', new 环境.Highlight(...范围))
    if (当前) 注册.set('seal-search-current', new 环境.Highlight(当前))
  }
}
export function 定位文字(根: HTMLElement, 范围: Range): void {
  根.focus({ preventScroll: true })
  const 选区 = window.getSelection()
  选区?.removeAllRanges(); 选区?.addRange(范围)
  // 定位实际命中的那一行，长段落中也不会停在段首。
  const 位置 = typeof 范围.getBoundingClientRect === 'function' ? 范围.getBoundingClientRect() : null
  let 滚动区 = 根.parentElement
  while (滚动区 && !/(auto|scroll)/.test(getComputedStyle(滚动区).overflowY)) 滚动区 = 滚动区.parentElement
  if (滚动区 && 位置 && 位置.height) {
    const 窗口 = 滚动区.getBoundingClientRect()
    const 文字比例 = 坐标比例(根), 窗口比例 = 坐标比例(滚动区)
    滚动区.scrollTop += (位置.top * 文字比例 - 窗口.top * 窗口比例 - (滚动区.clientHeight * 窗口比例 - 位置.height * 文字比例) / 2) / 窗口比例
    if (位置.left * 文字比例 < 窗口.left * 窗口比例 || 位置.right * 文字比例 > 窗口.right * 窗口比例) 滚动区.scrollLeft += (位置.left * 文字比例 - 窗口.left * 窗口比例) / 窗口比例 - 滚动区.clientWidth / 2
  } else 范围.startContainer.parentElement?.scrollIntoView?.({ block: 'center', inline: 'nearest' })
}
export function 替换范围(范围: Range, 新文: string): void {
  范围.deleteContents(); 范围.insertNode(document.createTextNode(新文))
}
