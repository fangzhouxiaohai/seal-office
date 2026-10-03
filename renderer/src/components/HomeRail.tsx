// 首页最左侧图标栏：文档与规划中的日历、智能工具、应用、演示助手、团队空间。
// 除「文档」为当前首页外，其余入口点击后说明当前可用状态。
import React from 'react'
import { Tooltip } from 'antd'
import Icon from './Icon'

interface 栏目项 {
  key: string
  label: string
  icon: string
  /** 是否为真实可用的入口 */
  real?: boolean
}

const 栏目列表: 栏目项[] = [
  { key: 'doc', label: '文档', icon: 'doc-word', real: true },
  { key: 'calendar', label: '日历', icon: 'calendar' },
  { key: 'ai', label: '智能工具', icon: 'ai' },
  { key: 'apps', label: '应用', icon: 'apps' },
  { key: 'aippt', label: '演示助手', icon: 'aippt' },
]

interface Props {
  /** 占位项点击时的提示回调 */
  onNotify: (文本: string) => void
}

const HomeRail = ({ onNotify }: Props) =>
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
            className: `wps-homerail__item${项.real ? ' wps-homerail__item--active' : ''}`,
            onClick: () => {
              if (项.real) return
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
