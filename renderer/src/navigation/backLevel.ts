// 移动端返回键层级判定：把「当前是一级页面还是二级页面」算成唯一答案。
//
// 为什么集中在这里：用户要求的判据是「底部 tab 是否可见」，
// 这个信息只有网页层（有 DOM 与计算样式）知道；原生层拿不到，
// 过去只能凭 workspaceReady / errorText 猜，结果与用户预期不一致。
// 现在网页层算出结论写进状态消息，原生层照着执行，规则只有一份。
import type { ModuleKey } from '../navConfig'

/** 返回键的三种去向 */
export type 返回去向 = '回到桌面' | '关闭浮层' | '返回上一级'

/** 一级页面：这五个 tab 落地页。进入编辑器、设置、帮助都算二级。 */
const 一级模块: ReadonlySet<ModuleKey> = new Set<ModuleKey>(['home'])

/**
 * 判断底部标签栏当前是否真的可见。
 * 只看存在性不够：键盘弹出、窄屏以外的断点都会用 CSS 把它藏起来，
 * 此时用户看不到 tab，返回键就不该直接退到桌面。
 */
export function 底部标签栏可见(doc: Document, 视图: Window = doc.defaultView as Window): boolean {
  const 栏 = doc.querySelector('.seal-mobile-nav')
  if (栏 === null) return false
  if (typeof 视图?.getComputedStyle !== 'function') return 栏.getClientRects().length > 0
  const 样式 = 视图.getComputedStyle(栏)
  if (样式.display === 'none' || 样式.visibility === 'hidden') return false
  // jsdom 不做布局，getClientRects 为空不代表真的不可见；
  // 浏览器里它为空则确定没渲染出来，两者分别处理避免测试与真机规则打架。
  return 视图.innerWidth === 0 ? true : 栏.getClientRects().length > 0
}

/**
 * 计算按下返回键后的去向。
 * @param 模块 当前模块（home 为首页，其余为编辑器或二级页面）
 * @param 浮层数 可见的弹窗 / 抽屉数量
 */
export function 计算返回去向({ 模块, 浮层数 }: { 模块: ModuleKey; 浮层数: number }): 返回去向 {
  if (浮层数 > 0) return '关闭浮层'
  if (!一级模块.has(模块)) return '返回上一级'
  return 底部标签栏可见(document) ? '回到桌面' : '返回上一级'
}

/** 只有「回到桌面」需要原生层直接退到后台，其余都交给网页层处理 */
export function 是否需要回到桌面(去向: 返回去向): boolean {
  return 去向 === '回到桌面'
}
