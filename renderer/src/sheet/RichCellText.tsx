import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { CellFormat, SheetCell } from './model'
import { 字体回退Css } from '../fonts/fallback'

export function fontStyle(format: CellFormat = {}): CSSProperties {
  return { fontFamily: format.字体 ? 字体回退Css(format.字体) : undefined, fontSize: format.字号 === undefined ? undefined : `${format.字号}pt`, fontWeight: format.加粗 === undefined ? undefined : format.加粗 ? 600 : 400,
    fontStyle: format.斜体 === undefined ? undefined : format.斜体 ? 'italic' : 'normal',
    textDecoration: format.下划线 === undefined ? undefined : format.下划线 ? 'underline' : 'none', color: format.字体颜色 }
}

function 缩小字体文本({ children, availableWidth }: { children: ReactNode; availableWidth: number }) {
  const 引用 = useRef<HTMLSpanElement>(null)
  const [比例, set比例] = useState(1)
  useLayoutEffect(() => {
    const 元素 = 引用.current
    if (!元素) return
    const 测量 = () => {
      const 文字宽 = 元素.scrollWidth
      const 单元 = 元素.parentElement
      const 样式 = 单元 && 单元.clientWidth > 0 ? getComputedStyle(单元) : null
      const 可用宽 = 样式 && 单元 ? 单元.clientWidth - parseFloat(样式.paddingLeft || '0') - parseFloat(样式.paddingRight || '0') : availableWidth
      if (文字宽 > 0 && 可用宽 > 0) set比例(Math.min(1, 可用宽 / 文字宽))
    }
    测量()
    const 观察器 = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(测量)
    观察器?.observe(元素)
    document.fonts?.addEventListener('loadingdone', 测量)
    return () => { 观察器?.disconnect(); document.fonts?.removeEventListener('loadingdone', 测量) }
  }, [availableWidth, children])
  return <span ref={引用} className="wps-sheet__fit-text" style={{ display: 'inline-block', flex: '0 0 auto', whiteSpace: 'nowrap', zoom: 比例 } as CSSProperties}>{children}</span>
}

export default function RichCellText({ cell, availableWidth }: { cell: SheetCell; availableWidth?: number }) {
  const 内容 = cell.富文本 && cell.富文本.map(run => run.文本).join('') === cell.显示值
    ? <span>{cell.富文本.map((run, index) => <span key={index} style={fontStyle(run.格式)}>{run.文本}</span>)}</span>
    : <>{cell.显示值}</>
  return cell.格式.缩小字体填充 && !cell.格式.自动换行 && availableWidth !== undefined
    ? <缩小字体文本 availableWidth={availableWidth}>{内容}</缩小字体文本>
    : 内容
}
