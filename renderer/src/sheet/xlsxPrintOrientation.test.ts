import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { 从Html表格构建工作表 } from './sheetImport'
import { 导出为Xlsx } from './sheetExport'
import { 创建工作表, 设置页面设置, 读取单元格, 写入单元格, 重算工作簿, type Sheet } from './model'

const require = createRequire(import.meta.url)
const ExcelJS = require('exceljs')
const JSZip = require('jszip')
const { 读取xlsx, 写入xlsx } = require('../../../main/office/xlsxCodec')
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'
const decode = async (bytes: Uint8Array) => {
  const result = await 读取xlsx(bytes)
  const sheets: Sheet[] = result.工作表列表.map((sheet: any) => 从Html表格构建工作表(sheet.html, sheet.名称, sheet.页面设置, sheet.元数据)!)
  return { result, sheets: 重算工作簿(sheets) }
}

describe('XLSX 标准默认打印方向与真实编辑往返', () => {
  it.each(['default', 'portrait', 'landscape'])('保留合法方向 %s，编辑、保存和再次保存都不误报内容丢失', async orientation => {
    const book = new ExcelJS.Workbook()
    const sheet = book.addWorksheet('网站导出', { pageSetup: { orientation, paperSize: 1 } })
    sheet.addRow(['分类', '问题', '回复内容', '关键词', '权重', '状态'])
    sheet.addRow(['示例', '待编辑', '中文 𠮷 👩🏽‍💻 & < >', '00123', 50, 2])
    book.addWorksheet('说明', { pageSetup: { orientation } }).getCell('A1').value = '保留第二工作表'
    let bytes = await book.xlsx.writeBuffer()
    for (let cycle = 0; cycle < 2; cycle++) {
      const { result, sheets } = await decode(bytes)
      expect(result.警告).toEqual([])
      expect(sheets[0].页面设置.方向).toBe(({ default: '跟随打印机', portrait: '纵向', landscape: '横向' } as const)[orientation as 'default' | 'portrait' | 'landscape'])
      expect(读取单元格(sheets[0], 'C2').原始值).toBe('中文 𠮷 👩🏽‍💻 & < >')
      expect(读取单元格(sheets[0], 'D2').原始值).toBe('00123')
      sheets[0] = 写入单元格(sheets[0], 'B2', `已编辑${cycle + 1}`)
      bytes = await 写入xlsx(导出为Xlsx(sheets))
      const saved = new ExcelJS.Workbook(); await saved.xlsx.load(bytes)
      expect(saved.worksheets).toHaveLength(2)
      expect(saved.worksheets[0].pageSetup.orientation).toBe(orientation)
      expect(saved.worksheets[0].getCell('B2').value).toBe(`已编辑${cycle + 1}`)
      expect(saved.worksheets[0].getCell('D2').value).toBe('00123')
    }
  })

  it('缺省方向按标准默认值导入，非法值仍触发保真提示', async () => {
    const book = new ExcelJS.Workbook(); book.addWorksheet('来源').getCell('A1').value = '正文'
    const zip = await JSZip.loadAsync(await book.xlsx.writeBuffer())
    const path = 'xl/worksheets/sheet1.xml'
    const source = await zip.file(path).async('string')
    for (const orientation of ['', 'diagonal', 'toString']) {
      zip.file(path, source.replace(/orientation="[^"]*"/, orientation ? `orientation="${orientation}"` : ''))
      const { result, sheets } = await decode(await zip.generateAsync({ type: 'nodebuffer' }))
      if (orientation) expect(result.警告).toContain('纸张方向未导入')
      else {
        expect(result.警告).toEqual([])
        expect(sheets[0].页面设置.方向).toBe('跟随打印机')
        const saved = new ExcelJS.Workbook(); await saved.xlsx.load(await 写入xlsx(导出为Xlsx(sheets)))
        expect(saved.worksheets[0].pageSetup.orientation).toBe('default')
      }
    }
  })

  it('复杂工作簿的合并、图片、跨表公式、数字格式、批注、验证和冻结同默认方向一起保留', async () => {
    const book = new ExcelJS.Workbook()
    const main = book.addWorksheet('经营表', { pageSetup: { orientation: 'default', paperSize: 9 }, views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] })
    main.mergeCells('A1:D1'); main.getCell('A1').value = '项目 𠀀 e\u0301 👩🏽‍💻'
    main.getCell('A1').font = { bold: true, color: { argb: 'FF2463EB' } }
    main.getCell('A2').value = '00123'; main.getCell('A2').note = '保留批注'
    main.getCell('B2').value = 28000; main.getCell('B2').numFmt = '#,##0.00'
    main.getCell('C2').value = { formula: "B2+'数据'!A1", result: 28200 }
    main.getCell('D2').value = { text: '资料', hyperlink: 'https://example.com/资料?q=𠀀&x=1' }
    main.getCell('A3').value = '待办'
    main.getCell('A3').dataValidation = { type: 'list', formulae: ['"待办,完成"'], allowBlank: false }
    main.getColumn(2).width = 20; main.getRow(2).height = 30
    const image = book.addImage({ base64: png, extension: 'png' })
    main.addImage(image, { tl: { col: 0, row: 4 }, ext: { width: 32, height: 24 } })
    book.addWorksheet('数据').getCell('A1').value = 200
    let bytes = await book.xlsx.writeBuffer()
    for (let cycle = 0; cycle < 2; cycle++) {
      const { result, sheets } = await decode(bytes)
      expect(result.警告).toEqual([])
      expect(sheets[0].合并区域).toEqual(['A1:D1'])
      expect(sheets[0].冻结).toEqual({ 行: 2, 列: 1 })
      expect(sheets[0].图片).toHaveLength(1)
      expect(sheets[0].图片![0].数据).toBe(png)
      expect(读取单元格(sheets[0], 'A1').原始值).toBe('项目 𠀀 e\u0301 👩🏽‍💻')
      expect(读取单元格(sheets[0], 'A2').批注).toBe('保留批注')
      expect(读取单元格(sheets[0], 'A3').数据验证).toMatchObject({ 类型: '列表', 选项: ['待办', '完成'] })
      expect(读取单元格(sheets[0], 'B2').格式.数字格式代码).toBe('#,##0.00')
      expect(读取单元格(sheets[0], 'D2').超链接).toBe('https://example.com/资料?q=𠀀&x=1')
      expect(读取单元格(sheets[0], 'C2').原始值).toBe("=B2+'数据'!A1")
      sheets[0] = 写入单元格(sheets[0], 'B2', `${30000 + cycle * 1000}`)
      const recalculated = 重算工作簿(sheets)
      expect(读取单元格(recalculated[0], 'C2').计算值).toBe(30200 + cycle * 1000)
      bytes = await 写入xlsx(导出为Xlsx(recalculated))
      const saved = new ExcelJS.Workbook(); await saved.xlsx.load(bytes)
      expect(saved.worksheets[0].pageSetup.orientation).toBe('default')
      expect(saved.worksheets[0].getCell('C2').value).toEqual({ formula: "B2+'数据'!A1", result: 30200 + cycle * 1000 })
    }
  })

  it('空白工作表的顺序、名称和被公式引用的目标经实际 XLSX 保存保留', async () => {
    const workbook = [创建工作表('封面'), 写入单元格(创建工作表('计算'), 'A1', "='待填数据'!A1+1"), 创建工作表('待填数据'), 创建工作表('预留')]
    const bytes = await 写入xlsx(导出为Xlsx(workbook))
    const saved = new ExcelJS.Workbook(); await saved.xlsx.load(bytes)
    expect(saved.worksheets.map((sheet: any) => sheet.name)).toEqual(['封面', '计算', '待填数据', '预留'])
    expect(saved.worksheets[1].getCell('A1').value).toEqual({ formula: "'待填数据'!A1+1", result: 1 })
    const { sheets } = await decode(bytes)
    sheets[2] = 写入单元格(sheets[2], 'A1', '9')
    const next = await decode(await 写入xlsx(导出为Xlsx(sheets)))
    expect(next.sheets.map(sheet => sheet.name)).toEqual(['封面', '计算', '待填数据', '预留'])
    expect(读取单元格(next.sheets[1], 'A1').计算值).toBe(10)
    const allEmpty = new ExcelJS.Workbook(); await allEmpty.xlsx.load(await 写入xlsx(导出为Xlsx([创建工作表('空一'), 创建工作表('空二')])))
    expect(allEmpty.worksheets.map((sheet: any) => sheet.name)).toEqual(['空一', '空二'])
  })

  it('只有页面设置的空表也能保存并恢复选择', async () => {
    const empty = 设置页面设置(创建工作表('打印模板'), { 方向: '跟随打印机', 纸张大小: 'Letter', 页边距: '窄' })
    const { result, sheets } = await decode(await 写入xlsx(导出为Xlsx(empty)))
    expect(result.警告).toEqual([])
    expect(sheets).toHaveLength(1)
    expect(sheets[0].name).toBe('打印模板')
    expect(sheets[0].页面设置).toEqual(empty.页面设置)
  })
})
