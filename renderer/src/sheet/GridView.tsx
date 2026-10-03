// 表格网格视图：列标、行号与单元格。
// 单元格为受控组件，编辑状态由上层维护。支持鼠标左键按下拖动框选区域。
import React, { useEffect, useRef } from 'react'
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
  /** 冻结前若干行与列；零表示该方向不冻结 */
  冻结?: { 行: number; 列: number }
  /** 筛选隐藏的数据行，地址与原始行号保持不变 */
  隐藏行?: Set<number>
  on选中: (位置: 单元格位置, 扩展选区: boolean) => void
  on双击: (地址: string) => void
  on编辑值变化: (值: string) => void
  on提交编辑: () => void
  on取消编辑: () => void
  on选中整列: (列: number) => void
  on选中整行: (行: number) => void
  on全选: () => void
  /** 键盘操作，由容器实现具体行为 */
  on按键?: (事件: React.KeyboardEvent) => void
  /** 鼠标拖选过程中经过新单元格时回调（起点保持按下时的锚点） */
  on拖选扩展?: (位置: 单元格位置) => void
  /** 开始拖动列宽 */
  on列宽拖动开始?: (列: number, 起始横坐标: number) => void
  /** 右键点击回调，返回坐标 */
  onContextMenu?: (x: number, y: number) => void
  on删除图片?: (标识: string) => void
}

/** 判断位置是否落在选区内 */
/** 判断位置是否落在选区内（选区起点/终点支持任意方向的反向扩展） */
function 在选区内(位置: 单元格位置, 选区: 选区范围): boolean {
  const 行最小 = Math.min(选区.起点.行, 选区.终点.行)
  const 行最大 = Math.max(选区.起点.行, 选区.终点.行)
  const 列最小 = Math.min(选区.起点.列, 选区.终点.列)
  const 列最大 = Math.max(选区.起点.列, 选区.终点.列)
  return (
    位置.行 >= 行最小 &&
    位置.行 <= 行最大 &&
    位置.列 >= 列最小 &&
    位置.列 <= 列最大
  )
}

/** 把单元格边框配置转换为内阴影，避免与网格基础边框叠加引起布局位移 */
function 边框阴影(边框: { 上?: boolean; 下?: boolean; 左?: boolean; 右?: boolean } | undefined): string | undefined {
  if (边框 === undefined) {
    return undefined
  }
  const 层: string[] = []
  if (边框.上 === true) 层.push('inset 0 1px 0 0 #4A5568')
  if (边框.下 === true) 层.push('inset 0 -1px 0 0 #4A5568')
  if (边框.左 === true) 层.push('inset 1px 0 0 0 #4A5568')
  if (边框.右 === true) 层.push('inset -1px 0 0 0 #4A5568')
  return 层.length > 0 ? 层.join(', ') : undefined
}

const GridView = ({
  工作表,
  选区,
  编辑地址,
  编辑值,
  scale = 1,
  冻结,
  隐藏行,
  on选中,
  on双击,
  on编辑值变化,
  on提交编辑,
  on取消编辑,
   on选中整列,
  on选中整行,
  on全选,
  on按键,
  on拖选扩展,
  on列宽拖动开始,
  onContextMenu,
  on删除图片,
}: Props) => {
  /** 拖选进行中标记：左键按下时置位，document mouseup 时复位 */
  const 拖选中 = useRef(false)

  useEffect(() => {
    const 结束拖选 = () => {
      拖选中.current = false
    }
    document.addEventListener('mouseup', 结束拖选)
    return () => document.removeEventListener('mouseup', 结束拖选)
  }, [])
  const 列标 = Array.from({ length: 工作表.列数 }, (_, 列) => 列转字母(列))
  const 行号 = Array.from({ length: 工作表.行数 }, (_, 行) => 行 + 1)
  const 冻结行 = Math.max(0, Math.min(冻结?.行 ?? 0, 工作表.行数))
  const 冻结列 = Math.max(0, Math.min(冻结?.列 ?? 0, 工作表.列数))
  const 列左偏移 = [46]
  for (let 列 = 0; 列 < 工作表.列数; 列 += 1) 列左偏移.push(列左偏移[列] + (工作表.列宽[列] ?? 默认列宽))
  const 行顶偏移 = [24]
  for (let 行 = 0; 行 < 工作表.行数; 行 += 1) 行顶偏移.push(行顶偏移[行] + (隐藏行?.has(行) ? 0 : 工作表.行高[行] ?? 默认行高))

  // 第一行为角落与列标，其余每行为行号加该行单元格；全部显式定位以支持合并单元格
  const 网格子元素: React.ReactNode[] = [
    React.createElement('div', {
      key: 'corner',
      className: 'wps-sheet__corner',
      style: { gridColumn: 1, gridRow: 1, zIndex: 8 },
      onClick: on全选,
      title: '全选',
    }),
    ...列标.map((字母, 列) =>
      React.createElement(
        'div',
        {
          key: `col-${字母}`,
          className: 'wps-sheet__col',
          style: { gridColumn: 列 + 2, gridRow: 1, zIndex: 6, ...(列 < 冻结列 ? { left: 列左偏移[列] } : {}) },
          onClick: () => on选中整列(列),
        },
        字母,
        // 列标右缘的拖动手柄，用于调整列宽
        React.createElement('span', {
          className: 'wps-sheet__col-resizer',
          'aria-label': `调整第 ${列 + 1} 列宽度`,
          onMouseDown: (事件: React.MouseEvent) => {
            事件.stopPropagation()
            事件.preventDefault()
            if (on列宽拖动开始 !== undefined) {
              on列宽拖动开始(列, 事件.clientX)
            }
          },
          onClick: (事件: React.MouseEvent) => 事件.stopPropagation(),
        })
      )
    ),
  ]

  行号.forEach((号, 行) => {
    if (隐藏行?.has(行)) return
    网格子元素.push(
      React.createElement(
        'div',
        {
          key: `row-${号}`,
          className: 'wps-sheet__rownum',
          style: { gridColumn: 1, gridRow: 行 + 2, zIndex: 6, ...(行 < 冻结行 ? { top: 行顶偏移[行] } : {}) },
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
        单元.批注 ? 'wps-sheet__cell--commented' : '',
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
            title: 单元.批注 ? `批注：${单元.批注}` : undefined,
            style: {
              gridColumn: 合并 !== null && 合并.是左上角 ? `${列 + 2} / span ${合并.跨度列}` : 列 + 2,
              gridRow: 合并 !== null && 合并.是左上角 ? `${行 + 2} / span ${合并.跨度行}` : 行 + 2,
              width: `${工作表.列宽[列] ?? 默认列宽}px`,
              height: `${工作表.行高[行] ?? 默认行高}px`,
              textAlign: 单元.格式.水平对齐 ?? 'left',
              justifyContent: 单元.格式.水平对齐 === 'right' ? 'flex-end' : 单元.格式.水平对齐 === 'center' ? 'center' : 'flex-start',
              alignItems: 单元.格式.垂直对齐 === 'top' ? 'flex-start' : 单元.格式.垂直对齐 === 'bottom' ? 'flex-end' : 'center',
              fontFamily: 单元.格式.字体,
              fontSize: 单元.格式.字号 === undefined ? undefined : `${单元.格式.字号}px`,
              fontWeight: 单元.格式.加粗 === true ? 600 : 400,
              fontStyle: 单元.格式.斜体 === true ? 'italic' : 'normal',
              textDecoration: 单元.格式.下划线 === true ? 'underline' : 'none',
              color: 单元.格式.字体颜色,
              background: 单元.格式.填充颜色,
              boxShadow: 边框阴影(单元.格式.边框),
              // 自动换行必须由渲染层消费，否则命令写了格式而界面无变化
              whiteSpace: 单元.格式.自动换行 === true ? 'pre-wrap' : 'nowrap',
              position: 单元.批注 ? 'relative' : undefined,
              ...(行 < 冻结行 || 列 < 冻结列 ? {
                position: 'sticky',
                ...(行 < 冻结行 ? { top: 行顶偏移[行] } : {}),
                ...(列 < 冻结列 ? { left: 列左偏移[列] } : {}),
                zIndex: 行 < 冻结行 && 列 < 冻结列 ? 5 : 3,
                background: 单元.格式.填充颜色 ?? (选中 ? 'var(--brand-soft)' : 'var(--bg-card)'),
              } as React.CSSProperties : {}),
            },
            onMouseDown: (事件: React.MouseEvent) => {
              if (事件.button === 2) {
                // 右键落在选区外时先把选区移到该格（WPS 习惯），落在选区内则保持不变
                if (!在选区内(位置, 选区)) {
                  on选中(位置, false)
                }
                return
              }
              if (事件.button !== 0) {
                return
              }
              拖选中.current = true
              on选中(位置, 事件.shiftKey)
            },
            onMouseMove: () => {
              if (拖选中.current && on拖选扩展 !== undefined) {
                on拖选扩展(位置)
              }
            },
            onDoubleClick: () => on双击(地址),
          },
          编辑中 && 单元.数据验证?.类型 === '列表'
            ? React.createElement('select', {
                className: 'wps-sheet__editor',
                'aria-label': `${地址} 选项`,
                value: 编辑值,
                autoFocus: true,
                onChange: (事件: React.ChangeEvent<HTMLSelectElement>) => on编辑值变化(事件.target.value),
                onKeyDown: (事件: React.KeyboardEvent) => {
                  if (事件.key === 'Enter') on提交编辑()
                  if (事件.key === 'Escape') on取消编辑()
                },
                onBlur: on提交编辑,
              }, [
                ...(单元.数据验证.允许空白 ? [React.createElement('option', { key: '', value: '' }, '空白')] : []),
                ...(!单元.数据验证.选项.includes(编辑值) && 编辑值 !== '' ? [React.createElement('option', { key: 编辑值, value: 编辑值 }, `${编辑值}（原值）`)] : []),
                ...单元.数据验证.选项.map((选项) => React.createElement('option', { key: 选项, value: 选项 }, 选项)),
              ])
            : 编辑中
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

  ;(工作表.图片 ?? []).forEach((图片) => {
    if (图片.格式 !== 'png' && 图片.格式 !== 'jpeg') return
    if (!Number.isInteger(图片.行) || !Number.isInteger(图片.列) ||
      图片.行 < 0 || 图片.行 >= 工作表.行数 || 图片.列 < 0 || 图片.列 >= 工作表.列数) return
    网格子元素.push(React.createElement('div', {
      key: `image-${图片.id}`,
      className: 'wps-sheet__image',
      style: {
        gridColumn: 图片.列 + 2,
        gridRow: 图片.行 + 2,
        width: 图片.宽,
        height: 图片.高,
        zIndex: 2,
        ...(图片.行 < 冻结行 || 图片.列 < 冻结列 ? {
          position: 'sticky',
          ...(图片.行 < 冻结行 ? { top: 行顶偏移[图片.行] } : {}),
          ...(图片.列 < 冻结列 ? { left: 列左偏移[图片.列] } : {}),
        } as React.CSSProperties : {}),
      },
      onMouseDown: (事件: React.MouseEvent) => 事件.stopPropagation(),
    },
    React.createElement('img', {
      src: `data:image/${图片.格式};base64,${图片.数据}`,
      alt: '工作表图片',
      draggable: false,
    }),
    on删除图片 ? React.createElement('button', {
      type: 'button',
      'aria-label': `删除 ${生成地址(图片.行, 图片.列)} 的图片`,
      title: '删除图片',
      onClick: (事件: React.MouseEvent) => {
        事件.stopPropagation()
        on删除图片(图片.id)
      },
    }, '删除') : null))
  })

  const 列宽模板 = 工作表.列宽.map((宽) => `${宽}px`).join(' ')
  const 行高模板 = 工作表.行高.map((高, 行) => `${隐藏行?.has(行) ? 0 : 高}px`).join(' ')

  return React.createElement(
    'div',
    {
      className: 'wps-sheet',
      // 可聚焦以接收键盘操作；方向键、回车、Delete 等由容器处理
      tabIndex: 0,
      onKeyDown: on按键,
      onContextMenu: (事件: React.MouseEvent) => {
        if (onContextMenu !== undefined) {
          事件.preventDefault()
          onContextMenu(事件.clientX, 事件.clientY)
        }
      },
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
