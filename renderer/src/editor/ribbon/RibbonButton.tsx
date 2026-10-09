// Ribbon 按钮：大按钮（图标在上、文字在下）、小按钮（紧凑图标）与下拉按钮。
import React from 'react'
import { Dropdown } from 'antd'
import Icon from '../../components/Icon'

export interface 下拉选项 {
  label: string
  value: string
}

interface Props {
  icon: string
  label: string
  size?: 'large' | 'small'
  active?: boolean
  disabled?: boolean
  disabledReason?: string
  /** 下拉按钮当前展示的值 */
  currentValue?: string
  /** 支持字符串或键值对两种写法 */
  options?: Array<string | 下拉选项>
  onClick?: () => void
  onSelect?: (值: string) => void
  /**
   * 下拉浮层即将打开时回调。
   * antd 浮层渲染在 body 下会抢走焦点并折叠编辑区选区，
   * 需在此刻保存选区快照，等到菜单项 click 时选区已经丢失。
   */
  onDropdownOpen?: () => void
}

/**
 * 阻止鼠标按下时的默认行为，避免按钮抢占焦点导致编辑区选区丢失，
 * 这会让加粗、颜色等针对选区的命令失效。
 */
const 保持选区 = (事件: React.MouseEvent) => {
  事件.preventDefault()
}

/** 把字符串选项规范化为键值对 */
function 规范化选项(选项列表: Array<string | 下拉选项>): 下拉选项[] {
  return 选项列表.map((项) => (typeof 项 === 'string' ? { label: 项, value: 项 } : 项))
}

const RibbonButton = ({
  icon,
  label,
  size = 'large',
  active = false,
  disabled = false,
  disabledReason,
  currentValue,
  options,
  onClick,
  onSelect,
  onDropdownOpen,
}: Props) => {
  const 类名 = [
    'wps-ribbon-button',
    `wps-ribbon-button--${size}`,
    active ? 'wps-ribbon-button--active' : '',
    disabled ? 'wps-ribbon-button--disabled' : '',
  ]
    .filter((项) => 项.length > 0)
    .join(' ')

  if (options !== undefined && options.length > 0) {
    const 规范化后 = 规范化选项(options)
    return React.createElement(
      Dropdown,
      {
        menu: {
          items: 规范化后.map((项) => ({ key: 项.value, label: 项.label })),
          onClick: ({ key }: { key: string }) => onSelect && onSelect(key),
          style: { maxHeight: 'min(60vh, 420px)', overflowY: 'auto' },
        },
        trigger: ['click'],
        disabled,
        // 浮层打开瞬间保存选区，此时编辑区选区尚未被浮层折叠
        onOpenChange: (打开: boolean) => {
          if (打开 && onDropdownOpen) {
            onDropdownOpen()
          }
        },
      },
      React.createElement(
        'button',
        { type: 'button', className: 类名, 'aria-label': label, title: disabledReason ?? label, disabled, onMouseDown: 保持选区 },
        React.createElement(Icon, { name: icon, size: 16 }),
        React.createElement('span', { className: 'wps-ribbon-button__value' }, currentValue ?? label),
        React.createElement('span', { className: 'wps-ribbon-button__caret' })
      )
    )
  }

  return React.createElement(
    'button',
    {
      type: 'button',
      className: 类名,
      'aria-label': label,
      title: disabledReason ?? label,
      disabled,
      onMouseDown: 保持选区,
      onClick: disabled ? undefined : onClick,
    },
    React.createElement(Icon, { name: icon, size: size === 'large' ? 20 : 16 }),
    size === 'large' ? React.createElement('span', { className: 'wps-ribbon-button__label' }, label) : null
  )
}

export default RibbonButton
