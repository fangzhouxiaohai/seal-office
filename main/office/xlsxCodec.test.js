// Excel 编解码器测试
const { 读取xlsx, 写入xlsx } = require('./xlsxCodec')
const ExcelJS = require('exceljs')

describe('xlsxCodec', () => {
  describe('读取xlsx', () => {
    it('应该能读取空工作表', async () => {
      const workbook = new ExcelJS.Workbook()
      workbook.addWorksheet('空表')
      const buffer = await workbook.xlsx.writeBuffer()
      const result = await 读取xlsx(buffer)
      expect(result.html).toBeDefined()
      expect(result.警告).toBeDefined()
    })

    it('应该能读取包含数据的单元格', async () => {
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('测试')
      sheet.getCell('A1').value = 'Hello'
      sheet.getCell('B1').value = 'World'
      const buffer = await workbook.xlsx.writeBuffer()
      const result = await 读取xlsx(buffer)
      expect(result.html).toContain('Hello')
      expect(result.html).toContain('World')
    })

    it('空工作表应该返回空表格', async () => {
      const workbook = new ExcelJS.Workbook()
      workbook.addWorksheet('空表')
      const buffer = await workbook.xlsx.writeBuffer()
      const result = await 读取xlsx(buffer)
      expect(result.html).toContain('<table>')
      expect(result.html).toContain('<tbody>')
    })

    it('特殊字符应该被转义', async () => {
      const workbook = new ExcelJS.Workbook()
      const sheet = workbook.addWorksheet('测试')
      sheet.getCell('A1').value = '<script>alert("xss")</script>'
      const buffer = await workbook.xlsx.writeBuffer()
      const result = await 读取xlsx(buffer)
      expect(result.html).toContain('&lt;script&gt;')
      expect(result.html).not.toContain('<script>')
    })
  })

  describe('写入xlsx', () => {
    it('应该能写入空数据', async () => {
      const result = await 写入xlsx({ 行: [] })
      expect(Buffer.isBuffer(result)).toBe(true)
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(result)
      expect(workbook.worksheets.length).toBe(1)
    })

    it('应该能写入数据行', async () => {
      const result = await 写入xlsx({ 行: [['A1', 'B1'], ['A2', 'B2']] })
      expect(Buffer.isBuffer(result)).toBe(true)
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(result)
      const sheet = workbook.worksheets[0]
      expect(sheet.getCell('A1').value).toBe('A1')
      expect(sheet.getCell('B2').value).toBe('B2')
    })

    it('null 值应该转为空字符串', async () => {
      const result = await 写入xlsx({ 行: [[null, '值']] })
      expect(Buffer.isBuffer(result)).toBe(true)
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(result)
      const sheet = workbook.worksheets[0]
      expect(sheet.getCell('A1').value).toBe('')
    })
  })
})
