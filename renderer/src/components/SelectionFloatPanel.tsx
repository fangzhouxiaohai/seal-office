// 选区浮窗：选中内容后浮出的功能面板。定位、跟随、关闭规则都集中在这里，四类文件共用。
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'

export interface 浮窗按钮 {
  /** 稳定标识：命令 id 或动作名 */
  id: string
  /** 可读名称，同时作为无障碍名称 */
  标签: string
  图标?: string
  /** 分组序号：不同序号之间画分割线 */
  分组?: number
  禁用?: boolean
  /** 带下拉的按钮：点击后再展开同一分组内后续按钮 */
  执行: () => void
}

export interface 选区矩形 {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface 浮窗位置 {
  x: number
  y: number
  /** 面板放在选区上方还是下方，供样式调整动画与圆角 */
  在上方: boolean
  /** 保留原选区，渲染后按面板实际尺寸重新定位。 */
  锚点?: 选区矩形
}

const 面板宽度估算 = 360
const 面板高度估算 = 46
const 与选区间距 = 8
const 视口留白 = 12

/** 依据选区矩形算出面板位置：优先放在选区上方，空间不足改放下方，并水平居中且不出屏 */
export function 计算浮窗位置(选区: 选区矩形, 视口: { 宽: number; 高: number }, 面板尺寸 = { 宽: 面板宽度估算, 高: 面板高度估算 }): 浮窗位置 | null {
  if (!(选区.width > 0) && !(选区.height > 0)) return null
  const 期望左 = 选区.left + 选区.width / 2 - 面板尺寸.宽 / 2
  const 最大左 = Math.max(视口留白, 视口.宽 - 面板尺寸.宽 - 视口留白)
  const x = Math.min(最大左, Math.max(视口留白, 期望左))
  const 上方 = 选区.top - 面板尺寸.高 - 与选区间距
  if (上方 >= 视口留白) return { x, y: 上方, 在上方: true, 锚点: 选区 }
  const 下方 = 选区.bottom + 与选区间距
  const 最大上 = Math.max(视口留白, 视口.高 - 面板尺寸.高 - 视口留白)
  return { x, y: Math.max(视口留白, Math.min(最大上, 下方)), 在上方: false, 锚点: 选区 }
}

/** 表格、演示、PDF 这类没有 DOM 选区的模块：以锚点元素的矩形定位浮窗 */
export function 从元素计算浮窗位置(元素: HTMLElement | null, 视口: { 宽: number; 高: number }, 面板尺寸 = { 宽: 面板宽度估算, 高: 面板高度估算 }): 浮窗位置 | null {
  if (!元素) return null
  const 矩形 = 元素.getBoundingClientRect()
  return 计算浮窗位置({ left: 矩形.left, top: 矩形.top, right: 矩形.right, bottom: 矩形.bottom, width: 矩形.width, height: 矩形.height }, 视口, 面板尺寸)
}

/** 取当前选区矩形；没有有效选区或环境不提供矩形时返回 null */
export function 读取选区矩形(选择: Selection | null = typeof window === 'undefined' ? null : window.getSelection()): 选区矩形 | null {
  if (!选择 || 选择.isCollapsed || 选择.rangeCount === 0) return null
  const 文本 = 选择.toString()
  if (文本.trim() === '') return null
  const 范围 = 选择.getRangeAt(0)
  // 环境差异：部分实现只有 getClientRects，个别测试环境两者都缺，取不到就不出浮窗
  let 矩形: { left: number; top: number; right: number; bottom: number; width: number; height: number } | null = null
  try {
    if (typeof 范围.getBoundingClientRect === 'function') 矩形 = 范围.getBoundingClientRect()
    else if (typeof 范围.getClientRects === 'function') 矩形 = 范围.getClientRects()[0] ?? null
  } catch { 矩形 = null }
  if (矩形 === null) return null
  if (矩形.width === 0 && 矩形.height === 0) return null
  return { left: 矩形.left, top: 矩形.top, right: 矩形.right, bottom: 矩形.bottom, width: 矩形.width, height: 矩形.height }
}

interface 浮窗属性 {
  打开: boolean
  位置: 浮窗位置 | null
  按钮: 浮窗按钮[]
  on关闭: () => void
  名称: string
}

/** 只负责呈现：不抢焦点（mousedown 阻止默认），Esc 与点击外部由调用方决定 */
export const SelectionFloatPanel = ({ 打开, 位置, 按钮, on关闭, 名称 }: 浮窗属性) => {
  const 面板引用 = useRef<HTMLDivElement>(null)
  const [实测位置, set实测位置] = useState<浮窗位置 | null>(null)
  useLayoutEffect(() => {
    if (!打开 || !位置 || !按钮.length) return
    const 面板 = 面板引用.current
    if (!面板) return
    const 定位 = () => {
      const 矩形 = 面板.getBoundingClientRect()
      if (!矩形.width || !矩形.height) return
      const 视口 = { 宽: document.documentElement.clientWidth || window.innerWidth, 高: document.documentElement.clientHeight || window.innerHeight }
      const 新位置 = 位置.锚点
        ? 计算浮窗位置(位置.锚点, 视口, { 宽: 矩形.width, 高: 矩形.height })
        : { ...位置, x: Math.max(视口留白, Math.min(位置.x, 视口.宽 - 矩形.width - 视口留白)), y: Math.max(视口留白, Math.min(位置.y, 视口.高 - 矩形.height - 视口留白)) }
      set实测位置(旧 => 旧?.x === 新位置?.x && 旧?.y === 新位置?.y && 旧?.在上方 === 新位置?.在上方 ? 旧 : 新位置)
    }
    定位()
    const 观察 = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(定位)
    观察?.observe(面板)
    window.addEventListener('resize', 定位)
    return () => { 观察?.disconnect(); window.removeEventListener('resize', 定位) }
  }, [打开, 位置, 按钮])
  if (!打开 || 位置 === null || 按钮.length === 0) return null
  const 显示位置 = 实测位置 ?? 位置
  const 图标映射: Record<string, string> = { brush: 'format-painter', strike: 'strikethrough', highlight: 'shading', color: 'wordart', clear: 'trash', list: 'bullet-list', 'number-list': 'numbered-list', sparkle: 'ai', fill: 'shading', merge: 'table', wrap: 'paragraph-mark', sum: 'formula', delete: 'trash' }
  const 分组 = 按钮.reduce<number[]>((合计, 项) => {
    const 组 = 项.分组 ?? 0
    if (合计[合计.length - 1] !== 组) 合计.push(组)
    return 合计
  }, [])
  return createPortal(
    <div
      ref={面板引用}
      className={`wps-float-panel${显示位置.在上方 ? '' : ' wps-float-panel--below'}`}
      style={{ left: 显示位置.x, top: 显示位置.y }}
      role="toolbar"
      aria-label={名称}
      // 阻止默认不改变选区，用户点完面板还能继续操作选中的内容
      onMouseDown={(事件) => 事件.preventDefault()}
      onContextMenu={(事件) => 事件.preventDefault()}
    >
      <div className="wps-float-panel__actions">{按钮.map((项, 下标) => {
        const 需要分割线 = 下标 > 0 && 按钮[下标 - 1].分组 !== 项.分组 && 分组.length > 1
        return (
          <React.Fragment key={项.id}>
            {需要分割线 ? <span className="wps-float-panel__divider" aria-hidden="true" /> : null}
            <button
              type="button"
              className={`wps-float-panel__item${项.id.startsWith('ai.') ? ' wps-float-panel__item--ai' : ''}`}
              title={项.标签}
              aria-label={项.标签}
              disabled={项.禁用 === true}
              onClick={() => 项.执行()}
            >
              {项.图标 || 项.id.startsWith('ai.') ? <Icon className="wps-float-panel__icon" name={图标映射[项.图标 ?? ''] ?? 项.图标 ?? 'ai'} size={14} /> : null}
              <span className="wps-float-panel__label">{项.标签}</span>
            </button>
          </React.Fragment>
        )
      })}</div>
      <button type="button" className="wps-float-panel__close" aria-label={`关闭${名称}`} title="关闭" onClick={on关闭}>×</button>
    </div>, document.body
  )
}

interface 钩子选项 {
  /** 允许出现浮窗的容器；为空时监听整页 */
  容器?: React.RefObject<HTMLElement | null>
  /** 生成按钮；返回空数组表示当前不显示浮窗 */
  取按钮: () => 浮窗按钮[]
  /** 关闭时通知调用方（例如收起菜单） */
  on关闭?: () => void
  /** 关闭按钮等交互后是否保留选中内容 */
  保留选区?: boolean
}

/**
 * 选中内容后自动浮出面板：监听选区变化与滚动，返回面板所需的状态。
 * 面板不会抢走焦点，滚动或选区消失即关闭，Esc 也可以关闭。
 */
export function use选区浮窗({ 容器, 取按钮, on关闭 }: 钩子选项) {
  const [打开, set打开] = useState(false)
  const [位置, set位置] = useState<浮窗位置 | null>(null)
  const [按钮, set按钮] = useState<浮窗按钮[]>([])
  const 按钮引用 = useRef(取按钮)
  按钮引用.current = 取按钮
  const 关闭引用 = useRef(on关闭)
  关闭引用.current = on关闭

  useEffect(() => {
    const 关闭 = () => {
      set打开(false)
      set位置(null)
      关闭引用.current?.()
    }
    const 同步 = () => {
      const 选择 = window.getSelection()
      const 矩形 = 读取选区矩形(选择)
      if (矩形 === null) { 关闭(); return }
      // 选区在容器之外（例如助手面板）时不出浮窗
      const 节点 = 容器?.current
      if (节点 && 选择 && 选择.anchorNode && !节点.contains(选择.anchorNode)) { 关闭(); return }
      const 新按钮 = 按钮引用.current()
      if (新按钮.length === 0) { 关闭(); return }
      const 面板 = 节点
        ? { 宽: Math.min(面板宽度估算, Math.max(160, 新按钮.length * 46 + 48)), 高: 面板高度估算 }
        : { 宽: 面板宽度估算, 高: 面板高度估算 }
      const 新位置 = 计算浮窗位置(矩形, { 宽: window.innerWidth, 高: window.innerHeight }, 面板)
      if (新位置 === null) { 关闭(); return }
      set按钮(新按钮)
      set位置(新位置)
      set打开(true)
    }
    const 收起 = (事件: Event) => {
      // 小窗口内浮窗自身滚动不能收起；文档或窗口滚动仍收起。
      if (事件.target instanceof Element && 事件.target.closest('.wps-float-panel')) return
      关闭()
    }
    const 键盘 = (事件: KeyboardEvent) => { if (事件.key === 'Escape') 关闭() }
    document.addEventListener('selectionchange', 同步)
    document.addEventListener('mouseup', 同步)
    document.addEventListener('keyup', 同步)
    // 滚动会改变选区位置，先收起避免面板与内容错位
    window.addEventListener('scroll', 收起, true)
    window.addEventListener('resize', 收起)
    document.addEventListener('keydown', 键盘)
    return () => {
      document.removeEventListener('selectionchange', 同步)
      document.removeEventListener('mouseup', 同步)
      document.removeEventListener('keyup', 同步)
      window.removeEventListener('scroll', 收起, true)
      window.removeEventListener('resize', 收起)
      document.removeEventListener('keydown', 键盘)
    }
  }, [容器])

  return { 打开, 位置, 按钮, 关闭: () => { set打开(false); set位置(null); 关闭引用.current?.() } }
}

export default SelectionFloatPanel
