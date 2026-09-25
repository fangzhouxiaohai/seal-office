// 画布：渲染当前幻灯片的文本框，支持选中、双击编辑、拖动和文本选择格式化。
import React, { useRef } from 'react'
import { 画布宽, 画布高, type 幻灯片, type 文本框 } from './deck'

interface Props {
  幻灯片: 幻灯片
  选中框标识: string | null
  缩放: number
  编辑框标识: string | null
  编辑值: string
  显示网格线: boolean
  on选中框: (标识: string | null) => void
  on双击框: (标识: string) => void
  on编辑值变化: (值: string) => void
  on提交编辑: () => void
  on拖动框: (标识: string, x: number, y: number) => void
  on文本选择: (标识: string, 起始: number, 结束: number) => void
  onContextMenu?: (x: number, y: number) => void
}

interface 拖动状态 {
  标识: string
  起始x: number
  起始y: number
  原x: number
  原y: number
}

/** 将文本分割为字符片段用于独立渲染 */
function 分割片段(文本: string): Array<{ 文本: string }> {
  if (!文本) return []
  return 文本.split('').map((字符) => ({ 文本: 字符 }))
}

const SlideCanvas = ({
  幻灯片,
  选中框标识,
  缩放,
  编辑框标识,
  编辑值,
  显示网格线,
  on选中框,
  on双击框,
  on编辑值变化,
  on提交编辑,
  on拖动框,
  on文本选择,
  onContextMenu,
}: Props) => {
  const 拖动 = useRef<拖动状态 | null>(null)
  const 选择起始 = useRef<number | null>(null)
  const 当前框文本 = useRef<string>('')

  const 处理按下 = (事件: React.MouseEvent, 框: 文本框) => {
    事件.stopPropagation()
    on选中框(框.id)
    当前框文本.current = 框.text
    选择起始.current = null
    拖动.current = {
      标识: 框.id,
      起始x: 事件.clientX,
      起始y: 事件.clientY,
      原x: 框.x,
      原y: 框.y,
    }
  }

  const 处理移动 = (事件: React.MouseEvent) => {
    const 状态 = 拖动.current
    if (状态 === null) {
      return
    }
    const 比例 = 缩放 <= 0 ? 1 : 缩放
    on拖动框(
      状态.标识,
      状态.原x + (事件.clientX - 状态.起始x) / 比例,
      状态.原y + (事件.clientY - 状态.起始y) / 比例
    )
  }

  const 停止拖动 = () => {
    拖动.current = null
  }

  const 处理文本框鼠标移动 = (事件: React.MouseEvent, 框: 文本框) => {
    // 只有在文本框被选中且不是拖动操作时，才检测文本选择
    if (选中框标识 !== 框.id || 拖动.current !== null) return
    const 比例 = 缩放 <= 0 ? 1 : 缩放
    const 相对x = (事件.clientX / 比例 - 框.x) / 框.width
    const 相对y = (事件.clientY / 比例 - 框.y) / 框.height
    // 估算光标位置：按字符比例计算
    const 文本 = 框.text
    const 估算位置 = Math.max(0, Math.min(文本.length, Math.floor(相对x * 文本.length + 相对y * 文本.length * 0.1)))
    if (选择起始.current === null) {
      选择起始.current = 估算位置
      return
    }
    on文本选择(框.id, 选择起始.current, 估算位置)
  }

  const 处理文本框鼠标离开 = () => {
    选择起始.current = null
  }

  const 处理文本框双击 = (事件: React.MouseEvent, 标识: string) => {
    事件.stopPropagation()
    选择起始.current = null
    on双击框(标识)
  }

  return React.createElement(
    'div',
    { className: 'wps-ppt-stage' },
    React.createElement(
      'div',
      {
        className: `wps-ppt-canvas${显示网格线 ? ' wps-ppt-canvas--gridlines' : ''}`,
        style: {
          width: `${画布宽}px`,
          height: `${画布高}px`,
          background: 幻灯片.背景色,
          transform: `scale(${缩放})`,
        },
        onClick: () => on选中框(null),
        onContextMenu: (事件: React.MouseEvent) => {
          if (onContextMenu) {
            事件.preventDefault()
            onContextMenu(事件.clientX, 事件.clientY)
          }
        },
        onMouseMove: 处理移动,
        onMouseUp: 停止拖动,
        onMouseLeave: 停止拖动,
      },
      幻灯片.文本框列表.map((框) => {
        const 片段列表 = 框.片段列表 && 框.片段列表.length > 0
          ? 框.片段列表
          : null
        return React.createElement(
          'div',
          {
            key: 框.id,
            className: [
              'wps-ppt-box',
              框.id === 选中框标识 ? 'wps-ppt-box--selected' : '',
              框.id === 编辑框标识 ? 'wps-ppt-box--editing' : '',
            ]
              .filter((项) => 项.length > 0)
              .join(' '),
            'data-框标识': 框.id,
            style: {
              left: `${框.x}px`,
              top: `${框.y}px`,
              width: `${框.width}px`,
              height: `${框.height}px`,
              fontSize: `${框.字号}px`,
              fontWeight: 框.加粗 ? 600 : 400,
              fontStyle: 框.斜体 ? 'italic' : 'normal',
              textDecoration: 框.下划线 ? 'underline' : 'none',
              color: 框.颜色,
              textAlign: 框.对齐,
              userSelect: 'text',
            },
            onMouseDown: (事件: React.MouseEvent) => 处理按下(事件, 框),
            onDoubleClick: (事件: React.MouseEvent) => 处理文本框双击(事件, 框.id),
            onMouseMove: (事件: React.MouseEvent) => 处理文本框鼠标移动(事件, 框),
            onMouseLeave: 处理文本框鼠标离开,
          },
          框.id === 编辑框标识
            ? React.createElement('textarea', {
                className: 'wps-ppt-box__editor',
                value: 编辑值,
                autoFocus: true,
                style: { textAlign: 框.对齐 },
                onChange: (事件: React.ChangeEvent<HTMLTextAreaElement>) =>
                  on编辑值变化(事件.target.value),
                onBlur: on提交编辑,
              })
            : 片段列表
              ? 片段列表.map((片段, 索引) =>
                  React.createElement(
                    'span',
                    {
                      key: 索引,
                      style: {
                        color: 片段.颜色 || 框.颜色,
                        fontWeight: 片段.加粗 ? 600 : undefined,
                        fontStyle: 片段.斜体 ? 'italic' : undefined,
                        textDecoration: 片段.下划线 ? 'underline' : undefined,
                      },
                    },
                    片段.文本
                  )
                )
              : 框.text
        )
      })
    )
  )
}

export default SlideCanvas
