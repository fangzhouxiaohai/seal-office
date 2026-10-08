// 文档卡片：最近文档网格视图的单元，承载缩略图、名称、类型标签与操作入口。
import React, { useState } from 'react'
import { App as AntdApp, Dropdown, Input, Modal, Tooltip } from 'antd'
import { 桥接 } from '../ipc/bridge'
import { formatSize, formatTime, type DocItem } from '../mock/recentDocs'
import { DOC_TYPE_COLOR, DOC_TYPE_ICON, DOC_TYPE_LABEL } from '../docMeta'
import Icon from './Icon'

interface Props {
  doc: DocItem
  active?: boolean
  onSelect?: (标识: string) => void
  onOpen?: (标识: string) => void
  onToggleStar?: (标识: string) => void
  onRename?: (标识: string, 名称: string) => Promise<void> | void
  onRemove?: (标识: string) => void
  /** 批量管理：整卡改为勾选，不触发打开 */
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (标识: string) => void
}

const DocCard = ({
  doc,
  active = false,
  onSelect,
  onOpen,
  onToggleStar,
  onRename,
  onRemove,
  selectable = false,
  selected = false,
  onToggleSelect,
}: Props) => {
  const { modal } = AntdApp.useApp()
  const [重命名中, set重命名中] = useState(false)
  const [草稿名称, set草稿名称] = useState(doc.name)

  const 阻止冒泡 = (事件: React.MouseEvent) => {
    事件.stopPropagation()
  }

  const 处理星标 = (事件: React.MouseEvent) => {
    阻止冒泡(事件)
    if (onToggleStar !== undefined) {
      onToggleStar(doc.id)
    }
  }

  const 打开重命名 = () => {
    set草稿名称(doc.name)
    set重命名中(true)
  }

  const 确认重命名 = async () => {
    const 规范名称 = 草稿名称.trim()
    if (规范名称.length === 0) {
      modal.warning({ title: '文档名称无效', content: '请输入文件名称后再保存。', okText: '确定' })
      return
    }
    try {
      await onRename?.(doc.id, 规范名称)
      set重命名中(false)
    } catch (错误) {
      modal.error({ title: '重命名失败', content: 错误 instanceof Error ? 错误.message : '无法重命名文件' })
    }
  }

  const 确认删除 = () => {
    modal.confirm({
      title: '从最近列表移除',
      content: `确定从最近列表移除「${doc.name}」吗？磁盘中的文件不会删除。`,
      okText: '移除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => {
        if (onRemove !== undefined) {
          onRemove(doc.id)
        }
      },
    })
  }

  const 打开所在文件夹 = async () => {
    try {
      const 结果 = await 桥接.revealInFolder(doc.路径 ?? '')
      if (!结果.成功) throw new Error(结果.错误 || '无法定位文件')
    } catch (错误) {
      modal.error({ title: '打开所在文件夹失败', content: 错误 instanceof Error ? 错误.message : '无法定位文件', okText: '确定' })
    }
  }

  const 菜单项 = [
    { key: 'open', label: '打开' },
    // 真实文件才提供「打开所在文件夹」；演示数据无路径时隐藏
    ...(doc.路径 !== undefined ? [{ key: 'reveal', label: '打开所在文件夹' }] : []),
    { key: 'rename', label: '重命名' },
    { key: 'star', label: doc.starred ? '取消星标' : '添加星标' },
    { type: 'divider' as const },
    { key: 'remove', label: '从最近列表移除' },
  ]

  const 处理菜单点击 = ({ key }: { key: string }) => {
    switch (key) {
      case 'open':
        if (onOpen !== undefined) {
          onOpen(doc.id)
        }
        break
      case 'reveal':
        void 打开所在文件夹()
        break
      case 'rename':
        打开重命名()
        break
      case 'star':
        if (onToggleStar !== undefined) {
          onToggleStar(doc.id)
        }
        break
      case 'remove':
        确认删除()
        break
      default:
        break
    }
  }

  const 切换选择 = () => onToggleSelect?.(doc.id)

  return React.createElement(
    React.Fragment,
    null,
    React.createElement(
      'div',
      {
        className: `wps-doc-card${active ? ' wps-doc-card--active' : ''}${selectable && selected ? ' wps-doc-card--selected' : ''}${selectable ? ' wps-doc-card--selectable' : ''}`,
        role: 'group',
        tabIndex: 0,
        'aria-label': selectable ? `${selected ? '取消选择' : '选择'} ${doc.name}` : `文档 ${doc.name}，按回车打开`,
        'aria-pressed': selectable ? selected : undefined,
        onClick: () => (selectable ? 切换选择() : onSelect && onSelect(doc.id)),
        onDoubleClick: () => (selectable ? 切换选择() : onOpen && onOpen(doc.id)),
        onKeyDown: (事件: React.KeyboardEvent<HTMLDivElement>) => {
          if (事件.target !== 事件.currentTarget) return
          if (事件.key === 'Enter') { 事件.preventDefault(); if (selectable) 切换选择(); else onOpen?.(doc.id) }
          if (事件.key === ' ') { 事件.preventDefault(); if (selectable) 切换选择(); else onSelect?.(doc.id) }
        },
      },
      React.createElement(
        'div',
        { className: 'wps-doc-card__thumb' },
        selectable
          ? React.createElement('input', {
              type: 'checkbox',
              className: 'wps-check wps-doc-card__check',
              'aria-label': `${selected ? '取消选择' : '选择'} ${doc.name}`,
              checked: selected,
              onClick: 阻止冒泡,
              onChange: 切换选择,
            })
          : null,
        React.createElement(Icon, {
          name: DOC_TYPE_ICON[doc.type],
          size: 40,
          color: DOC_TYPE_COLOR[doc.type],
        }),
        React.createElement(
          'span',
          { className: 'wps-doc-card__badge', style: { background: DOC_TYPE_COLOR[doc.type] } },
          DOC_TYPE_LABEL[doc.type]
        ),
        React.createElement(
          'div',
          { className: 'wps-doc-card__actions' },
          React.createElement(
            Dropdown,
            {
              menu: { items: 菜单项, onClick: 处理菜单点击 },
              trigger: ['click'],
            },
            React.createElement(
              'button',
              {
                type: 'button',
                className: 'wps-doc-card__more',
                'aria-label': '更多操作',
                onClick: 阻止冒泡,
              },
              React.createElement(Icon, { name: 'more', size: 16 })
            )
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
    ),
    React.createElement(
      Modal,
      {
        open: 重命名中,
        title: '重命名文档',
        okText: '确定',
        cancelText: '取消',
        onOk: 确认重命名,
        onCancel: () => set重命名中(false),
      },
      React.createElement(Input, {
        value: 草稿名称,
        placeholder: '请输入新的文档名称',
        maxLength: 120,
        onChange: (事件: React.ChangeEvent<HTMLInputElement>) => set草稿名称(事件.target.value),
      })
    )
  )
}

export default DocCard
