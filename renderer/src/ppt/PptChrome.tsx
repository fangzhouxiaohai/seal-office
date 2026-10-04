// 幻灯片缩略图列表与演示状态栏。
import React from 'react'
import Icon from '../components/Icon'
import { 读取当前幻灯片, type 演示文稿 } from './deck'

interface ListProps {
  文稿: 演示文稿
  on选中: (索引: number) => void
  on新建: () => void
}

export const ThumbnailList = ({ 文稿, on选中, on新建 }: ListProps) =>
  React.createElement(
    'div',
    { className: 'wps-ppt-thumbs' },
    文稿.幻灯片列表.map((幻灯片, 索引) =>
      React.createElement(
        'div',
        {
          key: 幻灯片.id,
          className: `wps-ppt-thumb${索引 === 文稿.当前索引 ? ' wps-ppt-thumb--active' : ''}`,
          'data-索引': 索引,
          role: 'button',
          tabIndex: 0,
          onClick: () => on选中(索引),
          onKeyDown: (事件: React.KeyboardEvent) => {
            if (事件.key === 'Enter') {
              on选中(索引)
            }
          },
        },
        React.createElement('span', { className: 'wps-ppt-thumb__index' }, 索引 + 1),
        React.createElement(
          'div',
          { className: 'wps-ppt-thumb__canvas', style: { background: 幻灯片.背景色 } },
          幻灯片.文本框列表.slice(0, 2).map((框) =>
            React.createElement(
              'span',
              {
                key: 框.id,
                className: 'wps-ppt-thumb__text',
                style: { fontWeight: 框.加粗 ? 600 : 400 },
              },
              框.text.slice(0, 12)
            )
          )
        )
      )
    ),
    React.createElement(
      'button',
      { type: 'button', className: 'wps-ppt-thumbs__create', 'aria-label': '新建幻灯片', onClick: on新建 },
      React.createElement(Icon, { name: 'plus', size: 14 })
    )
  )

interface StatusProps {
  文稿: 演示文稿
  缩放: number
  on缩放变化: (值: number) => void
}

export const PptStatusBar = ({ 文稿, 缩放, on缩放变化 }: StatusProps) => {
  const 当前 = 读取当前幻灯片(文稿)
  const 放大 = () => on缩放变化(Math.min(2, Number((缩放 + 0.1).toFixed(2))))
  const 缩小 = () => on缩放变化(Math.max(0.5, Number((缩放 - 0.1).toFixed(2))))
  const 框数 = 当前 === null ? 0 : 当前.文本框列表.length

  return React.createElement(
    'footer',
    { className: 'wps-editor-status' },
    React.createElement(
      'div',
      { className: 'wps-editor-status__left' },
      React.createElement('span', null, `第 ${当前 === null ? 0 : 文稿.当前索引 + 1} 张`),
      React.createElement('span', { className: 'wps-editor-status__dot' }, '/'),
      React.createElement('span', null, `共 ${文稿.幻灯片列表.length} 张`),
      React.createElement('span', { className: 'wps-editor-status__dot' }, '·'),
      React.createElement('span', null, `文本框：${框数}`)
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
