// 文档标签栏：已打开文档的切换、关闭与新建入口。
import React from 'react'
import Icon from '../components/Icon'

interface 文档标签项 {
  id: string
  name: string
}

interface Props {
  documents: 文档标签项[]
  activeId: string | null
  onSelect: (标识: string) => void
  onClose: (标识: string) => void
  onCreate: () => void
}

const DocumentTabs = ({ documents, activeId, onSelect, onClose, onCreate }: Props) =>
  React.createElement(
    'div',
    { className: 'wps-doc-tabs' },
    documents.map((文档) =>
      React.createElement(
        'div',
        {
          key: 文档.id,
          className: `wps-doc-tab${文档.id === activeId ? ' wps-doc-tab--active' : ''}`,
          role: 'tab',
          tabIndex: 0,
          onClick: () => onSelect(文档.id),
          onKeyDown: (事件: React.KeyboardEvent) => {
            if (事件.key === 'Enter') {
              onSelect(文档.id)
            }
          },
        },
        React.createElement('span', { className: 'wps-doc-tab__name' }, 文档.name),
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'wps-doc-tab__close',
            'aria-label': `关闭 ${文档.name}`,
            onClick: (事件: React.MouseEvent) => {
              事件.stopPropagation()
              onClose(文档.id)
            },
          },
          React.createElement(Icon, { name: 'close', size: 12, className: 'wps-doc-tab__close-icon' })
        )
      )
    ),
    React.createElement(
      'button',
      { type: 'button', className: 'wps-doc-tabs__create', 'aria-label': '新建文档', onClick: onCreate },
      React.createElement(Icon, { name: 'plus', size: 14 })
    )
  )

export default DocumentTabs
