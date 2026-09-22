// 最近文档区块：标题行（视图切换、排序、查看全部）与文档展示容器。
import React from 'react'
import { Dropdown, Tooltip } from 'antd'
import type { DocItem, SortKey } from '../mock/recentDocs'
import type { ViewMode } from '../store'
import DocCard from './DocCard'
import DocRow from './DocRow'
import EmptyState from './EmptyState'
import Icon from './Icon'

interface Props {
  docs: DocItem[]
  title: string
  viewMode?: ViewMode
  sortKey?: SortKey
  activeDocId?: string | null
  onSelect?: (标识: string) => void
  onOpen?: (标识: string) => void
  onToggleStar?: (标识: string) => void
  onViewModeChange?: (模式: ViewMode) => void
  onSortChange?: (键: SortKey) => void
  onViewAll?: () => void
  onEmptyAction?: () => void
}

const 排序文案: Record<SortKey, string> = {
  time: '按修改时间',
  name: '按名称',
  size: '按大小',
}

const RecentDocs = ({
  docs,
  title,
  viewMode = 'grid',
  sortKey = 'time',
  activeDocId = null,
  onSelect,
  onOpen,
  onToggleStar,
  onViewModeChange,
  onSortChange,
  onViewAll,
  onEmptyAction,
}: Props) => {
  const 排序菜单项 = (Object.keys(排序文案) as SortKey[]).map((键) => ({
    key: 键,
    label: 排序文案[键],
  }))

  const 标题行 = React.createElement(
    'div',
    { className: 'wps-section__head' },
    React.createElement('h2', { className: 'wps-section__title' }, title),
    React.createElement(
      'div',
      { className: 'wps-section__actions' },
      React.createElement(
        'div',
        { className: 'wps-segmented' },
        React.createElement(
          Tooltip,
          { title: '网格视图' },
          React.createElement(
            'button',
            {
              type: 'button',
              'aria-label': '网格视图',
              className: `wps-segmented__item${viewMode === 'grid' ? ' wps-segmented__item--active' : ''}`,
              onClick: () => onViewModeChange && onViewModeChange('grid'),
            },
            React.createElement(Icon, { name: 'grid', size: 16 })
          )
        ),
        React.createElement(
          Tooltip,
          { title: '列表视图' },
          React.createElement(
            'button',
            {
              type: 'button',
              'aria-label': '列表视图',
              className: `wps-segmented__item${viewMode === 'list' ? ' wps-segmented__item--active' : ''}`,
              onClick: () => onViewModeChange && onViewModeChange('list'),
            },
            React.createElement(Icon, { name: 'list', size: 16 })
          )
        )
      ),
      React.createElement(
        Dropdown,
        {
          menu: {
            items: 排序菜单项,
            selectedKeys: [sortKey],
            onClick: ({ key }: { key: string }) => onSortChange && onSortChange(key as SortKey),
          },
          trigger: ['click'],
        },
        React.createElement(
          'button',
          { type: 'button', className: 'wps-text-button', 'aria-label': '排序方式' },
          React.createElement(Icon, { name: 'sort', size: 16 }),
          React.createElement('span', null, 排序文案[sortKey])
        )
      ),
      React.createElement(
        'button',
        { type: 'button', className: 'wps-link-button', onClick: onViewAll },
        '查看全部'
      )
    )
  )

  const 内容 =
    docs.length === 0
      ? React.createElement(EmptyState, {
          title: '暂无最近文档',
          description: '新建一个文档，这里会显示最近打开过的文件',
          actionText: '新建文档',
          onAction: onEmptyAction,
        })
      : viewMode === 'grid'
        ? React.createElement(
            'div',
            { className: 'wps-doc-grid' },
            docs.map((文档) =>
              React.createElement(DocCard, {
                key: 文档.id,
                doc: 文档,
                active: 文档.id === activeDocId,
                onSelect,
                onOpen,
                onToggleStar,
              })
            )
          )
        : React.createElement(
            'div',
            { className: 'wps-doc-list' },
            React.createElement(
              'div',
              { className: 'wps-doc-list__head' },
              React.createElement('span', { className: 'wps-doc-row__name' }, '名称'),
              React.createElement('span', { className: 'wps-doc-row__type' }, '类型'),
              React.createElement('span', { className: 'wps-doc-row__time' }, '修改时间'),
              React.createElement('span', { className: 'wps-doc-row__size' }, '大小'),
              React.createElement('span', { className: 'wps-doc-row__star' }, '星标')
            ),
            docs.map((文档) => React.createElement(DocRow, { key: 文档.id, doc: 文档, onOpen }))
          )

  return React.createElement('section', { className: 'wps-section' }, 标题行, 内容)
}

export default RecentDocs
