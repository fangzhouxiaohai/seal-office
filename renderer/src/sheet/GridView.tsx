// 表格网格视图：列标、行号与单元格。
// 单元格为受控组件，编辑状态由上层维护。
import React from 'react'
import { 列转字母, 生成地址, type 单元格位置 } from './address'
import { 读取单元格, 查询合并, 默认列宽, 默认行高, type Sheet } from './model'

export interface 选区范围 {
  起点: 单元格位置
  终点: 单元格位置
}

interface Props {
  工作表: Sheet
  选区: 选区范围
  编辑地址: string | null
  编辑值: string
  /** 缩放比例，使用 zoom 实现，避免 transform 影响滚动与命中区域 */
  scale?: number
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
  scale = 1,
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

  // 第一行为角落与列标，其余每行为行号加该行单元格；全部显式定位以支持合并单元格
  const 网格子元素: React.ReactNode[] = [
    React.createElement('div', {
      key: 'corner',
      className: 'wps-sheet__corner',
      style: { gridColumn: 1, gridRow: 1 },
      onClick: on全选,
      title: '全选',
    }),
    ...列标.map((字母, 列) =>
      React.createElement(
        'div',
        {
          key: `col-${字母}`,
          className: 'wps-sheet__col',
          style: { gridColumn: 列 + 2, gridRow: 1 },
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
        {
          key: `row-${号}`,
          className: 'wps-sheet__rownum',
          style: { gridColumn: 1, gridRow: 行 + 2 },
          onClick: () => on选中整行(行),
        },
        号
      )
    )
    for (let 列 = 0; 列 < 工作表.列数; 列 += 1) {
      const 位置: 单元格位置 = { 行, 列 }
      const 地址 = 生成地址(行, 列)
      const 合并 = 查询合并(工作表, 位置)
      // 被合并区域覆盖的非左上角单元格不渲染，由左上角单元格跨格占据
      if (合并 !== null && !合并.是左上角) {
        continue
      }
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
              gridColumn: 合并 !== null && 合并.是左上角 ? `${列 + 2} / span ${合并.跨度列}` : 列 + 2,
              gridRow: 合并 !== null && 合并.是左上角 ? `${行 + 2} / span ${合并.跨度行}` : 行 + 2,
              width: `${工作表.列宽[列] ?? 默认列宽}px`,
              height: `${工作表.行高[行] ?? 默认行高}px`,
              textAlign: 单元.格式.水平对齐 ?? 'left',
              fontWeight: 单元.格式.加粗 === true ? 600 : 400,
              fontStyle: 单元.格式.斜体 === true ? 'italic' : 'normal',
              textDecoration: 单元.格式.下划线 === true ? 'underline' : 'none',
              color: 单元.格式.字体颜色,
              background: 单元.格式.填充颜色,
              // 自动换行必须由渲染层消费，否则命令写了格式而界面无变化
              whiteSpace: 单元.格式.自动换行 === true ? 'pre-wrap' : 'nowrap',
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

  const 列宽模板 = 工作表.列宽.map((宽) => `${宽}px`).join(' ')
  const 行高模板 = 工作表.行高.map((高) => `${高}px`).join(' ')

  return React.createElement(
    'div',
    {
      className: 'wps-sheet',
      style: {
        // 列宽与行高取自工作表数据，避免调整后网格与单元格错位
        gridTemplateColumns: `46px ${列宽模板}`,
        gridTemplateRows: `24px ${行高模板}`,
        zoom: scale,
      },
    },
    网格子元素
  )
}

export default GridView
