// 首页最左侧入口，智能助手在全局抽屉中打开。
import React from 'react'
import { Tooltip } from 'antd'
import Icon from './Icon'
import { 桥接 } from '../ipc/bridge'

interface 栏目项 {
  key: string
  label: string
  icon: string
  /** 是否为真实可用的入口 */
  real?: boolean
}

const 栏目列表: 栏目项[] = [
  { key: 'doc', label: '文档', icon: 'doc-word', real: true },
  { key: 'calendar', label: '日历', icon: 'calendar', real: true },
  { key: 'ai', label: '智能助手', icon: 'ai', real: true },
  { key: 'apps', label: '应用', icon: 'apps', real: true },
  { key: 'aippt', label: '演示助手', icon: 'aippt', real: true },
]

interface Props {
  /** 占位项点击时的提示回调 */
  onNotify: (文本: string) => void
  onNavigate: (键: string) => void
  activeKey?: string
}

const HomeRail = ({ onNotify, onNavigate, activeKey = 'home' }: Props) =>
  React.createElement(
    'aside',
    { className: 'wps-homerail' },
    栏目列表.map((项) =>
      React.createElement(
        Tooltip,
        { key: 项.key, title: 项.label, placement: 'right' },
        React.createElement(
          'button',
          {
            type: 'button',
            className: `wps-homerail__item${(项.key === 'doc' ? ['home', 'recent', 'star', 'shared'].includes(activeKey) : 项.key === activeKey) ? ' wps-homerail__item--active' : ''}`,
            onClick: () => {
              if (项.key === 'ai' || 项.key === 'aippt') {
                if (!桥接.ai.可用) {
                  onNotify('请在 Windows 桌面版使用智能助手')
                  return
                }
                window.dispatchEvent(new Event('seal-open-assistant'))
                return
              }
              if (项.real) {
                onNavigate(项.key === 'doc' ? 'home' : 项.key)
                return
              }
              onNotify(`「${项.label}」功能即将开放`)
            },
          },
          React.createElement(Icon, { name: 项.icon, size: 20 }),
          React.createElement('span', { className: 'wps-homerail__label' }, 项.label)
        )
      )
    ),
    React.createElement(
      Tooltip,
      { title: '团队空间', placement: 'right' },
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'wps-homerail__item wps-homerail__item--365',
          onClick: () => onNotify('「团队空间」功能即将开放'),
        },
        React.createElement(Icon, { name: 'wps365', size: 20 }),
        React.createElement('span', { className: 'wps-homerail__label' }, '团队空间')
      )
    )
  )

export default HomeRail
