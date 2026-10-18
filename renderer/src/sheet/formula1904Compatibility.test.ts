import { createRequire } from 'node:module'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { 从Html表格构建工作表 } from './sheetImport'
import { 导出为Xlsx } from './sheetExport'
import { 创建工作表, 写入单元格, 重算工作簿, 读取单元格 } from './model'

const { 读取xlsx, 写入xlsx } = createRequire(import.meta.url)('../../../main/office/xlsxCodec.js')
async function fixture(booleanText: boolean) {
  const bytes = await 写入xlsx({ 日期系统1904: true, 工作表: [
    { 名称: 'Data', 日期系统1904: true, 数据: [['0'], ['43830']] },
    { 名称: 'Calc', 日期系统1904: true, 数据: [[{ 公式: 'YEAR(Data!A1)', 结果: 9999 }, { 公式: 'DATE(1904,1,1)', 结果: 9999 }, { 公式: 'DAY(Data!A1)', 结果: 9999 }, { 公式: 'IFERROR(1/0,MONTH(Data!A1))', 结果: 9999 }]] },
  ] })
  if (!booleanText) return bytes
  const zip = await JSZip.loadAsync(bytes)
  zip.file('xl/workbook.xml', (await zip.file('xl/workbook.xml')!.async('string')).replace('date1904="1"', 'date1904="true"'))
  return zip.generateAsync({ type: 'nodebuffer' })
}
async function open(bytes: Uint8Array) {
  const decoded = await 读取xlsx(bytes)
  expect(decoded.工作表列表.every((sheet: { 元数据: { 日期系统1904?: boolean } }) => sheet.元数据.日期系统1904)).toBe(true)
  return 重算工作簿(decoded.工作表列表.map((sheet: { html: string; 名称: string; 页面设置: any; 元数据: any }) => 从Html表格构建工作表(sheet.html, sheet.名称, sheet.页面设置, sheet.元数据)!))
}
describe('1904 来源公式完整导入、修改与保存', () => {
  it.each([false, true])('原始 workbookPr 日期布尔使用 true 字样=%s，跨表及惰性计算使用1904上下文', async booleanText => {
    const sheets = await open(await fixture(booleanText))
    expect(sheets.every(sheet => sheet.日期系统1904 === true)).toBe(true)
    expect(读取单元格(sheets[1], 'A1').显示值).toBe('1904')
    expect(读取单元格(sheets[1], 'B1').显示值).toBe('0')
    expect(读取单元格(sheets[1], 'C1').显示值).toBe('1')
    expect(读取单元格(sheets[1], 'D1').显示值).toBe('1')
  })
  it('修改跨表日期引用后保存重开，日期基准和实际公式结果仍保留', async () => {
    const initial = await open(await fixture(true))
    const changed = 重算工作簿([写入单元格(initial[0], 'A1', '43830'), initial[1]])
    expect(读取单元格(changed[1], 'A1').显示值).toBe('2024')
    const model = 导出为Xlsx(changed)!
    expect(model.日期系统1904).toBe(true)
    const reopened = await open(await 写入xlsx(model))
    expect(读取单元格(reopened[0], 'A1').原始值).toBe('43830')
    expect(读取单元格(reopened[1], 'A1').显示值).toBe('2024')
    expect(读取单元格(reopened[1], 'B1').显示值).toBe('0')
  })
  it('不同日期基准的工作表禁止合并保存', async () => {
    const date1904 = { ...写入单元格(创建工作表('1904'), 'A1', '0'), 日期系统1904: true }
    const date1900 = 写入单元格(创建工作表('1900'), 'A1', '0')
    expect(() => 导出为Xlsx([date1904, date1900])).toThrow(/日期基准不一致/)
    await expect(写入xlsx({ 工作表: [{ 名称: '1904', 日期系统1904: true, 数据: [['0']] }, { 名称: '1900', 数据: [['0']] }] })).rejects.toThrow(/日期基准不一致/)
  })
})
