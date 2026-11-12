// 2.7.1 表格兼容：索引色、主题色调、透明色、筛选完整读写与内部定义名
const ExcelJS = require('exceljs')
const JSZip = require('jszip')
const { 读取xlsx, 写入xlsx } = require('./xlsxCodec')
const { 替换工作表筛选Xml, 从Xml读取筛选 } = require('./xlsxFilter')
const { 颜色告警, 筛选降级告警, 告警级别 } = require('./warningLevels')

const 主命名空间 = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const 关系命名空间 = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

/** 用 JSZip 直接构造最小 xlsx，不经 ExcelJS，贴近用户样本的部件结构。 */
async function 构造xlsx({ 样式Xml, 工作表Xml, 定义名Xml = '' }) {
  const 包 = new JSZip()
  包.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>')
  包.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
  包.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${主命名空间}" xmlns:r="${关系命名空间}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>${定义名Xml}</workbook>`)
  包.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
  包.file('xl/styles.xml', 样式Xml ?? `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${主命名空间}"><fonts count="1"><font><sz val="11"/><name val="宋体"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`)
  包.file('xl/worksheets/sheet1.xml', 工作表Xml)
  return 包.generateAsync({ type: 'nodebuffer' })
}

const 文本格 = (地址, 文本, 样式 = 0) => `<c r="${地址}" s="${样式}" t="inlineStr"><is><t>${文本}</t></is></c>`
const 数字格 = (地址, 数值) => `<c r="${地址}"><v>${数值}</v></c>`
const 工作表 = (行Xml, 尾部 = '') => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${主命名空间}" xmlns:r="${关系命名空间}"><sheetData>${行Xml}</sheetData>${尾部}</worksheet>`

// Excel 默认调色板（0-7 为旧版保留色，8-63 为标准 56 色），以 Excel 颜色对话框实测值为准
const Excel调色板 = [
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080',
  '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
  '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF',
  '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696',
  '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333',
]

const 色差 = (左, 右) => Math.max(...[1, 3, 5].map(位 => Math.abs(parseInt(左.slice(位, 位 + 2), 16) - parseInt(右.slice(位, 位 + 2), 16))))

describe('2.7.1 表格颜色兼容', () => {
  it('仅含 indexed=64 黑色细边框的表格不产生任何警告且保留边框', async () => {
    const 样式Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${主命名空间}"><fonts count="1"><font><sz val="11"/><name val="宋体"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color indexed="64"/></left><right style="thin"><color indexed="64"/></right><top style="thin"><color indexed="64"/></top><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/></cellXfs></styleSheet>`
    const 数据 = await 构造xlsx({ 样式Xml, 工作表Xml: 工作表(`<row r="1">${文本格('A1', '姓名', 1)}${文本格('B1', '成绩', 1)}</row>`) })
    const 结果 = await 读取xlsx(数据)
    expect(结果.警告).toEqual([])
    expect(结果.工作表列表[0].元数据.单元格格式.A1.边框).toEqual({ 上: true, 下: true, 左: true, 右: true })
    expect(结果.工作表列表[0].元数据.单元格格式.A1.边框颜色).toBeUndefined()
  })

  it('完整索引调色板填充色值与 Excel 一致', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('索引色')
    for (let 索引 = 0; 索引 < 64; 索引 += 1) {
      const 格 = 表.getCell(索引 + 1, 1)
      格.value = 索引
      格.fill = { type: 'pattern', pattern: 'solid', fgColor: { indexed: 索引 } }
    }
    const 结果 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    expect(结果.警告).toEqual([])
    const 格式 = 结果.工作表列表[0].元数据.单元格格式
    for (let 索引 = 0; 索引 < 64; 索引 += 1) expect(格式[`A${索引 + 1}`].填充颜色).toBe(`#${Excel调色板[索引]}`)
  })

  it('样式表自定义 indexedColors 覆盖默认调色板', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('自定义调色板')
    表.getCell('A1').value = '甲'
    表.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { indexed: 10 } }
    const 包 = await JSZip.loadAsync(await 工作簿.xlsx.writeBuffer())
    const 样式 = await 包.file('xl/styles.xml').async('string')
    const 自定义 = Array.from({ length: 64 }, (_, 索引) => `<rgbColor rgb="FF${索引 === 10 ? '123456' : Excel调色板[索引]}"/>`).join('')
    包.file('xl/styles.xml', 样式.replace('</styleSheet>', `<colors><indexedColors>${自定义}</indexedColors></colors></styleSheet>`))
    const 结果 = await 读取xlsx(await 包.generateAsync({ type: 'nodebuffer' }))
    expect(结果.工作表列表[0].元数据.单元格格式.A1.填充颜色).toBe('#123456')
  })

  it.each([
    [4, 0.7999816888943144, '#DBE5F1'], [4, 0.5999938962981048, '#B8CCE4'], [4, 0.3999755851924192, '#95B3D7'],
    [4, -0.249977111117893, '#366092'], [4, -0.499984740745262, '#244062'],
    [5, 0.7999816888943144, '#F2DCDB'], [9, -0.249977111117893, '#E26B0A'], [9, 0.5999938962981048, '#FCD5B4'],
    [0, -0.0499893185216834, '#F2F2F2'], [0, -0.499984740745262, '#808080'], [1, 0.499984740745262, '#7F7F7F'],
    [1, 0.0499893185216834, '#0D0D0D'], [3, -0.249977111117893, '#17365D'], [2, -0.749992370372631, '#4A452A'],
  ])('主题色 %i 色调 %f 与 Excel 期望值误差不超过 1', async (主题, 色调, 期望) => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('色调')
    表.getCell('A1').value = '颜色'
    表.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { theme: 主题, tint: 色调 } }
    表.getCell('A1').font = { color: { theme: 主题, tint: 色调 } }
    const 结果 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    expect(结果.警告).toEqual([])
    const 格式 = 结果.工作表列表[0].元数据.单元格格式.A1
    expect(色差(格式.填充颜色, 期望)).toBeLessThanOrEqual(1)
    expect(色差(格式.字体颜色, 期望)).toBeLessThanOrEqual(1)
  })

  it('带透明度的 ARGB 忽略透明通道保留 RGB 且不告警（与 Excel 显示一致）', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('透明')
    表.getCell('A1').value = '半透明'
    表.getCell('A1').font = { color: { argb: '80336699' } }
    表.getCell('B1').value = '全透明'
    表.getCell('B1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '00FFCC00' } }
    const 结果 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    expect(结果.警告).toEqual([])
    expect(结果.工作表列表[0].元数据.单元格格式.A1.字体颜色).toBe('#336699')
    expect(结果.工作表列表[0].元数据.单元格格式.B1.填充颜色).toBe('#FFCC00')
  })

  it('自动颜色不告警，也不写入显式颜色', async () => {
    const 样式Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${主命名空间}"><fonts count="2"><font><sz val="11"/><name val="宋体"/></font><font><sz val="11"/><color auto="1"/><name val="宋体"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/></cellXfs></styleSheet>`
    const 结果 = await 读取xlsx(await 构造xlsx({ 样式Xml, 工作表Xml: 工作表(`<row r="1">${文本格('A1', '自动', 1)}</row>`) }))
    expect(结果.警告).toEqual([])
    expect(结果.工作表列表[0].元数据.单元格格式.A1.字体颜色).toBeUndefined()
  })

  it('未知主题索引只给出保真风险级颜色提示，边框颜色无法解析时不提示', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('未知')
    表.getCell('A1').value = '字'
    表.getCell('A1').font = { color: { theme: 99 } }
    表.getCell('B1').value = '框'
    表.getCell('B1').border = { top: { style: 'thin', color: { theme: 99 } } }
    const 结果 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    expect(结果.警告).toEqual([颜色告警])
    expect(告警级别(颜色告警)).toBe('保真风险')
    expect(结果.工作表列表[0].元数据.单元格格式.A1?.字体颜色).toBeUndefined()

    const 仅边框 = new ExcelJS.Workbook()
    const 框表 = 仅边框.addWorksheet('仅边框')
    框表.getCell('A1').value = '框'
    框表.getCell('A1').border = { top: { style: 'thin', color: { theme: 99 } }, left: { style: 'thin', color: { indexed: 200 } } }
    expect((await 读取xlsx(await 仅边框.xlsx.writeBuffer())).警告).toEqual([])
  })

  it('索引色与主题色调导入后保存为显式颜色，重开色值不变', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('往返')
    表.getCell('A1').value = '甲'
    表.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { indexed: 44 } }
    表.getCell('A1').font = { color: { theme: 4, tint: -0.249977111117893 } }
    const 首读 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    const 格式 = 首读.工作表列表[0].元数据.单元格格式.A1
    const 重开 = await 读取xlsx(await 写入xlsx({ 工作表: [{ 名称: '往返', 数据: [[{ 文字: [{ 文本: '甲' }], 格式 }]] }] }))
    expect(重开.工作表列表[0].元数据.单元格格式.A1).toMatchObject({ 填充颜色: '#99CCFF', 字体颜色: 格式.字体颜色 })
    expect(重开.警告).toEqual([])
  })
})

describe('2.7.1 筛选完整读写', () => {
  const 成绩行 = [
    ['姓名', '班级', '成绩'], ['张三', '一班', '95'], ['李四', '二班', '58'], ['王五', '一班', '72'], ['赵六', '', '88'], ['孙七', '三班', '66'],
  ]
  const 成绩表Xml = (尾部) => 工作表(成绩行.map((行, 行号) => `<row r="${行号 + 2}">${行.map((值, 列号) => {
    const 地址 = `${String.fromCharCode(66 + 列号)}${行号 + 2}`
    return 值 === '' ? '' : /^\d+$/.test(值) ? 数字格(地址, 值) : 文本格(地址, 值)
  }).join('')}</row>`).join(''), 尾部)

  const 复合筛选Xml = '<autoFilter ref="$B$2:$D$7"><filterColumn colId="1"><filters blank="1"><filter val="一班"/><filter val="三班"/></filters></filterColumn><filterColumn colId="2"><customFilters and="1"><customFilter operator="greaterThanOrEqual" val="60"/><customFilter operator="lessThan" val="90"/></customFilters></filterColumn><sortState ref="B3:D7"><sortCondition descending="1" ref="D3:D7"/></sortState></autoFilter>'
  const 复合筛选模型 = {
    范围: 'B2:D7',
    列条件: [
      { 列: 2, 值列表: ['一班', '三班'], 空白: true },
      { 列: 3, 自定义: { 且: true, 条件: [{ 运算符: 'greaterThanOrEqual', 值: '60' }, { 运算符: 'lessThan', 值: '90' }] } },
    ],
    排序状态Xml: '<sortState ref="B3:D7"><sortCondition descending="1" ref="D3:D7"/></sortState>',
  }

  it('多列、多值、空白、自定义区间、排序状态与绝对引用范围完整读入且不告警', async () => {
    const 结果 = await 读取xlsx(await 构造xlsx({ 工作表Xml: 成绩表Xml(复合筛选Xml) }))
    expect(结果.工作表列表[0].元数据.筛选).toEqual(复合筛选模型)
    expect(结果.警告).toEqual([])
  })

  it('读入→写出→再读入一致，并按 AND 组合各列条件写回隐藏行', async () => {
    const 首读 = await 读取xlsx(await 构造xlsx({ 工作表Xml: 成绩表Xml(复合筛选Xml) }))
    const 数据 = [[], ...成绩行.map(行 => [''].concat(行))]
    const 写出 = await 写入xlsx({ 工作表: [{ 名称: '成绩', 数据, 筛选: 首读.工作表列表[0].元数据.筛选 }] })
    const 包 = await JSZip.loadAsync(写出)
    const Xml = await 包.file('xl/worksheets/sheet1.xml').async('string')
    expect(Xml).toContain('<sortState ref="B3:D7"><sortCondition descending="1" ref="D3:D7"/></sortState>')
    const 再读 = await 读取xlsx(写出)
    expect(再读.工作表列表[0].元数据.筛选).toEqual(复合筛选模型)
    expect(再读.警告).toEqual([])
    const 工作簿 = new ExcelJS.Workbook()
    await 工作簿.xlsx.load(写出)
    const 隐藏 = [3, 4, 5, 6, 7].filter(行 => 工作簿.worksheets[0].getRow(行).hidden)
    // 张三 95 超出上限、李四 二班且不及格，均隐藏；王五 一班 72、赵六 空白 88、孙七 三班 66 显示
    expect(隐藏).toEqual([3, 4])
  })

  it('通配符形式的开头是、包含与不包含条件按 OR 组合读写', async () => {
    const 筛选Xml = '<autoFilter ref="B2:D7"><filterColumn colId="0"><customFilters><customFilter val="张*"/><customFilter operator="notEqual" val="*五*"/></customFilters></filterColumn></autoFilter>'
    const 结果 = await 读取xlsx(await 构造xlsx({ 工作表Xml: 成绩表Xml(筛选Xml) }))
    const 筛选 = 结果.工作表列表[0].元数据.筛选
    expect(筛选).toEqual({ 范围: 'B2:D7', 列条件: [{ 列: 1, 自定义: { 且: false, 条件: [{ 运算符: 'equal', 值: '张*' }, { 运算符: 'notEqual', 值: '*五*' }] } }] })
    const 再读 = await 读取xlsx(await 写入xlsx({ 工作表: [{ 名称: '通配', 数据: [[], ...成绩行.map(行 => [''].concat(行))], 筛选 }] }))
    expect(再读.工作表列表[0].元数据.筛选).toEqual(筛选)
  })

  it('无法解析的筛选子元素按原始 XML 保留写回，只给出保真风险提示', async () => {
    const 筛选Xml = '<autoFilter ref="B2:D7"><filterColumn colId="2"><top10 val="2" percent="0"/></filterColumn><filterColumn colId="0"><filters><filter val="张三"/></filters></filterColumn></autoFilter>'
    const 结果 = await 读取xlsx(await 构造xlsx({ 工作表Xml: 成绩表Xml(筛选Xml) }))
    const 筛选 = 结果.工作表列表[0].元数据.筛选
    expect(筛选.列条件).toEqual([
      { 列: 1, 值列表: ['张三'] },
      { 列: 3, 原始Xml: '<filterColumn colId="2"><top10 val="2" percent="0"/></filterColumn>' },
    ])
    expect(结果.警告).toEqual([筛选降级告警])
    expect(告警级别(筛选降级告警)).toBe('保真风险')
    const 写出 = await 写入xlsx({ 工作表: [{ 名称: '原样', 数据: [[], ...成绩行.map(行 => [''].concat(行))], 筛选 }] })
    const Xml = await (await JSZip.loadAsync(写出)).file('xl/worksheets/sheet1.xml').async('string')
    expect(Xml).toContain('<filterColumn colId="2"><top10 val="2" percent="0"/></filterColumn>')
    expect((await 读取xlsx(写出)).工作表列表[0].元数据.筛选).toEqual(筛选)
  })

  it('写入时兼容非自闭合 autoFilter，并对含 $ 的值原样写入', () => {
    const 原Xml = 工作表('<row r="1"><c r="A1"/></row>', '<autoFilter ref="A1:B3"><filterColumn colId="0"><filters><filter val="旧"/></filters></filterColumn></autoFilter>')
    const 新Xml = 替换工作表筛选Xml(原Xml, { 范围: 'A1:B3', 列条件: [{ 列: 1, 值列表: ['$&价格', "甲'乙"] }] })
    expect(新Xml).not.toContain('旧')
    expect(从Xml读取筛选(新Xml)).toEqual({ 范围: 'A1:B3', 列条件: [{ 列: 1, 值列表: ['$&价格', "甲'乙"] }] })
  })

  it('旧版 { 列, 值 } 模型仍可写入并按新模型读回', async () => {
    const 读回 = await 读取xlsx(await 写入xlsx({ 工作表: [{ 名称: '旧版', 数据: [['类别'], ['甲'], ['乙']], 筛选: { 列: 0, 值: '甲' } }] }))
    expect(读回.工作表列表[0].元数据.筛选).toEqual({ 范围: 'A1:A3', 列条件: [{ 列: 0, 值列表: ['甲'] }] })
  })

  it('筛选隐藏行能被新条件解释时不报告隐藏行风险，无法解释时仍报告', async () => {
    const 隐藏成绩表 = (隐藏行号) => 成绩表Xml(复合筛选Xml).replace(`<row r="${隐藏行号}">`, `<row r="${隐藏行号}" hidden="1">`)
    expect((await 读取xlsx(await 构造xlsx({ 工作表Xml: 隐藏成绩表(3) }))).警告).toEqual([])
    expect((await 读取xlsx(await 构造xlsx({ 工作表Xml: 隐藏成绩表(5) }))).警告).toContain('隐藏行列或分组状态未导入')
  })
})

describe('2.7.1 内部定义名', () => {
  it('只有 _xlnm 内部名时不报命名区域，打印区域与打印标题读入并写回', async () => {
    const 定义名Xml = '<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Sheet1!$A$1:$C$3</definedName><definedName name="_xlnm.Print_Area" localSheetId="0">Sheet1!$A$1:$C$10</definedName><definedName name="_xlnm.Print_Titles" localSheetId="0">Sheet1!$1:$1</definedName></definedNames>'
    const 结果 = await 读取xlsx(await 构造xlsx({ 工作表Xml: 工作表(`<row r="1">${文本格('A1', '标题')}</row>`), 定义名Xml }))
    expect(结果.警告).toEqual([])
    const 页面 = 结果.工作表列表[0].页面设置
    expect(页面).toMatchObject({ 打印区域: 'A1:C10', 打印标题行: '1:1' })
    const 写出 = await 写入xlsx({ 工作表: [{ 名称: 'Sheet1', 数据: [['标题']], 页面设置: 页面 }] })
    const 工作簿Xml = await (await JSZip.loadAsync(写出)).file('xl/workbook.xml').async('string')
    expect(工作簿Xml).toMatch(/<definedName name="_xlnm\.Print_Area" localSheetId="0">(?:'|&apos;)?Sheet1(?:'|&apos;)?!\$A\$1:\$C\$10<\/definedName>/)
    expect(工作簿Xml).toMatch(/<definedName name="_xlnm\.Print_Titles" localSheetId="0">(?:'|&apos;)?Sheet1(?:'|&apos;)?!\$1:\$1<\/definedName>/)
    expect((await 读取xlsx(写出)).工作表列表[0].页面设置).toMatchObject({ 打印区域: 'A1:C10', 打印标题行: '1:1' })
  })

  it('用户自定义名称仍提示命名区域未导入', async () => {
    const 定义名Xml = '<definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">Sheet1!$A$1:$C$10</definedName><definedName name="税率">Sheet1!$B$1</definedName></definedNames>'
    const 结果 = await 读取xlsx(await 构造xlsx({ 工作表Xml: 工作表(`<row r="1">${文本格('A1', '标题')}</row>`), 定义名Xml }))
    expect(结果.警告).toContain('命名区域未导入')
    expect(告警级别('命名区域未导入')).toBe('内容风险')
  })
})
