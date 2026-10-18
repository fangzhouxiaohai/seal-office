const ExcelJS = require('exceljs')
const JSZip = require('jszip')
const { 读取原始公式, 平移共享公式 } = require('./xlsxFormulas')
const { 读取xlsx, 写入xlsx } = require('./xlsxCodec')
const { 创建公式兼容表格 } = require('../../test/fixtures/formulaCompatibilityXlsx.cjs')

describe('XLSX 公式原文与类型化缓存', () => {
  it('共享公式仅平移相对引用，文本、表名、结构化列名与函数名称保持原样', () => {
    expect(平移共享公式('SUM($A1,A$1,$A$1,A1)+IF("A1"="a""B2",LOG10(A1),0)+\'A1\'!A1+Sheet1!A1+Table1[A1]', 'B1', 'C2'))
      .toBe('SUM($A2,B$1,$A$1,B2)+IF("A1"="a""B2",LOG10(B2),0)+\'A1\'!B2+Sheet1!B2+Table1[A1]')
    expect(平移共享公式('A1+$A1+A$1', 'B2', 'A1')).toBe('#REF!+#REF!+#REF!')
  })

  it.each([{ 显式前缀: true }, { 严格: true }, { 严格: true, 显式前缀: true }])('命名空间变体 %j 下共享公式、0、false、空文本、错误缓存与数组范围不丢', async 选项 => {
    const 导入 = await 读取xlsx(await 创建公式兼容表格(选项))
    const 来源 = 导入.工作表列表[0].元数据.公式来源
    expect(来源.B2.原始值).toBe('=SUM($A2,A$1,$A$1)+IF("A1"="A1",0,99)')
    expect(来源.C2.原始值).toBe('=IF(A2>0,"A1","B1")')
    expect(来源.B7.原始值).toBe('=A1+1')
    expect(来源.F1.结果).toBe(0)
    expect(来源.F2.结果).toBe(false)
    expect(来源.F3.结果).toBe('')
    expect(来源.F4.结果).toEqual({ error: '#N/A' })
    expect(来源.F5).not.toHaveProperty('结果')
    expect(来源.F6.结果).toBe('A<&😀')
    expect(来源.G1).toMatchObject({ 数组范围: 'G1:G2', 结果: 5 })
    expect(来源.H1.数组范围).toBe('H1:H2')
  })

  it('数组公式写回 f 的 array 类型、范围及重新计算标记', async () => {
    const 数据 = await 写入xlsx({ 工作表: [{ 名称: '数组', 数据: [[{ 公式: '_xlfn._xlws.FILTER(B1:B2,B1:B2>0)', 数组范围: 'A1:A2', 结果: 2 }, '2'], ['3', '3']] }] })
    const 包 = await JSZip.loadAsync(数据)
    expect(await 包.file('xl/worksheets/sheet1.xml').async('string')).toContain('t="array" ref="A1:A2"')
    expect(await 包.file('xl/workbook.xml').async('string')).toContain('fullCalcOnLoad="1"')
    const 簿 = new ExcelJS.Workbook(); await 簿.xlsx.load(数据)
    expect(簿.worksheets[0].getCell('A1').value).toMatchObject({ shareType: 'array', ref: 'A1:A2', result: 2 })
  })

  it('缺少主公式的共享单元格拒绝导入，避免把它误存成空格', () => {
    expect(() => 读取原始公式('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><f t="shared" si="999"/><v>5</v></c></row></sheetData></worksheet>')).toThrow('缺少主公式')
  })

  it('无法往返的模拟运算表与单元格元数据明确报告保真边界', async () => {
    const 警告 = new Set()
    读取原始公式('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><f t="dataTable" ref="A1:B2"/><v>5</v></c></row></sheetData></worksheet>', 警告)
    expect([...警告]).toContain('模拟运算表公式未导入')
    const 包 = await JSZip.loadAsync(await 创建公式兼容表格())
    包.file('xl/metadata.xml', '<metadata xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>')
    const 导入 = await 读取xlsx(await 包.generateAsync({ type: 'nodebuffer' }))
    expect(导入.警告).toContain('动态数组或其他单元格元数据未导入，已保留可读取的公式及缓存')
    expect(导入.工作表列表[0].元数据.公式来源.G1.原始值).toBe('=_xlfn._xlws.FILTER(A1:A2,A1:A2>0)')
  })
})
