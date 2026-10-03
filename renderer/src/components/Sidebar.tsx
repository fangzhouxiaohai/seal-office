// 左侧导航：首页、设置、帮助视图均渲染完整分组导航，编辑器视图渲染返回入口与模块名。
import React from 'react'
import { NAV_GROUPS } from '../navConfig'
import Icon from './Icon'
import { 提取大纲, type 目录项 } from '../editor/toc'

interface Props {
  mode?: 'home' | 'editor' | 'settings' | 'help' | 'pdf'
  activeKey?: string
  onSelect?: (键: string) => void
  moduleLabel?: string
  onBack?: () => void
  onShowSettings?: () => void
  onShowHelp?: () => void
  onShowPdf?: () => void
  outline?: 大纲导航属性
}

interface 大纲导航属性 { html?: string; onJump?: (索引: number) => void }

const Sidebar = ({
  mode = 'home',
  activeKey,
  onSelect,
  moduleLabel,
  onBack,
  onShowSettings,
  onShowHelp,
  onShowPdf,
  outline,
}: Props) => {
  // 编辑器模式：显示返回首页按钮、当前模块名与文档大纲
  if (mode === 'editor') {
    const 标题 = moduleLabel ?? '文档'
    const 图标 = 'doc-empty'

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
          React.createElement(Icon, { name: 图标, size: 18, className: 'wps-nav-item__icon' }),
          React.createElement('span', { className: 'wps-nav-item__label' }, 标题)
        )
      ),
      outline !== undefined
        ? React.createElement(
            'div',
            { className: 'wps-sidebar__outline' },
            React.createElement('div', { className: 'wps-sidebar__outline-title' }, '文档结构'),
            提取大纲(outline.html ?? '').map((项: 目录项, 索引: number) => React.createElement(
              'button',
              { key: `${项.级别}-${索引}`, type: 'button', className: 'wps-sidebar__outline-item', style: { paddingLeft: `${8 + (项.级别 - 1) * 12}px` }, onClick: () => outline.onJump?.(索引) },
              项.文本
            ))
          )
        : null
    )
  }

  // home、settings、help、pdf 模式：显示完整分组导航菜单
  const 当前激活键 = mode === 'settings' ? 'settings' : mode === 'help' ? 'help' : mode === 'pdf' ? 'pdf' : (activeKey ?? 'home')
  const 处理导航 = (键: string) => {
    if (键 === 'settings' && onShowSettings) onShowSettings()
    else if (键 === 'help' && onShowHelp) onShowHelp()
    else if (键 === 'pdf' && onShowPdf) onShowPdf()
    else onSelect?.(键)
  }

  return React.createElement(
    'nav',
    { className: 'wps-sidebar' },
    React.createElement(
      'button',
      { type: 'button', className: 'wps-sidebar__back', onClick: onBack },
      React.createElement(Icon, { name: 'arrow-left', size: 16 }),
      React.createElement('span', null, '返回首页')
    ),
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
              className: `wps-nav-item${项.key === 当前激活键 ? ' wps-nav-item--active' : ''}`,
              onClick: () => 处理导航(项.key),
              onKeyDown: (事件: React.KeyboardEvent) => {
                if (事件.key === 'Enter' || 事件.key === ' ') {
                  事件.preventDefault()
                  处理导航(项.key)
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
