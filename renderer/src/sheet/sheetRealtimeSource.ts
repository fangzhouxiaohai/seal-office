import type { Sheet, SheetCell } from './model'

/** Only user-owned input is synchronized. Spill children and calculated displays
 * are rebuilt on each device; source caches stay on their original anchor. */
export function 提取协作工作簿(workbook: readonly Sheet[]): Sheet[] {
  return workbook.map(sheet => ({ ...sheet, 单元格: Object.fromEntries(Object.entries(sheet.单元格).flatMap(([address, cell]) => {
    const { 显示值: _display, 计算值: _value, 计算错误: _error, 布尔结果: _boolean, 公式状态: _state, 溢出锚点: owner, 溢出范围: _range, 溢出错误: _spillError, 动态数组: _dynamic, ...source } = cell
    if (owner) {
      const { 公式来源: _origin, 值类型: _type, ...independent } = source
      if (!Object.keys(cell.格式).length && !cell.批注 && !cell.数据验证 && !cell.超链接) return []
      return [[address, { ...independent, 原始值: '', 显示值: '' } as SheetCell]]
    }
    return [[address, { ...source, 显示值: '' } as SheetCell]]
  })) }))
}

/** Reject malformed or unbounded remote models before allocating a grid. */
export function 校验协作工作簿(value: unknown): string | null {
  if (!Array.isArray(value) || !value.length || value.length > 128) return '实时工作簿的工作表数量无效'
  const ids=new Set<string>(), date1904=value[0]?.日期系统1904 === true, mode=value[0]?.公式兼容模式 ?? 'Excel'
  let cells=0
  for (const sheet of value) {
    if (!sheet || typeof sheet.id !== 'string' || !sheet.id || ids.has(sheet.id) || typeof sheet.name !== 'string' || !sheet.name || (sheet.日期系统1904 === true) !== date1904) return '实时工作表标识或日期基准无效'
    ids.add(sheet.id)
    if (!['Excel','WPS'].includes(sheet.公式兼容模式 ?? 'Excel') || (sheet.公式兼容模式 ?? 'Excel') !== mode) return '实时工作表公式兼容模式不一致'
    if (!Number.isInteger(sheet.行数) || !Number.isInteger(sheet.列数) || sheet.行数 < 1 || sheet.列数 < 1 || sheet.行数 * sheet.列数 > 100000 || !Array.isArray(sheet.行高) || !Array.isArray(sheet.列宽) || !Array.isArray(sheet.合并区域) || !sheet.单元格 || typeof sheet.单元格 !== 'object' || Array.isArray(sheet.单元格)) return '实时工作表超出安全显示范围'
    for (const [address,cell] of Object.entries(sheet.单元格) as [string,SheetCell][]) {
      if (++cells > 100000 || !/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(address) || !cell || typeof cell.原始值 !== 'string' || cell.原始值.length > 32767 || !cell.格式 || typeof cell.格式 !== 'object') return '实时单元格数据无效或超出安全上限'
    }
  }
  return null
}
