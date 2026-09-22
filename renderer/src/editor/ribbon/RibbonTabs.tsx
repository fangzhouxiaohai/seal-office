// Ribbon 标签行：开始、插入、页面布局、引用、审阅、视图。
import React from 'react'
import { RIBBON_TABS, type RibbonTabSpec } from './tabSpecs'

interface Props {
  activeKey: string
  onChange: (键: string) => void
  /** 标签声明，默认使用文字编辑器的六标签；表格传入自己的七标签 */
  tabs?: RibbonTabSpec[]
}

const RibbonTabs = ({ activeKey, onChange, tabs = RIBBON_TABS }: Props) =>
  React.createElement(
    'div',
    { className: 'wps-ribbon-tabs', role: 'tablist' },
    tabs.map((标签) =>
      React.createElement(
        'button',
        {
          key: 标签.key,
          type: 'button',
          role: 'tab',
          'aria-selected': 标签.key === activeKey,
          className: `wps-ribbon-tab${标签.key === activeKey ? ' wps-ribbon-tab--active' : ''}`,
          onClick: () => onChange(标签.key),
        },
        标签.label
      )
    )
  )

export default RibbonTabs
