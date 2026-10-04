// Ribbon 功能区：按当前标签渲染功能组与按钮。
// 按钮只派发命令标识，不包含任何行为逻辑。
import React from 'react'
import { RIBBON_TABS, type RibbonTabSpec } from './tabSpecs'
import RibbonGroup from './RibbonGroup'
import RibbonButton from './RibbonButton'

interface Props {
  activeKey: string
  /** 标签声明，默认使用文字编辑器的六标签；表格传入自己的七标签 */
  tabs?: RibbonTabSpec[]
  /** 按钮被点击时回传命令标识与参数 */
  onCommand?: (命令标识: string, 参数?: string) => void
  /** 查询命令是否处于激活态 */
  获取激活态?: (命令标识: string) => boolean
  /** 查询命令是否不可用 */
  获取禁用态?: (命令标识: string) => boolean
  获取禁用原因?: (命令标识: string) => string | undefined
  /** 查询下拉按钮当前应展示的值 */
  获取当前值?: (命令标识: string) => string | undefined
  /** 下拉浮层打开前触发，用于保存编辑区选区快照 */
  onDropdownOpen?: () => void
}

const RibbonPanel = ({
  activeKey,
  tabs = RIBBON_TABS,
  onCommand,
  获取激活态,
  获取禁用态,
  获取禁用原因,
  获取当前值,
  onDropdownOpen,
}: Props) => {
  const 标签 = tabs.find((项) => 项.key === activeKey)
  if (标签 === undefined) {
    return null
  }

  return React.createElement(
    'div',
    { className: 'wps-ribbon-panel' },
    标签.groups.map((组) =>
      React.createElement(
        RibbonGroup,
        { key: 组.name, name: 组.name },
        组.items.map((项) =>
          React.createElement(RibbonButton, {
            key: `${组.name}-${项.commandId}-${项.label}`,
            icon: 项.icon,
            label: 项.label,
            size: 项.kind === 'small' ? 'small' : 'large',
            active: 获取激活态 ? 获取激活态(项.commandId) : false,
            disabled: 获取禁用态 ? 获取禁用态(项.commandId) : false,
            disabledReason: 获取禁用原因?.(项.commandId),
            currentValue: 项.options !== undefined ? (获取当前值 ? 获取当前值(项.commandId) : 项.currentValue) : undefined,
            options: 项.options,
            onClick: () => onCommand && onCommand(项.commandId, 项.固定参数),
            onSelect: (值: string) => onCommand && onCommand(项.commandId, 值),
            onDropdownOpen,
          })
        )
      )
    )
  )
}

export default RibbonPanel
