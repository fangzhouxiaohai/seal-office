import { createRequire } from 'node:module'
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { 从Html表格构建工作表 } from './sheetImport'
import { 读取单元格, 写入单元格 } from './model'
import { 导出为Xlsx } from './sheetExport'
import { 净化富文本 } from '../editor/sanitizeHtml'
import GridView from './GridView'

const require = createRequire(import.meta.url)
const ExcelJS = require('exceljs')
const { 读取xlsx, 写入xlsx } = require('../../../main/office/xlsxCodec')
const { 创建带前缀表格 } = require('../../../test/fixtures/prefixedXlsx.cjs')

describe('真实 XLSX 导入、计算与保存重开', () => {
  it('显式 XML 前缀和绝对关系的工作簿可编辑、重算并保存重开全部工作表', async () => {
    const 导入 = await 读取xlsx(await 创建带前缀表格({ 关系前缀: 'link' }))
    const 工作表 = 导入.工作表列表.map((表: any) => 从Html表格构建工作表(净化富文本(表.html), 表.名称, 表.页面设置, 表.元数据)!)
    expect(读取单元格(工作表[0], 'C3').显示值).toBe('30.00')
    工作表[0] = 写入单元格(工作表[0], 'B3', '5')
    expect(读取单元格(工作表[0], 'C3').显示值).toBe('50.00')
    const 数据 = await 写入xlsx(导出为Xlsx(工作表))
    const 重开 = await 读取xlsx(数据)
    expect(重开.工作表列表.map((表: any) => 表.名称)).toEqual(['逐条验收', '测试证据'])
    const 表 = 重开.工作表列表[0]
    const 模型 = 从Html表格构建工作表(表.html, 表.名称, 表.页面设置, 表.元数据)!
    expect(读取单元格(模型, 'C3').显示值).toBe('50.00')
    expect(读取单元格(模型, 'A3').原始值).toBe('x:文字 & <x:c>\n正常显示')
    expect(表.元数据.合并区域).toContain('A1:C1')
    expect(表.元数据.冻结).toEqual({ 行: 2, 列: 1 })
    expect(表.元数据.单元格验证.A3.选项).toEqual(['待办', '完成'])
    expect(重开.工作表列表[1].html).toContain('第二张工作表')
  })
  it('文本型公式原文保存后仍是文本，直接数值引用保持数值缓存', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('类型')
    ws.getCell('A1').value = '=1+1'
    ws.getCell('B1').value = 30000
    ws.getCell('B1').numFmt = '#,##0'
    ws.getCell('C1').value = { formula: 'B1', result: 30000 }
    const { 工作表列表 } = await 读取xlsx(await wb.xlsx.writeBuffer())
    const source = 工作表列表[0]
    const sheet = 从Html表格构建工作表(source.html, source.名称, source.页面设置, source.元数据)!
    const saved = new ExcelJS.Workbook()
    await saved.xlsx.load(await 写入xlsx(导出为Xlsx(sheet)))
    expect(saved.worksheets[0].getCell('A1').value).toBe('=1+1')
    expect(saved.worksheets[0].getCell('C1').value).toEqual({ formula: 'B1', result: 30000 })
  })

  it('单元格超链接经过编辑模型和保存重开仍保留目标', async () => {
    const 目标 = 'https://example.com/资料?q=𠀀&emoji=😀'
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('链接')
    ws.getCell('A1').value = { text: '查看资料', hyperlink: 目标 }
    const 导入 = await 读取xlsx(await wb.xlsx.writeBuffer())
    expect(导入.警告).not.toContain('超链接未导入')
    const source = 导入.工作表列表[0]
    let sheet = 从Html表格构建工作表(source.html, source.名称, source.页面设置, source.元数据)!
    expect(读取单元格(sheet, 'A1').超链接).toBe(目标)
    sheet = 写入单元格(sheet, 'A1', '更新后的链接文字')
    expect(读取单元格(sheet, 'A1').超链接).toBe(目标)
    const 重开 = await 读取xlsx(await 写入xlsx(导出为Xlsx(sheet)))
    expect(重开.工作表列表[0].元数据.超链接.A1).toBe(目标)
    expect(重开.工作表列表[0].html).toContain('更新后的链接文字')
  })

  it('带格式的数值与公式按原值运算，保存保留数值缓存、百分比精度及彩色边框', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('经营看板')
    ws.getCell('A1').value = 28000
    ws.getCell('B1').value = 30200
    ws.getCell('C1').value = { formula: 'B1/A1', result: 30200 / 28000 }
    ws.getCell('D1').value = { formula: 'B1-A1', result: 2200 }
    ws.getCell('E1').value = { formula: 'SUM(A1:B1)', result: 58200 }
    ws.getCell('F1').value = { formula: 'C1*100', result: 30200 / 28000 * 100 }
    for (const address of ['A1', 'B1', 'D1', 'E1']) ws.getCell(address).numFmt = '#,##0'
    ws.getCell('C1').numFmt = '0.0%'
    ws.getCell('B1').border = { bottom: { style: 'thin', color: { argb: 'FF2463EB' } } }
    const decoded = await 读取xlsx(await wb.xlsx.writeBuffer())
    const source = decoded.工作表列表[0]
    let sheet = 从Html表格构建工作表(净化富文本(source.html), source.名称, source.页面设置, source.元数据)!
    expect(读取单元格(sheet, 'D1').显示值).toBe('2,200')
    expect(读取单元格(sheet, 'E1').显示值).toBe('58,200')
    expect(读取单元格(sheet, 'C1').显示值).toBe('107.9%')
    expect(Number(读取单元格(sheet, 'F1').显示值)).toBeCloseTo(107.857142857)
    expect(decoded.警告).toEqual([])
    sheet = 写入单元格(sheet, 'B1', '35000')
    expect(读取单元格(sheet, 'D1').显示值).toBe('7,000')
    expect(读取单元格(sheet, 'C1').显示值).toBe('125.0%')
    expect(读取单元格(sheet, 'F1').显示值).toBe('125')
    const bytes = await 写入xlsx(导出为Xlsx(sheet))
    const saved = new ExcelJS.Workbook()
    await saved.xlsx.load(bytes)
    expect(saved.worksheets[0].getCell('C1').value).toEqual({ formula: 'B1/A1', result: 1.25 })
    expect(saved.worksheets[0].getCell('C1').numFmt).toBe('0.0%')
    expect(saved.worksheets[0].getCell('B1').border.bottom.color.argb).toBe('FF2463EB')
    const reopened = await 读取xlsx(bytes)
    const next = reopened.工作表列表[0]
    const sheet2 = 从Html表格构建工作表(净化富文本(next.html), next.名称, next.页面设置, next.元数据)!
    expect(读取单元格(sheet2, 'E1').显示值).toBe('63,000')
    expect(读取单元格(sheet2, 'F1').显示值).toBe('125')
    expect(reopened.警告).toEqual([])
  })

  it('合并区域在网格中占满所有行列，编辑和保存重开后仍保留标题与跨度', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('合并标题')
    ws.mergeCells('A1:C2')
    ws.getCell('A1').value = '海豹办公 · 项目经营看板'
    ws.getColumn(1).width = 12
    ws.getColumn(2).width = 18
    ws.getColumn(3).width = 20
    ws.getRow(1).height = 30
    ws.getRow(2).height = 24
    const { 工作表列表 } = await 读取xlsx(await wb.xlsx.writeBuffer())
    const source = 工作表列表[0]
    const sheet = 从Html表格构建工作表(source.html, source.名称, source.页面设置, source.元数据)!
    const noop = () => {}
    const { container } = render(<GridView 工作表={sheet} 选区={{起点:{行:0,列:0},终点:{行:0,列:0}}} 编辑地址={null} 编辑值="" on选中={noop} on双击={noop} on编辑值变化={noop} on提交编辑={noop} on取消编辑={noop} on选中整列={noop} on选中整行={noop} on全选={noop}/>)
    const title = container.querySelector('[data-地址="A1"]') as HTMLElement
    expect(title.style.width).toBe(`${sheet.列宽.slice(0,3).reduce((a,b)=>a+b,0)}px`)
    expect(title.style.height).toBe(`${sheet.行高[0]+sheet.行高[1]}px`)
    expect(container.querySelector('[data-地址="B1"]')).toBeNull()
    expect(container.querySelector('[data-地址="C2"]')).toBeNull()
    const edited = 写入单元格(sheet, 'A1', '更新后的项目经营看板')
    const saved = await 读取xlsx(await 写入xlsx(导出为Xlsx(edited)))
    expect(saved.工作表列表[0].元数据.合并区域).toEqual(['A1:C2'])
    expect(saved.工作表列表[0].html).toContain('更新后的项目经营看板')
  })
})
