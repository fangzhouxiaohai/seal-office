// Ribbon 标签行：开始、插入、页面布局、引用、审阅、视图。
import React from 'react'
import { RIBBON_TABS } from './tabSpecs'

interface Props {
  activeKey: string
  onChange: (键: string) => void
}

const RibbonTabs = ({ activeKey, onChange }: Props) =>
  React.createElement(
    'div',
    { className: 'wps-ribbon-tabs', role: 'tablist' },
    RIBBON_TABS.map((标签) =>
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
