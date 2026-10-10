/** 图片编辑只修改正文节点；选框与控制按钮由独立组件展示。 */
export function 调整图片尺寸(图片: HTMLImageElement, 宽: number, 高: number): void {
  if (![宽, 高].every(值 => Number.isFinite(值) && 值 >= 1 && 值 <= 32768)) throw new Error('图片尺寸必须在 1 至 32768 像素之间')
  图片.style.width = `${宽}px`
  图片.style.height = `${高}px`
  图片.width = Math.round(宽)
  图片.height = Math.round(高)
}

function 检查图片(根: HTMLElement, 图片: HTMLImageElement): void {
  if (!根.contains(图片)) throw new Error('图片已不在当前正文中，请重新选择')
  if (根.contentEditable === 'false' || 根.getAttribute('contenteditable') === 'false') throw new Error('当前文档处于只读状态')
}

/** 将图片独立成段，不改变前后正文及其字符格式。 */
export function 对齐图片(根: HTMLElement, 图片: HTMLImageElement, 对齐: 'left' | 'center' | 'right'): void {
  检查图片(根, 图片)
  const 候选段落 = 图片.closest('p,h1,h2,h3,h4,h5,h6,blockquote,div')
  const 原段 = 候选段落 && 候选段落 !== 根 && 根.contains(候选段落) ? 候选段落 as HTMLElement : null
  if (原段 && !原段.textContent?.trim() && 原段.querySelectorAll('img').length === 1 && !原段.querySelector('table,hr')) {
    原段.style.textAlign = 对齐
    return
  }
  const 新段 = document.createElement('p')
  新段.style.textAlign = 对齐
  const 行内容容器 = 原段 ?? 图片.closest('td,th,li') as HTMLElement | null
  const 来源 = 行内容容器 ?? 根
  const 前范围 = document.createRange()
  前范围.selectNodeContents(来源)
  前范围.setEndBefore(图片)
  const 后范围 = document.createRange()
  后范围.selectNodeContents(来源)
  后范围.setStartAfter(图片)
  const 前文 = 前范围.cloneContents()
  const 后文 = 后范围.cloneContents()
  const 新内容 = document.createDocumentFragment()
  const 有内容 = (节点: DocumentFragment) => Boolean(节点.textContent?.length || 节点.querySelector('img,br,table,hr'))
  const 添加正文 = (节点: DocumentFragment) => {
    if (!有内容(节点)) return
    if (!原段 && [...节点.children].some(元素 => 元素.matches('p,h1,h2,h3,h4,h5,h6,div,table,ul,ol,blockquote'))) {
      新内容.appendChild(节点)
      return
    }
    const 段 = 原段 ? 原段.cloneNode(false) as HTMLElement : document.createElement('p')
    段.removeAttribute('id')
    段.appendChild(节点)
    新内容.appendChild(段)
  }
  添加正文(前文)
  新段.appendChild(图片)
  新内容.appendChild(新段)
  添加正文(后文)
  if (原段) 原段.replaceWith(新内容)
  else 来源.replaceChildren(新内容)
}

/** 移动图片到折叠选区，避免拖放复制媒体或删除目标文字。 */
export function 移动图片到选区(根: HTMLElement, 图片: HTMLImageElement, 范围: Range): void {
  检查图片(根, 图片)
  if (!根.contains(范围.startContainer) || !根.contains(范围.endContainer) || 图片.contains(范围.startContainer)) throw new Error('请选择当前正文中的目标位置')
  const 目标 = 范围.cloneRange()
  目标.collapse(true)
  目标.insertNode(图片)
  目标.setStartAfter(图片)
  目标.collapse(true)
  const 选区 = window.getSelection()
  选区?.removeAllRanges()
  选区?.addRange(目标)
}

export function 读取图片尺寸(图片: HTMLImageElement): { 宽: number; 高: number } {
  const 样式 = getComputedStyle(图片)
  const 宽 = parseFloat(样式.width) || 图片.width
  const 高 = parseFloat(样式.height) || 图片.height
  if (![宽, 高].every(值 => Number.isFinite(值) && 值 > 0)) throw new Error('图片尚未显示完成，请等待后重新选择')
  return { 宽, 高 }
}

export function 图片可用宽度(根: HTMLElement, 图片: HTMLImageElement): number {
  const 样式 = getComputedStyle(根)
  const 栏数 = Math.max(1, parseInt(样式.columnCount) || 1)
  const 栏间距 = parseFloat(样式.columnGap) || 0
  const 正文宽 = (根.clientWidth - 栏间距 * (栏数 - 1)) / 栏数
  const 单元 = 图片.closest('td,th') as HTMLElement | null
  const 单元样式 = 单元 ? getComputedStyle(单元) : null
  const 单元宽 = 单元 ? 单元.clientWidth - (parseFloat(单元样式!.paddingLeft) || 0) - (parseFloat(单元样式!.paddingRight) || 0) : 正文宽
  const 宽 = Math.min(正文宽, 单元宽)
  if (!Number.isFinite(宽) || 宽 <= 0) throw new Error('无法读取正文可用宽度，请返回文档后重试')
  return 宽
}

/** Chromium/Safari 与 Firefox 的插入点接口不同，统一返回正文 Range。 */
export function 正文位置(根: HTMLElement, x: number, y: number): Range {
  const 页面 = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }
  let 范围 = 页面.caretRangeFromPoint?.(x, y) ?? null
  if (!范围 && 页面.caretPositionFromPoint) {
    const 位置 = 页面.caretPositionFromPoint(x, y)
    if (位置) { 范围 = document.createRange(); 范围.setStart(位置.offsetNode, 位置.offset); 范围.collapse(true) }
  }
  if (!范围 || !根.contains(范围.startContainer)) throw new Error('请将图片移到当前正文中的文字位置')
  return 范围
}

export function 显示缩放(元素: HTMLElement): number {
  let 缩放 = 1
  for (let 父: HTMLElement | null = 元素; 父; 父 = 父.parentElement) {
    const 值 = getComputedStyle(父).getPropertyValue('zoom')
    缩放 *= (parseFloat(值) || 1) / (值.includes('%') ? 100 : 1)
  }
  return 缩放
}
let 旧缩放坐标: boolean | undefined
/** Electron 25 与较新 Android WebView 的 CSS zoom 坐标规则不同，按能力探测。 */
export function 屏幕矩形(元素: HTMLElement) {
  if (旧缩放坐标 === undefined) {
    const 探针 = document.createElement('div')
    探针.style.cssText = 'position:fixed;left:0;top:0;width:4px;height:4px;zoom:2;visibility:hidden;pointer-events:none'
    document.body.append(探针)
    旧缩放坐标 = Math.abs(探针.getBoundingClientRect().width - 4) < 0.1
    探针.remove()
  }
  const 矩形 = 元素.getBoundingClientRect(), 倍率 = 旧缩放坐标 ? 显示缩放(元素) : 1
  return { left: 矩形.left * 倍率, top: 矩形.top * 倍率, right: 矩形.right * 倍率, bottom: 矩形.bottom * 倍率, width: 矩形.width * 倍率, height: 矩形.height * 倍率 }
}
