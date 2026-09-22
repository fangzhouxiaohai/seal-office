// 表格网格视图：列标、行号与单元格。
// 单元格为受控组件，编辑状态由上层维护。
import React from 'react'
import { 列转字母, 生成地址, type 单元格位置 } from './address'
import { 读取单元格, 默认列宽, 默认行高, type Sheet } from './model'

export interface 选区范围 {
  起点: 单元格位置
  终点: 单元格位置
}

interface Props {
  工作表: Sheet
  选区: 选区范围
  编辑地址: string | null
  编辑值: string
  on选中: (位置: 单元格位置, 扩展选区: boolean) => void
  on双击: (地址: string) => void
  on编辑值变化: (值: string) => void
  on提交编辑: () => void
  on取消编辑: () => void
  on选中整列: (列: number) => void
  on选中整行: (行: number) => void
  on全选: () => void
}

/** 判断位置是否落在选区内 */
function 在选区内(位置: 单元格位置, 选区: 选区范围): boolean {
  return (
    位置.行 >= 选区.起点.行 &&
    位置.行 <= 选区.终点.行 &&
    位置.列 >= 选区.起点.列 &&
    位置.列 <= 选区.终点.列
  )
}

const GridView = ({
  工作表,
  选区,
  编辑地址,
  编辑值,
  on选中,
  on双击,
  on编辑值变化,
  on提交编辑,
  on取消编辑,
   on选中整列,
  on选中整行,
  on全选,
}: Props) => {
  const 列标 = Array.from({ length: 工作表.列数 }, (_, 列) => 列转字母(列))
  const 行号 = Array.from({ length: 工作表.行数 }, (_, 行) => 行 + 1)

  // 第一行为角落与列标，其余每行为行号加该行单元格
  const 网格子元素: React.ReactNode[] = [
    React.createElement('div', {
      key: 'corner',
      className: 'wps-sheet__corner',
      onClick: on全选,
      title: '全选',
    }),
    ...列标.map((字母, 列) =>
      React.createElement(
        'div',
        {
          key: `col-${字母}`,
          className: 'wps-sheet__col',
          onClick: () => on选中整列(列),
        },
        字母
      )
    ),
  ]

  行号.forEach((号, 行) => {
    网格子元素.push(
      React.createElement(
        'div',
        { key: `row-${号}`, className: 'wps-sheet__rownum', onClick: () => on选中整行(行) },
        号
      )
    )
    for (let 列 = 0; 列 < 工作表.列数; 列 += 1) {
      const 位置: 单元格位置 = { 行, 列 }
      const 地址 = 生成地址(行, 列)
      const 单元 = 读取单元格(工作表, 地址)
      const 选中 = 在选区内(位置, 选区)
      const 编辑中 = 编辑地址 === 地址
      const 类名 = [
        'wps-sheet__cell',
        选中 ? 'wps-sheet__cell--selected' : '',
        编辑中 ? 'wps-sheet__cell--editing' : '',
      ]
        .filter((项) => 项.length > 0)
        .join(' ')

      网格子元素.push(
        React.createElement(
          'div',
          {
            key: 地址,
            className: 类名,
            'data-地址': 地址,
            style: {
              width: `${工作表.列宽[列] ?? 默认列宽}px`,
              height: `${工作表.行高[行] ?? 默认行高}px`,
              textAlign: 单元.格式.水平对齐 ?? 'left',
              fontWeight: 单元.格式.加粗 === true ? 600 : 400,
              fontStyle: 单元.格式.斜体 === true ? 'italic' : 'normal',
              textDecoration: 单元.格式.下划线 === true ? 'underline' : 'none',
              color: 单元.格式.字体颜色,
              background: 单元.格式.填充颜色,
            },
            onClick: (事件: React.MouseEvent) => on选中(位置, 事件.shiftKey),
            onDoubleClick: () => on双击(地址),
          },
          编辑中
            ? React.createElement('input', {
                className: 'wps-sheet__editor',
                value: 编辑值,
                autoFocus: true,
                onChange: (事件: React.ChangeEvent<HTMLInputElement>) =>
                  on编辑值变化(事件.target.value),
                onKeyDown: (事件: React.KeyboardEvent) => {
                  if (事件.key === 'Enter') {
                    on提交编辑()
                  }
                  if (事件.key === 'Escape') {
                    on取消编辑()
                  }
                },
                onBlur: on提交编辑,
              })
            : 单元.显示值
        )
      )
    }
  })

  return React.createElement(
    'div',
    {
      className: 'wps-sheet',
      style: { gridTemplateColumns: `46px repeat(${工作表.列数}, ${默认列宽}px)` },
    },
    网格子元素
  )
}

export default GridView
