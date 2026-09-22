// 通用空状态：列表无数据时展示，避免出现无解释的空白区域。
import React from 'react'
import { Button } from 'antd'
import Icon from './Icon'

interface Props {
  title: string
  description?: string
  actionText?: string
  onAction?: () => void
}

const EmptyState = ({ title, description, actionText, onAction }: Props) =>
  React.createElement(
    'div',
    { className: 'wps-empty' },
    React.createElement(Icon, { name: 'doc-empty', size: 48, className: 'wps-empty__icon' }),
    React.createElement('p', { className: 'wps-empty__title' }, title),
    description !== undefined
      ? React.createElement('p', { className: 'wps-empty__desc' }, description)
      : null,
    actionText !== undefined && onAction !== undefined
      ? React.createElement(
          Button,
          { type: 'primary', onClick: onAction, className: 'wps-empty__action' },
          actionText
        )
      : null
  )

export default EmptyState
