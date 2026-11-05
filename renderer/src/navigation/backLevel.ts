// 移动端返回键层级判定：按底部主导航在当前可视区的状态决定。
//
// 为什么集中在这里：用户要求的判据是「底部 tab 是否可见」，
// 这个信息只有网页层（有 DOM 与计算样式）知道；原生层拿不到，
// 过去只能凭 workspaceReady / errorText 猜，结果与用户预期不一致。
// 现在网页层算出结论写进状态消息，原生层照着执行，规则只有一份。
/** 返回键的三种去向 */
export type 返回去向 = '回到桌面' | '关闭浮层' | '返回上一级'

/**
 * 判断底部标签栏当前是否真的可见。
 * 只看存在性不够：键盘弹出、窄屏以外的断点都会用 CSS 把它藏起来，
 * 此时用户看不到 tab，返回键就不该直接退到桌面。
 */
export function 底部标签栏可见(doc: Document, 视图: Window = doc.defaultView as Window): boolean {
  const 栏 = doc.querySelector('.seal-mobile-nav')
  if (栏 === null) return false
  // 全屏阅读使用 body 门户层，底部栏仍有布局矩形，但主界面已被遮挡并设为 inert。
  const 全屏元素 = doc.fullscreenElement
  if (全屏元素 && 全屏元素 !== 栏 && !全屏元素.contains(栏)) return false
  for (let 节点: Element | null = 栏; 节点; 节点 = 节点.parentElement) {
    if (节点.hasAttribute('hidden') || 节点.hasAttribute('inert') || (节点 as HTMLElement).inert || 节点.getAttribute('aria-hidden') === 'true') return false
    if (typeof 视图?.getComputedStyle === 'function') {
      const 样式 = 视图.getComputedStyle(节点)
      if (样式.display === 'none' || 样式.visibility === 'hidden' || 样式.opacity === '0') return false
    }
  }
  // 只有标签栏的实际矩形与可视区相交，才满足「用户能看到底部主导航」。
  // 无尺寸的测试视图保留样式判定，真实 WebView 必须提供有效布局矩形。
  if (视图.innerWidth === 0 || 视图.innerHeight === 0) return true
  const 在可视区 = (矩形: DOMRect) => 矩形.bottom > 0 && 矩形.top < 视图.innerHeight && 矩形.right > 0 && 矩形.left < 视图.innerWidth
  if (!Array.from(栏.getClientRects()).some(在可视区)) return false
  // 弹出的整屏阅读器可能盖住标签栏，却没有改变栏本身的 display 和矩形。
  if (typeof doc.elementFromPoint !== 'function') return true
  const 目标 = Array.from(栏.querySelectorAll('button'))
  for (const 节点 of 目标.length > 0 ? 目标 : [栏]) {
    for (const 矩形 of Array.from(节点.getClientRects())) {
      if (!在可视区(矩形)) continue
      const x = Math.max(0, Math.min(视图.innerWidth - 1, (Math.max(0, 矩形.left) + Math.min(视图.innerWidth, 矩形.right)) / 2))
      const y = Math.max(0, Math.min(视图.innerHeight - 1, (Math.max(0, 矩形.top) + Math.min(视图.innerHeight, 矩形.bottom)) / 2))
      const 命中 = doc.elementFromPoint(x, y)
      if (命中 === 栏 || (命中 !== null && 栏.contains(命中))) return true
    }
  }
  return false
}

/**
 * 计算按下返回键后的去向。
 * @param 浮层数 可见的弹窗 / 抽屉数量
 */
export function 计算返回去向({ 浮层数 }: { 浮层数: number }): 返回去向 {
  if (浮层数 > 0) return '关闭浮层'
  return 底部标签栏可见(document) ? '回到桌面' : '返回上一级'
}

/** 只有「回到桌面」需要原生层直接退到后台，其余都交给网页层处理 */
export function 是否需要回到桌面(去向: 返回去向): boolean {
  return 去向 === '回到桌面'
}
