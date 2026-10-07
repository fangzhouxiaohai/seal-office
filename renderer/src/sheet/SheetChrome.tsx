// 工作表标签栏与表格状态栏。
import React from 'react'
import Icon from '../components/Icon'
import { type 选区统计 } from './selectionStats'
import { 表格缩放范围 } from '../editor/wheelZoom'

export interface 工作表标签项 {
  id: string
  name: string
}

interface TabsProps {
  工作表列表: 工作表标签项[]
  当前标识: string
  on切换: (标识: string) => void
  on新建: () => void
  on删除: (标识: string) => void
}

export const SheetTabs = ({ 工作表列表, 当前标识, on切换, on新建, on删除 }: TabsProps) =>
  React.createElement(
    'div',
    { className: 'wps-sheet-tabs' },
    工作表列表.map((项) =>
      React.createElement(
        'div',
        {
          key: 项.id,
          className: `wps-sheet-tab${项.id === 当前标识 ? ' wps-sheet-tab--active' : ''}`,
          role: 'tab',
          tabIndex: 0,
          onClick: () => on切换(项.id),
          onKeyDown: (事件: React.KeyboardEvent) => {
            if (事件.key === 'Enter') {
              on切换(项.id)
            }
          },
        },
        React.createElement('span', { className: 'wps-sheet-tab__name' }, 项.name),
        工作表列表.length > 1
          ? React.createElement(
              'button',
              {
                type: 'button',
                className: 'wps-sheet-tab__close',
                'aria-label': `删除工作表 ${项.name}`,
                onClick: (事件: React.MouseEvent) => {
                  事件.stopPropagation()
                  on删除(项.id)
                },
              },
              React.createElement(Icon, { name: 'close', size: 12 })
            )
          : null
      )
    ),
    React.createElement(
      'button',
      { type: 'button', className: 'wps-sheet-tabs__create', 'aria-label': '新建工作表', onClick: on新建 },
      React.createElement(Icon, { name: 'plus', size: 14 })
    )
  )

interface StatusProps {
  统计: 选区统计
  缩放: number
  on缩放变化: (值: number) => void
}

export const SheetStatusBar = ({ 统计, 缩放, on缩放变化 }: StatusProps) => {
  const 放大 = () => on缩放变化(Math.min(表格缩放范围.上限, Number((缩放 + 表格缩放范围.步长).toFixed(2))))
  const 缩小 = () => on缩放变化(Math.max(表格缩放范围.下限, Number((缩放 - 表格缩放范围.步长).toFixed(2))))

  return React.createElement(
    'footer',
    { className: 'wps-editor-status' },
    React.createElement(
      'div',
      { className: 'wps-editor-status__left' },
      React.createElement('span', null, `计数：${统计.计数}`),
      React.createElement('span', { className: 'wps-editor-status__dot' }, '·'),
      React.createElement('span', null, `求和：${统计.求和}`),
      React.createElement('span', { className: 'wps-editor-status__dot' }, '·'),
      React.createElement('span', null, `平均值：${Number.isFinite(统计.平均值) ? Number(统计.平均值.toFixed(2)) : 0}`)
    ),
    React.createElement(
      'div',
      { className: 'wps-editor-status__right' },
      React.createElement(
        'button',
        { type: 'button', className: 'wps-editor-status__icon', 'aria-label': '缩小', onClick: 缩小 },
        React.createElement(Icon, { name: 'zoom-out', size: 14 })
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'wps-editor-status__zoom',
          'aria-label': '恢复百分之百',
          onClick: () => on缩放变化(1),
        },
        `${Math.round(缩放 * 100)}%`
      ),
      React.createElement(
        'button',
        { type: 'button', className: 'wps-editor-status__icon', 'aria-label': '放大', onClick: 放大 },
        React.createElement(Icon, { name: 'zoom-in', size: 14 })
      )
    )
  )
}
