// 文档卡片：最近文档网格视图的单元，承载缩略图、名称、类型标签与星标操作。
import React from 'react'
import { Tooltip } from 'antd'
import { formatSize, formatTime, type DocItem, type DocType } from '../mock/recentDocs'
import Icon from './Icon'

const 类型文案: Record<DocType, string> = {
  word: '文字',
  table: '表格',
  ppt: '演示',
  pdf: 'PDF',
}

const 类型图标: Record<DocType, string> = {
  word: 'doc-word',
  table: 'doc-table',
  ppt: 'doc-ppt',
  pdf: 'doc-pdf',
}

const 类型颜色: Record<DocType, string> = {
  word: '#2B6CF6',
  table: '#00A870',
  ppt: '#ED7B2F',
  pdf: '#E34D59',
}

interface Props {
  doc: DocItem
  active?: boolean
  onSelect?: (标识: string) => void
  onOpen?: (标识: string) => void
  onToggleStar?: (标识: string) => void
}

const DocCard = ({ doc, active = false, onSelect, onOpen, onToggleStar }: Props) => {
  const 处理星标 = (事件: React.MouseEvent) => {
    事件.stopPropagation()
    if (onToggleStar !== undefined) {
      onToggleStar(doc.id)
    }
  }

  return React.createElement(
    'div',
    {
      className: `wps-doc-card${active ? ' wps-doc-card--active' : ''}`,
      onClick: () => onSelect && onSelect(doc.id),
      onDoubleClick: () => onOpen && onOpen(doc.id),
    },
    React.createElement(
      'div',
      { className: 'wps-doc-card__thumb' },
      React.createElement(Icon, {
        name: 类型图标[doc.type],
        size: 40,
        color: 类型颜色[doc.type],
      }),
      React.createElement(
        'span',
        { className: 'wps-doc-card__badge', style: { background: 类型颜色[doc.type] } },
        类型文案[doc.type]
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          className: `wps-doc-card__star${doc.starred ? ' wps-doc-card__star--on' : ''}`,
          'aria-label': doc.starred ? '取消星标' : '添加星标',
          onClick: 处理星标,
        },
        React.createElement(Icon, { name: doc.starred ? 'star-filled' : 'star', size: 16 })
      )
    ),
    React.createElement(
      'div',
      { className: 'wps-doc-card__info' },
      React.createElement(
        Tooltip,
        { title: doc.name },
        React.createElement('span', { className: 'wps-doc-card__name' }, doc.name)
      ),
      React.createElement(
        'span',
        { className: 'wps-doc-card__meta' },
        `${formatTime(doc.updatedAt)} · ${formatSize(doc.size)}`
      )
    )
  )
}

export default DocCard
