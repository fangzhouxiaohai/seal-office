import { 解析地址 } from './address'
import { 查询合并, 最小列宽, type CellFormat, type Sheet } from './model'

type Measure = (text: string, format: CellFormat) => number
export function 自适应列宽(sheet: Sheet, measure?: Measure): Sheet {
  if (sheet.保护) throw new Error('工作表已保护，无法调整列宽')
  const context = measure ? null : document.createElement('canvas').getContext('2d')
  const widthOf: Measure = measure ?? ((text, format) => {
    const size = format.字号 ?? 14
    if (!context) return [...text].reduce((sum, char) => sum + (char.codePointAt(0)! > 255 ? size : size * 0.6), 0)
    context.font = `${format.斜体 ? 'italic ' : ''}${format.加粗 ? '600 ' : ''}${size}px ${format.字体 ? JSON.stringify(format.字体) + ',' : ''}"Microsoft YaHei", sans-serif`
    return context.measureText(text).width
  })
  const widths = new Map<number, number>()
  for (const [address, cell] of Object.entries(sheet.单元格)) {
    const point = 解析地址(address)
    if (!point || point.列 >= sheet.列数 || !cell.显示值) continue
    const merge = 查询合并(sheet, point)
    // A title merged across several columns must not widen every data column.
    if (merge && (!merge.是左上角 || merge.跨度列 > 1)) continue
    let lineWidth = 0, maximum = 0
    const runs = cell.富文本?.map(run => run.文本).join('') === cell.显示值 ? cell.富文本! : [{ 文本: cell.显示值, 格式: cell.格式 }]
    for (const run of runs) {
      const lines = run.文本.split(/\r\n?|\n/)
      lines.forEach((line, index) => {
        if (index) { maximum = Math.max(maximum, lineWidth); lineWidth = 0 }
        lineWidth += widthOf(line, { ...cell.格式, ...run.格式 })
      })
    }
    const measured = Math.max(maximum, lineWidth) + 18
    if (Number.isFinite(measured)) widths.set(point.列, Math.max(widths.get(point.列) ?? 最小列宽, Math.min(2048, Math.ceil(measured))))
  }
  if (!widths.size) return sheet
  return { ...sheet, 列宽: sheet.列宽.map((width, column) => widths.get(column) ?? width) }
}
