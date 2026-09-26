// 右键菜单：浮层定位，支持分组分割与命令派发。
import React, { useEffect, useRef, useState } from 'react'

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
const 菜单横向偏移 = 10

const ContextMenu = ({ open, x, y, items, onCommand }: Props) => {
  const 引用 = useRef<HTMLDivElement>(null)
  const [偏移, set偏移] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  useEffect(() => {
    if (!open || 引用.current === null) {
      return
    }
    const 视口宽 = window.innerWidth
    const 视口高 = window.innerHeight
    const 面板宽 = 菜单面板宽
    // 计算菜单实际高度（受最大高度限制）
    const 原始高 = items.length * 项高 + 8
    const 面板高 = Math.min(原始高, 菜单最大高)
    // 定位：将菜单位于光标正下方，视口居中显示
    const 左 = Math.max(8, Math.min(x + 菜单横向偏移 - Math.floor(面板宽 / 2), 视口宽 - 面板宽 - 8))
    const 上 = y + 菜单横向偏移
    const 最终上 = Math.max(8, Math.min(上, 视口高 - 面板高 - 8))
    set偏移({ top: 最终上, left: 左 })
  }, [open, x, y, items.length])

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

  return React.createElement(
    'div',
    {
      ref: 引用,
      className: 'wps-context-menu',
      style: {
        position: 'absolute',
        top: 0,
        left: 0,
        transform: `translate(${偏移.left}px, ${偏移.top}px)`,
        zIndex: 9999,
      },
      onMouseDown: (事件: React.MouseEvent) => 事件.stopPropagation(),
    },
    渲染内容()
  )
}

export default ContextMenu
