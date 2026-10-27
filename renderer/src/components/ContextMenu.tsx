// 右键菜单：浮层定位，支持分组分割与命令派发。
// 经 portal 挂到 body 并用 fixed 定位：视口坐标不受任何定位祖先/transform 影响，菜单始终贴着光标。
import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { 合并矩形, 读取可见矩形, 读取范围可见矩形, use边缘浮层, type 边界矩形, type 浮层边缘 } from './overlayPlacement'

export interface 菜单分割线 {
  type: 'divider'
}

export interface 菜单项 {
  type: 'item'
  /** 命令标识，命中时触发 onCommand(标识, 参数) */
  commandId: string
  /** 命令显示名称 */
  label: string
  /** 可选快捷键提示 */
  shortcut?: string
  /** 可选参数，命中时作为第二个参数传给 onCommand */
  commandParam?: string
  /** 是否禁用 */
  disabled?: boolean
}

export interface 菜单子项 {
  type: 'item'
  commandId: string
  label: string
  shortcut?: string
  commandParam?: string
  disabled?: boolean
  /** 子菜单内的子项 */
  children?: Array<菜单子项>
}

export interface 菜单分割线节点 {
  type: 'divider'
}

export interface 菜单组 {
  type: 'group'
  标题?: string
  子项: Array<菜单项 | 菜单分割线节点>
}

export type 菜单节点 = 菜单项 | 菜单分割线节点 | 菜单组

interface Props {
  /** 菜单是否可见 */
  open: boolean
  /** 显示横坐标 */
  x: number
  /** 显示纵坐标 */
  y: number
  /** 菜单项列表 */
  items: 菜单节点[]
  /** 命中菜单项时的回调 */
  onCommand: (命令标识: string, 参数?: string) => void
  取锚点?: () => 边界矩形 | null
  取避让?: () => 边界矩形[]
  优先边缘?: 浮层边缘[]
  className?: string
  名称?: string
  子菜单?: boolean
}

/** 判断节点是否为菜单项 */
function 是菜单项(节点: 菜单节点): 节点 is 菜单项 {
  return 节点.type === 'item'
}

/** 判断节点是否为分割线 */
function 是分割线(节点: 菜单节点): 节点 is 菜单分割线节点 {
  return 节点.type === 'divider'
}

/** 判断节点是否为菜单组 */
function 是菜单组(节点: 菜单节点): 节点 is 菜单组 {
  return 节点.type === 'group'
}

const 菜单面板宽 = 220
const 项高 = 32
const 菜单最大高 = 320
/** 菜单左上角相对光标的微小间隙，符合桌面右键菜单的贴边习惯 */

const ContextMenu = ({ open, x, y, items, onCommand, 取锚点, 取避让, 优先边缘, className = '', 名称 = '上下文菜单', 子菜单 = false }: Props) => {
  const 引用 = useRef<HTMLDivElement>(null)
  const 范围 = useRef<Range | null>(null), 上次打开 = useRef(false)
  if (open && !上次打开.current) {
    const 选区 = window.getSelection()
    范围.current = 选区 && !选区.isCollapsed && 选区.rangeCount ? 选区.getRangeAt(0).cloneRange() : null
  }
  上次打开.current = open
  const 默认锚点 = () => {
    const r = 读取范围可见矩形(范围.current)
    const 图 = 读取可见矩形(document.querySelector('.seal-image-frame'))
    return 合并矩形([...(r ? [r] : []), ...(图 ? [图] : [])])
  }
  const 项总数 = items.reduce((n, 项) => n + (项.type === 'group' ? 项.子项.length + (项.标题 ? 1 : 0) : 1), 0)
  const 偏移 = use边缘浮层(open, 引用, 取锚点 ?? 默认锚点, { 宽: 菜单面板宽, 高: Math.min(项总数 * 项高 + 8, 菜单最大高) }, 优先边缘 ?? ['right', 'left', 'bottom', 'top'], 取避让, 子菜单 ? undefined : { x, y }, `${x}:${y}`)
  useEffect(() => {
    if (!open || 子菜单) return
    document.body.classList.add('seal-context-menu-open')
    return () => { document.body.classList.remove('seal-context-menu-open') }
  }, [open, 子菜单])
  useEffect(() => {
    if (open && 子菜单) 引用.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus()
  }, [open, 子菜单])

  useEffect(() => {
    if (!open) {
      return
    }
    const 处理点击 = () => {
      // 点击任意位置关闭菜单
      onCommand('__close__')
    }
    document.addEventListener('click', 处理点击, { once: true })
    return () => {
      document.removeEventListener('click', 处理点击)
    }
  }, [open, onCommand])

  if (!open) {
    return null
  }

  const 渲染单项 = (节点: 菜单项, 下标: number) => {
    const 类名 = [
      'wps-context-menu__item',
      节点.disabled ? 'wps-context-menu__item--disabled' : '',
    ]
      .filter((类) => 类.length > 0)
      .join(' ')

    return React.createElement(
      'div',
      {
        key: `item-${下标}`,
        className: `${类名}${节点.commandId === 'delete' ? ' wps-context-menu__item--danger' : ''}`,
        role: 'menuitem',
        tabIndex: 节点.disabled ? -1 : 0,
        'aria-disabled': 节点.disabled === true,
        onClick: (事件: React.MouseEvent) => {
          事件.stopPropagation()
          if (!节点.disabled) {
            onCommand(节点.commandId, 节点.commandParam)
          }
        },
      },
      React.createElement('span', { className: 'wps-context-menu__item-label' }, 节点.label),
      节点.shortcut
        ? React.createElement('span', { className: 'wps-context-menu__item-shortcut', 'aria-hidden': true }, 节点.shortcut)
        : null
    )
  }

  const 渲染分割线 = (下标: number) =>
    React.createElement('div', { key: `divider-${下标}`, className: 'wps-context-menu__divider', role: 'separator' })

  const 渲染组 = (组: 菜单组, 下标: number) => {
    const 子元素: React.ReactNode[] = []
    let 键 = 0
    组.子项.forEach((子节点) => {
      if (是菜单项(子节点)) {
        子元素.push(渲染单项(子节点, 键))
      } else if (是分割线(子节点)) {
        子元素.push(渲染分割线(键))
      }
      键 += 1
    })

    return React.createElement(
      'div',
      { key: `group-${下标}`, role: 'group', 'aria-label': 组.标题 },
      组.标题
        ? React.createElement('div', { className: 'wps-context-menu__group-title', 'aria-hidden': true }, 组.标题)
        : null,
      ...子元素
    )
  }

  const 渲染内容 = () => {
    const 子元素: React.ReactNode[] = []
    items.forEach((节点, 下标) => {
      if (是菜单项(节点)) {
        子元素.push(渲染单项(节点, 下标))
      } else if (是分割线(节点)) {
        子元素.push(渲染分割线(下标))
      } else if (是菜单组(节点)) {
        子元素.push(渲染组(节点, 下标))
      }
    })
    return 子元素
  }

  return createPortal(
    React.createElement(
      'div',
      {
        ref: 引用,
        className: `wps-context-menu ${className}`,
        role: 'menu',
        'aria-label': 名称,
        'data-edge': 偏移?.边缘,
        style: {
          position: 'fixed',
          top: 0,
          left: 0,
          transform: `translate(${偏移?.x ?? 0}px, ${偏移?.y ?? 0}px)`,
          maxWidth: 偏移?.maxWidth,
          maxHeight: 偏移?.maxHeight,
          visibility: 偏移 ? undefined : 'hidden',
          zIndex: 9999,
        },
        onMouseDown: (事件: React.MouseEvent) => { 事件.preventDefault(); 事件.stopPropagation() },
        onContextMenu: (事件: React.MouseEvent) => 事件.preventDefault(),
        onKeyDown: (事件: React.KeyboardEvent<HTMLDivElement>) => {
          const 项 = Array.from(引用.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])
          const i = 项.indexOf(document.activeElement as HTMLElement)
          if (事件.key === 'Escape' || 事件.key === 'Tab' || 子菜单 && 事件.key === 'ArrowLeft') { if (事件.key !== 'Tab') 事件.preventDefault(); 事件.stopPropagation(); onCommand('__close__'); return }
          if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(事件.key)) {
            事件.preventDefault(); 事件.stopPropagation()
            const 下标 = 事件.key === 'Home' ? 0 : 事件.key === 'End' ? 项.length - 1 : 事件.key === 'ArrowDown' ? (i + 1) % 项.length : (i <= 0 ? 项.length : i) - 1
            项[下标]?.focus(); 项[下标]?.scrollIntoView?.({ block: 'nearest' })
          } else if (事件.key === 'Enter' || 事件.key === ' ') { 事件.preventDefault(); 事件.stopPropagation(); (document.activeElement as HTMLElement)?.click() }
        },
      },
      渲染内容()
    ),
    document.body
  )
}

export default ContextMenu
