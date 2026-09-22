// 文档行：最近文档列表视图的单元。
import React from 'react'
import { formatSize, formatTime, type DocItem } from '../mock/recentDocs'
import { DOC_TYPE_COLOR, DOC_TYPE_ICON, DOC_TYPE_LABEL } from '../docMeta'
import Icon from './Icon'

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
      React.createElement(Icon, {
        name: DOC_TYPE_ICON[doc.type],
        size: 18,
        color: DOC_TYPE_COLOR[doc.type],
        className: 'wps-doc-row__icon',
      }),
      doc.name
    ),
    React.createElement('span', { className: 'wps-doc-row__type' }, DOC_TYPE_LABEL[doc.type]),
    React.createElement('span', { className: 'wps-doc-row__time' }, formatTime(doc.updatedAt)),
    React.createElement('span', { className: 'wps-doc-row__size' }, formatSize(doc.size)),
    React.createElement(
      'span',
      { className: 'wps-doc-row__star' },
      doc.starred ? React.createElement(Icon, { name: 'star-filled', size: 14 }) : null
    )
  )

export default DocRow
