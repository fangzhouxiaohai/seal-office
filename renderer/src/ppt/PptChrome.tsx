// 幻灯片缩略图列表与演示状态栏。
import React from 'react'
import Icon from '../components/Icon'
import { SlidePreview, 预览页属性 } from './PptViews'
import type { 图片地址表 } from './render/SlideObjects'
import { 读取当前幻灯片, type 演示文稿 } from './deck'
import { 放大一档, 缩小一档, 缩放百分比文本 } from '../editor/wheelZoom'

interface ListProps {
  图片地址?: 图片地址表
  文稿: 演示文稿
  on选中: (索引: number) => void
  on新建: () => void
}

export const ThumbnailList = ({ 文稿, on选中, on新建, 图片地址 }: ListProps) =>
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
        React.createElement('span', { className: 'wps-ppt-thumb__index' }, `${索引 + 1}${幻灯片.隐藏 ? ' 已隐藏' : ''}`),
        React.createElement(
          'div',
          { className: 'wps-ppt-thumb__canvas', style: { background: 幻灯片.背景色 } },
          React.createElement(SlidePreview, { 幻灯片, 图片地址, ...预览页属性(文稿, 幻灯片, 索引) })
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
  const 放大 = () => { const 下一个 = 放大一档(缩放); if (下一个 !== null) on缩放变化(下一个) }
  const 缩小 = () => { const 下一个 = 缩小一档(缩放); if (下一个 !== null) on缩放变化(下一个) }
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
        `${缩放百分比文本(缩放)}`
      ),
      React.createElement(
        'button',
        { type: 'button', className: 'wps-editor-status__icon', 'aria-label': '放大', onClick: 放大 },
        React.createElement(Icon, { name: 'zoom-in', size: 14 })
      )
    )
  )
}
