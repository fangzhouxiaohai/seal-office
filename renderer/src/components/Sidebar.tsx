// 左侧导航：首页视图渲染分组导航，编辑器视图渲染返回入口与模块名。
import React from 'react'
import { NAV_GROUPS } from '../routes'
import Icon from './Icon'

interface Props {
  mode?: 'home' | 'editor'
  activeKey?: string
  onSelect?: (键: string) => void
  moduleLabel?: string
  onBack?: () => void
}

/** 编辑器视图下的占位菜单项，功能尚未实现，仅作结构展示 */
const 编辑器菜单 = ['开始', '插入', '页面布局', '引用', '审阅', '视图']

const Sidebar = ({ mode = 'home', activeKey, onSelect, moduleLabel, onBack }: Props) => {
  if (mode === 'editor') {
    return React.createElement(
      'nav',
      { className: 'wps-sidebar' },
      React.createElement(
        'button',
        { type: 'button', className: 'wps-sidebar__back', onClick: onBack },
        React.createElement(Icon, { name: 'arrow-left', size: 16 }),
        React.createElement('span', null, '返回首页')
      ),
      React.createElement(
        'div',
        { className: 'wps-sidebar__group' },
        React.createElement(
          'div',
          { className: 'wps-nav-item wps-nav-item--active' },
          React.createElement(Icon, { name: 'doc-empty', size: 18, className: 'wps-nav-item__icon' }),
          React.createElement('span', { className: 'wps-nav-item__label' }, moduleLabel ?? '文档')
        ),
        编辑器菜单.map((名称) =>
          React.createElement(
            'div',
            { key: 名称, className: 'wps-nav-item wps-nav-item--disabled' },
            React.createElement(Icon, { name: 'grid', size: 18, className: 'wps-nav-item__icon' }),
            React.createElement('span', { className: 'wps-nav-item__label' }, 名称)
          )
        )
      )
    )
  }

  return React.createElement(
    'nav',
    { className: 'wps-sidebar' },
    NAV_GROUPS.map((分组, 分组下标) =>
      React.createElement(
        'div',
        { key: `分组-${分组下标}`, className: 'wps-sidebar__group' },
        分组.map((项) =>
          React.createElement(
            'div',
            {
              key: 项.key,
              role: 'button',
              tabIndex: 0,
              className: `wps-nav-item${项.key === activeKey ? ' wps-nav-item--active' : ''}`,
              onClick: () => onSelect && onSelect(项.key),
              onKeyDown: (事件: React.KeyboardEvent) => {
                if (事件.key === 'Enter' && onSelect) {
                  onSelect(项.key)
                }
              },
            },
            React.createElement(Icon, { name: 项.icon, size: 18, className: 'wps-nav-item__icon' }),
            React.createElement('span', { className: 'wps-nav-item__label' }, 项.label)
          )
        )
      )
    )
  )
}

export default Sidebar
