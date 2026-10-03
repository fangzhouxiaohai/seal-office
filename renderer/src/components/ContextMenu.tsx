// 右键菜单：浮层定位，支持分组分割与命令派发。
// 经 portal 挂到 body 并用 fixed 定位：视口坐标不受任何定位祖先/transform 影响，菜单始终贴着光标。
import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

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
/** 菜单左上角相对光标的微小间隙，符合 Windows/WPS 右键菜单的贴边习惯 */
const 光标间隙 = 2

const ContextMenu = ({ open, x, y, items, onCommand }: Props) => {
  const 引用 = useRef<HTMLDivElement>(null)
  const [偏移, set偏移] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  useEffect(() => {
    if (!open) {
      return
    }
    const 视口宽 = window.innerWidth
    const 视口高 = window.innerHeight
    // 计算菜单实际高度（受最大高度限制）
    const 项总数 = items.reduce((合计, 节点) => {
      if (节点.type === 'group') {
        return 合计 + 节点.子项.length + (节点.标题 !== undefined ? 1 : 0)
      }
      return 合计 + 1
    }, 0)
    const 原始高 = 项总数 * 项高 + 8
    const 面板高 = Math.min(原始高, 菜单最大高)
    // 定位：菜单左上角贴着光标（间隙 2px）；越出视口边缘时向左/向上翻转
    let 左 = x + 光标间隙
    if (左 + 菜单面板宽 > 视口宽 - 8) {
      左 = Math.max(8, x - 菜单面板宽 - 光标间隙)
    }
    let 上 = y + 光标间隙
    if (上 + 面板高 > 视口高 - 8) {
      上 = Math.max(8, y - 面板高 - 光标间隙)
    }
    set偏移({ top: 上, left: 左 })
  }, [open, x, y, items])

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
        className: 类名,
        onClick: (事件: React.MouseEvent) => {
          事件.stopPropagation()
          if (!节点.disabled) {
            onCommand(节点.commandId, 节点.commandParam)
          }
        },
      },
      React.createElement('span', { className: 'wps-context-menu__item-label' }, 节点.label),
      节点.shortcut
        ? React.createElement('span', { className: 'wps-context-menu__item-shortcut' }, 节点.shortcut)
        : null
    )
  }

  const 渲染分割线 = (下标: number) =>
    React.createElement('div', { key: `divider-${下标}`, className: 'wps-context-menu__divider' })

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
      { key: `group-${下标}` },
      组.标题
        ? React.createElement('div', { className: 'wps-context-menu__group-title' }, 组.标题)
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
        className: 'wps-context-menu',
        style: {
          position: 'fixed',
          top: 0,
          left: 0,
          transform: `translate(${偏移.left}px, ${偏移.top}px)`,
          zIndex: 9999,
        },
        onMouseDown: (事件: React.MouseEvent) => 事件.stopPropagation(),
        onContextMenu: (事件: React.MouseEvent) => 事件.preventDefault(),
      },
      渲染内容()
    ),
    document.body
  )
}

export default ContextMenu
