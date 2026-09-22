// 新建四宫格：首页主要的创建入口，数据来源于路由注册表。
import React from 'react'
import { NEW_DOC_ENTRIES } from '../routes'
import type { DocType } from '../mock/recentDocs'
import Icon from './Icon'

interface Props {
  onSelect: (类型: DocType) => void
}

const NewDocGrid = ({ onSelect }: Props) =>
  React.createElement(
    'div',
    { className: 'wps-new-grid' },
    NEW_DOC_ENTRIES.map((项) =>
      React.createElement(
        'button',
        {
          key: 项.key,
          type: 'button',
          className: `wps-new-card${项.implemented ? '' : ' wps-new-card--disabled'}`,
          onClick: () => onSelect(项.key),
        },
        React.createElement(
          'span',
          { className: 'wps-new-card__icon', style: { color: 项.color } },
          React.createElement(Icon, { name: 项.icon, size: 36, color: 项.color })
        ),
        React.createElement('span', { className: 'wps-new-card__label' }, 项.label)
      )
    )
  )

export default NewDocGrid
