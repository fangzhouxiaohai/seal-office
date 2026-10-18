const ExcelJS = require('exceljs')
const JSZip = require('jszip')
const { 读取xlsx, 写入xlsx } = require('./xlsxCodec')

describe('XLSX 日期基准和原始数字格式', () => {
  it.each(['1', 'true'])('识别原始 workbookPr 的合法日期布尔 %s，不依赖 ExcelJS 简化解析', async 标记 => {
    const 包 = await JSZip.loadAsync(await 写入xlsx({ 日期系统1904: true, 行: [[{ 公式: 'YEAR(0)', 结果: 1904 }, { 文字: [{ 文本: '0' }], 格式: { 数字格式代码: 'yyyy-mm-dd' } }]] }))
    包.file('xl/workbook.xml', (await 包.file('xl/workbook.xml').async('string')).replace(/date1904="[^"]*"/, `date1904="${标记}"`))
    const 导入 = await 读取xlsx(await 包.generateAsync({ type: 'nodebuffer' }))
    expect(导入.工作表列表[0].元数据.日期系统1904).toBe(true)
    expect(导入.工作表列表[0].html).toContain('>0</td>')
    expect(导入.工作表列表[0].元数据.公式来源.A1.结果).toBe(1904)
  })
  it.each([false, true])('日期格式的原始 XML 数字（含0和虚构serial60）不被Date对象改写，1904=%s', async 日期系统1904 => {
    const 簿 = new ExcelJS.Workbook(); 簿.properties.date1904 = 日期系统1904
    const 表 = 簿.addWorksheet('日期')
    const 值 = [0, 59, 60, 61, 45292, 0.5]
    值.forEach((值, i) => { 表.getCell(i + 1, 1).value = 值; 表.getCell(i + 1, 1).numFmt = i === 5 ? 'hh:mm:ss' : 'yyyy-mm-dd' })
    const 导入 = await 读取xlsx(await 簿.xlsx.writeBuffer()), 首 = 导入.工作表列表[0]
    expect(首.元数据.日期系统1904 === true).toBe(日期系统1904)
    expect([...首.html.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(m => m[1])).toEqual(值.map(String))
    expect(首.元数据.单元格格式.A3.数字格式代码).toBe('yyyy-mm-dd')
    expect(导入.警告).not.toContain('日期、布尔值或富文本单元格类型未保留')
    const 保存 = await 写入xlsx({ 日期系统1904, 行: 值.map((值, i) => [{ 文字: [{ 文本: String(值) }], 格式: { 数字格式代码: i === 5 ? 'hh:mm:ss' : 'yyyy-mm-dd' } }]) })
    const 包 = await JSZip.loadAsync(保存), xml = await 包.file('xl/worksheets/sheet1.xml').async('string')
    expect(xml).toContain('<v>60</v>')
    const 重开 = await 读取xlsx(保存)
    expect(重开.工作表列表[0].html).toBe(首.html)
    expect(重开.工作表列表[0].元数据.日期系统1904 === true).toBe(日期系统1904)
  })

  it('自定义代码保存原文，颜色/语言预览局限有明确提示；混合日期基准拒绝保存', async () => {
    const 代码 = ['000000', '0.00E+00', '# ?/?', 'yyyy"年"m"月"d"日"', '[Red]0.00', '[$-804]yyyy-mm-dd']
    const 字节 = await 写入xlsx({ 行: [代码.map(数字格式代码 => ({ 文字: [{ 文本: '1.25' }], 格式: { 数字格式代码 } }))] })
    const 导入 = await 读取xlsx(字节)
    代码.forEach((代码, i) => expect(导入.工作表列表[0].元数据.单元格格式[String.fromCharCode(65 + i) + '1'].数字格式代码).toBe(代码))
    expect(导入.警告).toContain('数字格式中的颜色或区域语言仅保留代码，预览可能不同')
    await expect(写入xlsx({ 工作表: [{ 名称: '甲', 数据: [['1']], 日期系统1904: true }, { 名称: '乙', 数据: [['2']] }] })).rejects.toThrow('日期基准不一致')
    await expect(写入xlsx({ 日期系统1904: 'true', 行: [['1']] })).rejects.toThrow('日期基准无效')
  })
})
