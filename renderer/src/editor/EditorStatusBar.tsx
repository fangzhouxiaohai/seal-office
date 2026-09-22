// 编辑器状态栏：页码、字数、缩放控制与视图模式。
import React from 'react'
import Icon from '../components/Icon'

interface Props {
  页码: number
  总页数: number
  字数: number
  缩放: number
  视图模式?: string
  on缩放变化: (值: number) => void
  on视图模式变化?: (模式: string) => void
}

const 缩放下限 = 0.5
const 缩放上限 = 2

const EditorStatusBar = ({ 页码, 总页数, 字数, 缩放, 视图模式, on缩放变化 }: Props) => {
  const 放大 = () => on缩放变化(Math.min(缩放上限, Number((缩放 + 0.1).toFixed(2))))
  const 缩小 = () => on缩放变化(Math.max(缩放下限, Number((缩放 - 0.1).toFixed(2))))

  return React.createElement(
    'footer',
    { className: 'wps-editor-status' },
    React.createElement(
      'div',
      { className: 'wps-editor-status__left' },
      React.createElement('span', null, `第 ${页码} 页`),
      React.createElement('span', { className: 'wps-editor-status__dot' }, '/'),
      React.createElement('span', null, `共 ${总页数} 页`),
      React.createElement('span', { className: 'wps-editor-status__dot' }, '·'),
      React.createElement('span', null, `字数：${字数}`)
    ),
    React.createElement(
      'div',
      { className: 'wps-editor-status__right' },
      视图模式 !== undefined ? React.createElement('span', null, 视图模式) : null,
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

export default EditorStatusBar
