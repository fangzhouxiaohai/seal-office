// 文档行：最近文档列表视图的单元。
import React from 'react'
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

interface Props {
  doc: DocItem
  onOpen?: (标识: string) => void
}

const DocRow = ({ doc, onOpen }: Props) =>
  React.createElement(
    'div',
    {
      className: 'wps-doc-row',
      onClick: () => onOpen && onOpen(doc.id),
    },
    React.createElement(
      'span',
      { className: 'wps-doc-row__name' },
      React.createElement(Icon, { name: 类型图标[doc.type], size: 18, className: 'wps-doc-row__icon' }),
      doc.name
    ),
    React.createElement('span', { className: 'wps-doc-row__type' }, 类型文案[doc.type]),
    React.createElement('span', { className: 'wps-doc-row__time' }, formatTime(doc.updatedAt)),
    React.createElement('span', { className: 'wps-doc-row__size' }, formatSize(doc.size)),
    React.createElement(
      'span',
      { className: 'wps-doc-row__star' },
      doc.starred ? React.createElement(Icon, { name: 'star-filled', size: 14 }) : null
    )
  )

export default DocRow
