import type { CSSProperties } from 'react'
import type { CellFormat, SheetCell } from './model'

export function fontStyle(format: CellFormat = {}): CSSProperties {
  return { fontFamily: format.字体, fontSize: format.字号, fontWeight: format.加粗 === undefined ? undefined : format.加粗 ? 600 : 400,
    fontStyle: format.斜体 === undefined ? undefined : format.斜体 ? 'italic' : 'normal',
    textDecoration: format.下划线 === undefined ? undefined : format.下划线 ? 'underline' : 'none', color: format.字体颜色 }
}

export default function RichCellText({ cell }: { cell: SheetCell }) {
  return cell.富文本 && cell.富文本.map(run => run.文本).join('') === cell.显示值
    ? <span>{cell.富文本.map((run, index) => <span key={index} style={fontStyle(run.格式)}>{run.文本}</span>)}</span>
    : <>{cell.显示值}</>
}
