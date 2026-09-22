// 表格网格选择器：以悬停选择行列数的方式插入表格，替代纯文本式的行列输入。
import React, { useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  onPick: (行数: number, 列数: number) => void
  maxRows?: number
  maxCols?: number
}

const TableGridPicker = ({ open, onClose, onPick, maxRows = 8, maxCols = 8 }: Props) => {
  const [选中行, set选中行] = useState(0)
  const [选中列, set选中列] = useState(0)

  if (!open) {
    return null
  }

  const 提示 =
    选中行 > 0 && 选中列 > 0 ? `${选中列} 列 × ${选中行} 行` : '请选择表格行列数'

  const 单元格列表: React.ReactNode[] = []
  for (let 行 = 1; 行 <= maxRows; 行 += 1) {
    for (let 列 = 1; 列 <= maxCols; 列 += 1) {
      const 已选中 = 行 <= 选中行 && 列 <= 选中列
      单元格列表.push(
        React.createElement('button', {
          key: `${行}-${列}`,
          type: 'button',
          className: `wps-grid-picker__cell${已选中 ? ' wps-grid-picker__cell--active' : ''}`,
          'aria-label': `第 ${行} 行第 ${列} 列`,
          onMouseEnter: () => {
            set选中行(行)
            set选中列(列)
          },
          onFocus: () => {
            set选中行(行)
            set选中列(列)
          },
          onClick: () => onPick(行, 列),
        })
      )
    }
  }

  return React.createElement(
    'div',
    { className: 'wps-grid-picker' },
    React.createElement(
      'div',
      {
        className: 'wps-grid-picker__grid',
        style: { gridTemplateColumns: `repeat(${maxCols}, 22px)` },
        onMouseLeave: () => {
          set选中行(0)
          set选中列(0)
        },
      },
      单元格列表
    ),
    React.createElement('div', { className: 'wps-grid-picker__tip' }, 提示),
    React.createElement(
      'div',
      { className: 'wps-grid-picker__actions' },
      React.createElement(
        'button',
        { type: 'button', className: 'wps-grid-picker__button', onClick: onClose },
        '取消'
      )
    )
  )
}

export default TableGridPicker
