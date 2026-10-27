import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

export interface 边界矩形 { left: number; top: number; right: number; bottom: number; width: number; height: number }
export type 浮层边缘 = 'top' | 'bottom' | 'right' | 'left'
export interface 边缘位置 { x: number; y: number; maxWidth: number; maxHeight: number; 边缘: 浮层边缘 }
const 限制 = (值: number, 小: number, 大: number) => Math.max(小, Math.min(大, 值))
export function 合并矩形(矩形: 边界矩形[]): 边界矩形 | null {
  const 有效 = 矩形.filter(r => r.width > 0 && r.height > 0)
  if (!有效.length) return null
  const left = Math.min(...有效.map(r => r.left)), top = Math.min(...有效.map(r => r.top))
  const right = Math.max(...有效.map(r => r.right)), bottom = Math.max(...有效.map(r => r.bottom))
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}
export function 读取可见矩形(元素: Element | Iterable<Element> | null): 边界矩形 | null {
  if (!元素) return null
  const 列表 = 元素 instanceof Element ? [元素] : Array.from(元素)
  const 结果: 边界矩形[] = []
  for (const 项 of 列表) {
    const r = 项.getBoundingClientRect()
    const 可见 = 裁剪可见矩形(r, 项.parentElement)
    if (可见) 结果.push(可见)
  }
  return 合并矩形(结果)
}
function 裁剪可见矩形(r: 边界矩形, 起始元素: Element | null): 边界矩形 | null {
    let left = Math.max(0, r.left), top = Math.max(0, r.top), right = Math.min(window.innerWidth, r.right), bottom = Math.min(window.innerHeight, r.bottom)
    for (let 父 = 起始元素; 父; 父 = 父.parentElement) {
      const 样式 = getComputedStyle(父), p = 父.getBoundingClientRect()
      if (p.width > 0 && /auto|scroll|hidden|clip/.test(样式.overflowX || 样式.overflow)) { left = Math.max(left, p.left); right = Math.min(right, p.right) }
      if (p.height > 0 && /auto|scroll|hidden|clip/.test(样式.overflowY || 样式.overflow)) { top = Math.max(top, p.top); bottom = Math.min(bottom, p.bottom) }
    }
    return right > left && bottom > top ? { left, top, right, bottom, width: right - left, height: bottom - top } : null
}
export function 读取范围可见矩形(范围: Range | null): 边界矩形 | null {
  try {
    const r = 范围?.getBoundingClientRect?.()
    if (!r || !r.width || !r.height) return null
    const 节点 = 范围?.commonAncestorContainer
    return 裁剪可见矩形(r, 节点 instanceof Element ? 节点 : 节点?.parentElement ?? null)
  } catch { return null }
}

/** 只在锚点外围布局；无法完整容纳时缩小可滚动面板，绝不钳制到选区内部。 */
export function 计算边缘位置(锚点: 边界矩形, 尺寸: { 宽: number; 高: number }, 视口: { 宽: number; 高: number; left?: number; top?: number }, 顺序: 浮层边缘[] = ['top', 'bottom', 'right', 'left'], 避让: 边界矩形[] = []): 边缘位置 | null {
  const 留白 = 12, 间隔 = 8
  const l = (视口.left ?? 0) + 留白, t = (视口.top ?? 0) + 留白, r = (视口.left ?? 0) + 视口.宽 - 留白, b = (视口.top ?? 0) + 视口.高 - 留白
  const 保护 = 合并矩形([锚点, ...避让]) ?? 锚点
  const 候选: 边缘位置[] = []
  // 先紧邻原锚点尝试；若子菜单旁有图片等障碍，再沿整个保护区域择位。
  for (const 区 of [锚点, 保护]) for (const 边缘 of 顺序) {
    const 横 = 边缘 === 'top' || 边缘 === 'bottom'
    const 可用宽 = 横 ? r - l : 边缘 === 'right' ? r - 区.right - 间隔 : 区.left - 间隔 - l
    const 可用高 = 横 ? 边缘 === 'top' ? 区.top - 间隔 - t : b - 区.bottom - 间隔 : b - t
    if (可用宽 < Math.min(80, 尺寸.宽) || 可用高 < Math.min(64, 尺寸.高)) continue
    const 宽 = Math.min(尺寸.宽, 可用宽), 高 = Math.min(尺寸.高, 可用高)
    const x = 横 ? 限制(区.left + 区.width / 2 - 宽 / 2, l, r - 宽) : 边缘 === 'right' ? 区.right + 间隔 : 区.left - 间隔 - 宽
    const y = 横 ? 边缘 === 'top' ? 区.top - 间隔 - 高 : 区.bottom + 间隔 : 限制(锚点.top, t, b - 高)
    if ([锚点, ...避让].some(a => x < a.right + 间隔 && x + 宽 > a.left - 间隔 && y < a.bottom + 间隔 && y + 高 > a.top - 间隔)) continue
    const 位置 = { x, y, maxWidth: 可用宽, maxHeight: 可用高, 边缘 }
    if (宽 >= 尺寸.宽 && 高 >= 尺寸.高) return 位置
    候选.push(位置)
  }
  return 候选.sort((a, b) => Math.min(b.maxWidth, 尺寸.宽) * Math.min(b.maxHeight, 尺寸.高) - Math.min(a.maxWidth, 尺寸.宽) * Math.min(a.maxHeight, 尺寸.高))[0] ?? null
}

/** 实测面板与实时锚点；捕获内部滚动、缩放、触摸可视区和窗口尺寸变化。 */
export function use边缘浮层(打开: boolean, 面板: RefObject<HTMLElement | null>, 取锚点: () => 边界矩形 | null, 尺寸: { 宽: number; 高: number }, 顺序: 浮层边缘[] = ['top', 'bottom', 'right', 'left'], 取避让: () => 边界矩形[] = () => [], 光标?: { x: number; y: number }, 测距键?: unknown) {
  const 配置 = useRef({ 取锚点, 尺寸, 顺序, 取避让, 光标 })
  配置.current = { 取锚点, 尺寸, 顺序, 取避让, 光标 }
  const [位置, set位置] = useState<边缘位置 | null>(null)
  const 更新 = useRef(() => {})
  更新.current = () => {
    if (!打开 || !面板.current) return
    const el = 面板.current, 原宽 = el.style.maxWidth, 原高 = el.style.maxHeight
    el.style.maxWidth = ''; el.style.maxHeight = ''
    const 实际 = el.getBoundingClientRect()
    el.style.maxWidth = 原宽; el.style.maxHeight = 原高
    const c = 配置.current, 宽 = 实际.width || c.尺寸.宽, 高 = 实际.height || c.尺寸.高
    const vv = window.visualViewport, 视口 = { 宽: vv?.width ?? window.innerWidth, 高: vv?.height ?? window.innerHeight, left: vv?.offsetLeft ?? 0, top: vv?.offsetTop ?? 0 }
    const 锚点 = c.取锚点()
    const 新 = 锚点 ? 计算边缘位置(锚点, { 宽, 高 }, 视口, c.顺序, c.取避让()) : c.光标 ? {
      x: 限制(c.光标.x + 宽 + 2 > 视口.宽 - 12 ? c.光标.x - 宽 - 2 : c.光标.x + 2, 12, 视口.宽 - 宽 - 12),
      y: 限制(c.光标.y + 高 + 2 > 视口.高 - 12 ? c.光标.y - 高 - 2 : c.光标.y + 2, 12, 视口.高 - 高 - 12),
      maxWidth: 视口.宽 - 24, maxHeight: 视口.高 - 24, 边缘: 'right' as const,
    } : null
    const 约束 = 新 ? { ...新, maxWidth: Math.min(宽, 新.maxWidth), maxHeight: Math.min(高, 新.maxHeight) } : null
    set位置(旧 => JSON.stringify(旧) === JSON.stringify(约束) ? 旧 : 约束)
  }
  // 之前这里没有依赖数组，任何 re-render 都会在 layout 阶段重新测量并 setState。
  // ArkWeb 的面板尺寸受键盘/缩放影响时会在两个值之间来回，形成同步嵌套更新。
  // 只在打开状态或锚点输入变化时测一次，滚动/缩放由下面的观察器负责。
  useLayoutEffect(() => { if (打开) 更新.current() }, [打开, 面板, 测距键])
  useLayoutEffect(() => {
    if (!打开) return
    const 定位 = (事件?: Event) => { if (事件?.target instanceof Node && 面板.current?.contains(事件.target)) return; 更新.current() }
    const 观察 = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => 更新.current())
    if (面板.current) 观察?.observe(面板.current)
    window.addEventListener('scroll', 定位, true); window.addEventListener('resize', 定位)
    window.visualViewport?.addEventListener('resize', 定位); window.visualViewport?.addEventListener('scroll', 定位)
    return () => { 观察?.disconnect(); window.removeEventListener('scroll', 定位, true); window.removeEventListener('resize', 定位); window.visualViewport?.removeEventListener('resize', 定位); window.visualViewport?.removeEventListener('scroll', 定位) }
  }, [打开, 面板])
  return 位置
}
