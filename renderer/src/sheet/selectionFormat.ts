import { 读取单元格, type CellFormat, type Sheet, type SheetCell } from './model'
import { 生成地址 } from './address'
import type { 选区范围 } from './sheetCommands'

export interface 文字选区 { 表: string; 地址: string; 文本: string; 开始: number; 结束: number }
export function 分段(cell: SheetCell, range: 文字选区) {
  let offset = 0
  return (cell.富文本 ?? [{ 文本: cell.原始值 }]).flatMap(run => {
    const from = offset, to = offset += run.文本.length
    const bounds = [from, ...[range.开始, range.结束].filter(n => n > from && n < to), to]
    return bounds.slice(1).map((end, i) => ({
      文本: run.文本.slice(bounds[i] - from, end - from), 格式: run.格式,
      selected: bounds[i] >= range.开始 && end <= range.结束,
    }))
  })
}

export function 选区格式(sheet: Sheet, selection: 选区范围, range: 文字选区 | null, defaultFont: string) {
  const values = { 字体: new Set<string>(), 字号: new Set<string>(), 字体颜色: new Set<string>(), 填充颜色: new Set<string>() }
  function add(format: CellFormat) {
    values.字体.add(format.字体 || defaultFont)
    values.字号.add(String(format.字号 ?? 10))
    values.字体颜色.add(format.字体颜色 ?? '#1a1d24')
    values.填充颜色.add(format.填充颜色 ?? '#ffffff')
  }
  for (let c = Math.min(selection.起点.列,selection.终点.列); c <= Math.max(selection.起点.列,selection.终点.列); c++) {
    const column = sheet.列布局?.find(item => c >= item.起列 && c <= item.止列)?.格式
    for (let r = Math.min(selection.起点.行,selection.终点.行); r <= Math.max(selection.起点.行,selection.终点.行); r++) {
      const address = 生成地址(r,c), cell = 读取单元格(sheet,address)
      if (!cell.原始值 && !Object.keys(cell.格式).length) continue
      const base = { ...column, ...cell.格式 }
      if (range?.地址 === address && range.表 === sheet.id && range.文本 === cell.原始值)
        分段(cell, range).filter(run => run.selected).forEach(run => add({ ...base, ...run.格式 }))
      else if (cell.富文本?.length) cell.富文本.forEach(run => add({ ...base, ...run.格式 }))
      else add(base)
    }
  }
  if (!values.字号.size) add({})
  const common = (set: Set<string>) => set.size === 1 ? [...set][0] : '混合'
  return { 'cell.font': common(values.字体), 'cell.fontSize': common(values.字号), 'cell.fontColor': common(values.字体颜色), 'cell.fill': common(values.填充颜色) }
}
