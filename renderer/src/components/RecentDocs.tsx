// 最近文档区块：标题行（视图切换、排序、批量管理、查看全部）与文档展示容器。
import React, { useEffect, useState } from 'react'
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
  onRename?: (标识: string, 名称: string) => Promise<void> | void
  onRemove?: (标识: string) => void
  /** 批量移除选中的记录；返回 true 表示已全部处理，可退出批量管理 */
  onRemoveMany?: (标识列表: string[]) => Promise<boolean> | boolean | void
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

/** 列表视图列标题，顺序与 .wps-doc-list 的栅格模板一致 */
const 列表列标题 = ['名称', '类型', '修改时间', '大小', '操作']

const RecentDocs = ({
  docs,
  title,
  viewMode = 'grid',
  sortKey = 'time',
  activeDocId = null,
  onSelect,
  onOpen,
  onToggleStar,
  onRename,
  onRemove,
  onRemoveMany,
  onViewModeChange,
  onSortChange,
  onViewAll,
  onEmptyAction,
}: Props) => {
  const [批量管理, set批量管理] = useState(false)
  const [已选, set已选] = useState<string[]>([])
  const [移除中, set移除中] = useState(false)

  // 列表变化（筛选、移除、刷新）后只保留仍在显示的选中项；列表清空时退出批量管理
  useEffect(() => {
    const 可见 = new Set(docs.map((文档) => 文档.id))
    set已选((当前) => {
      const 保留 = 当前.filter((标识) => 可见.has(标识))
      return 保留.length === 当前.length ? 当前 : 保留
    })
    if (docs.length === 0) set批量管理(false)
  }, [docs])

  const 可批量 = onRemoveMany !== undefined && docs.length > 0
  const 全部选中 = docs.length > 0 && 已选.length === docs.length
  const 部分选中 = 已选.length > 0 && !全部选中

  const 切换选中 = (标识: string) => {
    set已选((当前) => 当前.includes(标识) ? 当前.filter((项) => 项 !== 标识) : [...当前, 标识])
  }
  const 切换全选 = () => set已选(全部选中 ? [] : docs.map((文档) => 文档.id))
  const 退出批量 = () => { set批量管理(false); set已选([]) }
  const 移除所选 = async () => {
    if (已选.length === 0 || 移除中 || onRemoveMany === undefined) return
    set移除中(true)
    try {
      const 完成 = await onRemoveMany([...已选])
      if (完成 === true) 退出批量()
    } finally {
      set移除中(false)
    }
  }

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
      可批量 && !批量管理
        ? React.createElement(
            'button',
            { type: 'button', className: 'wps-text-button', 'aria-label': '批量管理', onClick: () => set批量管理(true) },
            React.createElement(Icon, { name: 'sliders', size: 16 }),
            React.createElement('span', null, '批量管理')
          )
        : null,
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

  const 批量工具条 = 批量管理 && docs.length > 0
    ? React.createElement(
        'div',
        { className: 'wps-batch-bar', role: 'toolbar', 'aria-label': '批量管理最近文档' },
        React.createElement(
          'label',
          { className: 'wps-batch-bar__all' },
          React.createElement('input', {
            type: 'checkbox',
            className: 'wps-check',
            'aria-label': '全选',
            checked: 全部选中,
            ref: (元素: HTMLInputElement | null) => { if (元素) 元素.indeterminate = 部分选中 },
            onChange: 切换全选,
          }),
          React.createElement('span', null, '全选')
        ),
        React.createElement('span', { className: 'wps-batch-bar__count', 'aria-live': 'polite' }, `已选 ${已选.length} 项`),
        React.createElement('span', { className: 'wps-batch-bar__hint' }, '仅移除最近记录，不删除磁盘文件'),
        React.createElement(
          'div',
          { className: 'wps-batch-bar__actions' },
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'wps-batch-bar__danger',
              disabled: 已选.length === 0 || 移除中,
              onClick: () => void 移除所选(),
            },
            移除中 ? '正在移除…' : `移除所选（${已选.length}）`
          ),
          React.createElement('button', { type: 'button', className: 'wps-batch-bar__done', onClick: 退出批量 }, '完成')
        )
      )
    : null

  const 选择属性 = (文档: DocItem) => 批量管理
    ? { selectable: true, selected: 已选.includes(文档.id), onToggleSelect: 切换选中 }
    : {}

  const 内容 =
    docs.length === 0
      ? React.createElement(EmptyState, {
          title: '暂无最近文档',
          description: '打开本地文件或把文件拖进窗口后，最近使用的文档会显示在这里',
          actionText: '打开文件',
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
                active: !批量管理 && 文档.id === activeDocId,
                onSelect,
                onOpen,
                onToggleStar,
                onRename,
                onRemove,
                ...选择属性(文档),
              })
            )
          )
        : React.createElement(
            'div',
            { className: 'wps-doc-list' },
            React.createElement(
              'div',
              { className: 'wps-doc-list__head' },
              列表列标题.map((列名) =>
                React.createElement('span', { key: 列名, className: 'wps-doc-list__col' }, 列名)
              )
            ),
            docs.map((文档) => React.createElement(DocRow, {
              key: 文档.id,
              doc: 文档,
              onOpen,
              onToggleStar,
              onRename,
              onRemove,
              ...选择属性(文档),
            }))
          )

  return React.createElement('section', { className: 'wps-section' }, 标题行, 批量工具条, 内容)
}

export default RecentDocs
