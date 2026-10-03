// Excel 编解码器测试
const { 读取xlsx, 写入xlsx } = require('./xlsxCodec')
const ExcelJS = require('exceljs')
const JSZip = require('jszip')

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

    it('应该支持渲染层 { 工作表 } 契约', async () => {
      const 模型 = {
        工作表: [
          {
            名称: 'Sheet1',
            数据: [
              [{ 文字: [{ 文本: '甲' }], 表头: true }, { 文字: [{ 文本: '乙' }], 表头: true }],
              [{ 文字: [{ 文本: '丙' }] }, { 文字: [{ 文本: '丁' }] }],
            ],
          },
        ],
      }
      const result = await 写入xlsx(模型)
      expect(Buffer.isBuffer(result)).toBe(true)
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(result)
      const sheet = workbook.worksheets[0]
      expect(sheet.getCell('A1').value).toBe('甲')
      expect(sheet.getCell('B2').value).toBe('丁')
    })
  })
})

describe('xlsxCodec：xlsx 原生保存增强', () => {
  it('只有普通数值和文本时不产生保真警告', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('普通表')
    表.getCell('A1').value = 42
    表.getCell('B1').value = '文字'
    const 结果 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    expect(结果.警告).toEqual([])
  })

  it('读取包含单元格样式的文件时报告保存保真风险', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('格式表')
    表.getCell('A1').value = 42
    表.getCell('A1').font = { bold: true, color: { argb: 'FF336699' } }
    const 结果 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    expect(结果.警告.join('；')).toMatch(/样式|格式/)
  })

  it('读取包含图表部件的文件时报告图表丢失风险', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    工作簿.addWorksheet('图表数据').getCell('A1').value = 1
    const 压缩包 = await JSZip.loadAsync(await 工作簿.xlsx.writeBuffer())
    压缩包.file('xl/charts/chart1.xml', '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"/>')
    const 结果 = await 读取xlsx(await 压缩包.generateAsync({ type: 'nodebuffer' }))
    expect(结果.警告.join('；')).toMatch(/图表/)
  })

  it('合并区域和超链接被忽略时给出对应警告', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('链接表')
    表.mergeCells('A1:B1')
    表.getCell('A1').value = { text: '主页', hyperlink: 'https://example.com' }
    const 结果 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    expect(结果.警告.join('；')).toMatch(/合并单元格/)
    expect(结果.警告.join('；')).toMatch(/超链接/)
  })

  it('应把公式作为 XLSX 公式写入并在读取时保留公式原文', async () => {
    const 数据 = await 写入xlsx({ 工作表: [{ 名称: '公式', 数据: [['2', '3', { 公式: 'A1*B1', 结果: 6 }]] }] })
    const 工作簿 = new ExcelJS.Workbook()
    await 工作簿.xlsx.load(数据)
    expect(工作簿.worksheets[0].getCell('C1').value).toEqual({ formula: 'A1*B1', result: 6 })
    const 读回 = await 读取xlsx(数据)
    expect(读回.工作表列表[0].html).toContain('data-formula="=A1*B1"')
  })

  it('纯数字文本应写为数值单元格而非文本', async () => {
    const result = await 写入xlsx({ 行: [['42', '3.14', '-7', 'abc']] })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(result)
    const sheet = workbook.worksheets[0]
    expect(sheet.getCell('A1').value).toBe(42)
    expect(sheet.getCell('B1').value).toBe(3.14)
    expect(sheet.getCell('C1').value).toBe(-7)
    expect(sheet.getCell('D1').value).toBe('abc')
  })

  it('应支持多工作表写入并使用各自名称', async () => {
    const 模型 = {
      工作表: [
        { 名称: '一季度', 数据: [['甲', '1']] },
        { 名称: '二季度', 数据: [['乙', '2']] },
      ],
    }
    const result = await 写入xlsx(模型)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(result)
    expect(workbook.worksheets.map((s) => s.name)).toEqual(['一季度', '二季度'])
    expect(workbook.worksheets[1].getCell('A1').value).toBe('乙')
  })

  it('非法工作表名字符应被清洗且不超过 31 字符', async () => {
    const 模型 = { 工作表: [{ 名称: 'A/B:C*D?E[F]G\H'.repeat(4), 数据: [['x']] }] }
    const result = await 写入xlsx(模型)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(result)
    const 名称 = workbook.worksheets[0].name
    expect(名称).not.toMatch(/[/\?*[\]:]/)
    expect(名称.length).toBeLessThanOrEqual(31)
  })

  it('读取多工作表文件应返回全部工作表列表', async () => {
    const 写入结果 = await 写入xlsx({
      工作表: [
        { 名称: '首页', 数据: [['甲', '1']] },
        { 名称: '数据页', 数据: [['乙', '2']] },
      ],
    })
    const result = await 读取xlsx(写入结果)
    expect(result.工作表列表).toHaveLength(2)
    expect(result.工作表列表[0].名称).toBe('首页')
    expect(result.工作表列表[0].html).toContain('甲')
    expect(result.工作表列表[1].名称).toBe('数据页')
    expect(result.工作表列表[1].html).toContain('乙')
    // html 字段保持兼容：指向首个工作表
    expect(result.html).toBe(result.工作表列表[0].html)
  })

  it('读取时保留空白行的位置，避免单元格和公式引用错位', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('间隔行')
    表.getCell('A1').value = 1
    表.getCell('A3').value = 3
    const 结果 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    const 行 = 结果.工作表列表[0].html.match(/<tr>.*?<\/tr>/g)
    expect(行).toHaveLength(3)
    expect(行[1]).not.toContain('3')
    expect(行[2]).toContain('3')
  })
})
