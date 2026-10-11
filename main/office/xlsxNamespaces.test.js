const sax = require('sax')
const ExcelJS = require('exceljs')
const JSZip = require('jszip')
const { 规范表格Xml命名空间, 规范Xlsx命名空间 } = require('./xlsxNamespaces')
const { 读取xlsx } = require('./xlsxCodec')
const { 创建带前缀表格 } = require('../../test/fixtures/prefixedXlsx.cjs')

const 表格 = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const 关系 = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const 包关系 = 'http://schemas.openxmlformats.org/package/2006/relationships'

describe('XLSX 命名空间和关系路径兼容', () => {
  it.each(['x', 'sheet', 'sml'])('读取 %s: 标签的工作簿、样式、公式和两张工作表', async 前缀 => {
    const 结果 = await 读取xlsx(await 创建带前缀表格({ 前缀, 关系前缀: 'link' }))
    expect(结果.工作表列表.map(表 => 表.名称)).toEqual(['逐条验收', '测试证据'])
    const 表 = 结果.工作表列表[0]
    expect(表.html).toContain('x:文字 &amp; &lt;x:c&gt;\n正常显示')
    expect(表.html).toContain('data-formula="=B3*10"')
    expect(表.html).toContain('人工样例')
    expect(表.元数据.合并区域).toContain('A1:C1')
    expect(表.元数据.冻结).toEqual({ 行: 2, 列: 1 })
    expect(表.元数据.列宽[0]).toBe(196)
    expect(表.元数据.行高[0]).toBe(40)
    expect(表.元数据.单元格格式.A1).toMatchObject({ 字体: 'Arial', 字号: 18, 加粗: true, 字体颜色: '#2463EB', 填充颜色: '#EAF1FF' })
    expect(表.元数据.单元格验证.A3.选项).toEqual(['待办', '完成'])
    expect(结果.工作表列表[1].html).toContain('第二张工作表')
    expect(结果.警告).toContain('结构化表格未导入')
  })

  it('相对关系路径和显式前缀也可读取', async () => {
    const 结果 = await 读取xlsx(await 创建带前缀表格({ 绝对关系: false }))
    expect(结果.工作表列表).toHaveLength(2)
    expect(结果.工作表列表[0].html).toContain('人工样例')
  })

  it('绝对关系独立于标签前缀处理，ExcelJS 能解析结构化表格', async () => {
    const 原始 = await 创建带前缀表格()
    const 压缩包 = await JSZip.loadAsync(原始)
    const 数据 = await 规范Xlsx命名空间(压缩包, 原始)
    const 工作簿 = new ExcelJS.Workbook()
    await 工作簿.xlsx.load(数据)
    expect(工作簿.worksheets[0].getTable('Acceptance').name).toBe('Acceptance')
    expect(await 压缩包.file('xl/worksheets/_rels/sheet1.xml.rels').async('string')).toContain('Target="../tables/table1.xml"')
  })

  it('标准工作簿保留原始字节，不重新压缩', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    工作簿.addWorksheet('标准表').getCell('A1').value = '原始字节'
    const 原始 = await 工作簿.xlsx.writeBuffer()
    expect(await 规范Xlsx命名空间(await JSZip.loadAsync(原始), 原始)).toBe(原始)
  })

  it('按命名空间 URI 识别，保留外部节点、前缀重绑定和文本', () => {
    const xml = `<x:worksheet xmlns:x="${表格}" xmlns:link="${关系}" xmlns:r="urn:external"><x:sheetData/><x:extLst><x:ext uri="test"><x:foreign xmlns:x="urn:external" r:id="foreign" link:id="real"><![CDATA[<x:c>]]></x:foreign></x:ext></x:extLst></x:worksheet>`
    const 结果 = 规范表格Xml命名空间(xml)
    const 节点列表 = []
    const 解析器 = sax.parser(true, { xmlns: true })
    解析器.onopentag = 节点 => 节点列表.push(节点)
    解析器.write(结果).close()
    expect(节点列表[0].name).toBe('worksheet')
    expect(节点列表[0].uri).toBe(表格)
    const 外部 = 节点列表.find(节点 => 节点.local === 'foreign')
    expect(外部.name).toBe('x:foreign')
    expect(外部.uri).toBe('urn:external')
    expect(外部.attributes['r:id'].uri).toBe(关系)
    expect(Object.values(外部.attributes).some(属性 => 属性.uri === 'urn:external' && 属性.value === 'foreign')).toBe(true)
    expect(结果).toContain('<![CDATA[<x:c>]]>')
  })

  it('外部链接不作为包内关系改写', () => {
    const xml = `<p:Relationships xmlns:p="${包关系}"><p:Relationship Id="r1" Target="/downloads/report.xlsx" TargetMode="External"/><p:Relationship Id="r2" Target="https://example.com/file.xlsx"/></p:Relationships>`
    const 结果 = 规范表格Xml命名空间(xml, 'xl/worksheets')
    expect(结果).toContain('Target="/downloads/report.xlsx"')
    expect(结果).toContain('Target="https://example.com/file.xlsx"')
  })

  it('XML 声明前后的空白不会变成根节点外的实体', () => {
    const xml = `<?xml version="1.0"?>\n<x:workbook xmlns:x="${表格}"><x:sheets/></x:workbook>\n`
    const 结果 = 规范表格Xml命名空间(xml)
    expect(结果).toMatch(/^<\?xml version="1.0"\?>\n<workbook/)
    expect(() => sax.parser(true, { xmlns: true }).write(结果).close()).not.toThrow()
  })

  it.each([
    `<x:workbook xmlns:x="${表格}"><x:sheets></x:workbook>`,
    `<x:workbook xmlns:x="${表格}"/><x:workbook xmlns:x="${表格}"/>`,
    `<!DOCTYPE workbook [<!ENTITY secret SYSTEM "file:///private">]><workbook xmlns="${表格}"/>`,
  ])('损坏或带文档类型声明的 XML 仍然拒绝导入', xml => {
    expect(() => 规范表格Xml命名空间(xml)).toThrow()
  })
})
