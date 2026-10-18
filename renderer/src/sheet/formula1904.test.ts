import { describe, expect, it } from 'vitest'
import { 求值公式 } from './formula'
import { localDateToExcelSerial } from './formulaDates'
import { date1904Cases, formula1904FixtureCells as data } from './formulaFixtures'

const read = (address: string, sheet?: string) => !sheet || sheet.toLowerCase() === 'data' ? data[address] ?? '' : '#REF!'
describe('逐实例 1904 日期系统上下文', () => {
  it.each(date1904Cases)('%s = %s', (formula, expected) => expect(求值公式(formula, read, new Set(), '', { 日期系统1904: true })).toEqual({ 值: expected, 错误: false }))
  it('日期基准不依赖全局状态，交错调用保持两种文稿隔离', () => {
    expect(求值公式('=YEAR(0)', read, new Set(), '', { 日期系统1904: true }).值).toBe(1904)
    expect(求值公式('=YEAR(0)', read).值).toBe(1900)
    expect(求值公式('=DATE(1904,1,1)', read).值).toBe(1462)
    expect(求值公式('=DATE(1904,1,1)', read, new Set(), '', { 日期系统1904: true }).值).toBe(0)
    expect(localDateToExcelSerial(new Date(2024, 0, 1), true)).toBe(43830)
  })
})
