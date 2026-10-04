// Excel 编解码器测试
const { 读取xlsx, 写入xlsx } = require('./xlsxCodec')
const ExcelJS = require('exceljs')
const JSZip = require('jszip')

const 一像素png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC'
const 一像素jpeg = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDi6KKK+ZP3E//Z'

function 附加图片说明(字节数) {
  const 原图 = Buffer.from(一像素png, 'base64')
  const 类型 = Buffer.from('tEXt')
  const 内容 = Buffer.alloc(字节数, 65)
  内容.write('Comment', 0, 'ascii')
  内容[7] = 0
  const 长度 = Buffer.alloc(4)
  长度.writeUInt32BE(内容.length)
  const 校验 = Buffer.alloc(4)
  校验.writeUInt32BE(require('jszip/lib/crc32')(Buffer.concat([类型, 内容])) >>> 0)
  return Buffer.concat([原图.subarray(0, -12), 长度, 类型, 内容, 校验, 原图.subarray(-12)])
}

describe('xlsxCodec', () => {
  describe('读取xlsx', () => {
    it('普通默认视图的三张空表不产生导入风险', async () => {
      const workbook = new ExcelJS.Workbook()
      for (const name of ['Sheet1', 'Sheet2', 'Sheet3']) workbook.addWorksheet(name, { views: [{ state: 'normal', activeCell: 'A1' }] })
      const result = await 读取xlsx(await workbook.xlsx.writeBuffer())
      expect(result.工作表列表).toHaveLength(3)
      expect(result.警告).toEqual([])
    })

    it.each([{ state: 'split', xSplit: 20, ySplit: 20 }, { state: 'normal', zoomScale: 80 }, { state: 'normal', showGridLines: false }, { state: 'normal', rightToLeft: true }])('未支持的真实视图设置仍有风险提示：%j', async view => {
      const workbook = new ExcelJS.Workbook()
      workbook.addWorksheet('视图', { views: [view] })
      const result = await 读取xlsx(await workbook.xlsx.writeBuffer())
      expect(result.警告).toContain('部分工作表视图设置未导入')
    })

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
  it('数据验证和无密码工作表保护可写入并读回', async () => {
    const 数据 = await 写入xlsx({ 工作表: [{ 名称: '受控表', 数据: [[
      { 文字: [{ 文本: '待办' }], 数据验证: { 类型: '列表', 选项: ['待办', '完成'], 允许空白: false } },
      { 文字: [{ 文本: '3' }], 数据验证: { 类型: '整数', 最小值: 1, 最大值: 5, 允许空白: true } },
    ]], 保护: true }] })
    const 工作簿 = new ExcelJS.Workbook()
    await 工作簿.xlsx.load(数据)
    const 表 = 工作簿.worksheets[0]
    expect(表.getCell('A1').dataValidation).toMatchObject({ type: 'list', formulae: ['"待办,完成"'] })
    expect(表.getCell('B1').dataValidation).toMatchObject({ type: 'whole', operator: 'between', formulae: [1, 5] })
    expect(表.sheetProtection.sheet).toBe(true)
    const 读回 = await 读取xlsx(数据)
    expect(读回.工作表列表[0].元数据.单元格验证).toMatchObject({
      A1: { 类型: '列表', 选项: ['待办', '完成'], 允许空白: false },
      B1: { 类型: '整数', 最小值: 1, 最大值: 5, 允许空白: true },
    })
    expect(读回.工作表列表[0].元数据.保护).toBe('本机')
    expect(读回.警告).not.toContain('数据验证规则未导入')
    expect(读回.警告).not.toContain('工作表保护设置未导入')
  })

  it('引用区域的数据验证与复杂保护需报告保真风险', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('复杂规则')
    表.getCell('A1').value = '甲'
    表.getCell('A1').dataValidation = { type: 'list', formulae: ['$C$1:$C$3'], allowBlank: true }
    表.sheetProtection = { sheet: true, formatCells: true }
    const 读回 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    expect(读回.警告).toContain('数据验证规则未导入')
    expect(读回.警告).toContain('工作表保护设置未导入')
    expect(读回.工作表列表[0].元数据.保护).toBe('外部')
    expect(读回.工作表列表[0].元数据.单元格验证.A1).toBeUndefined()
  })
  it('连续单元格验证区域读回后覆盖每个单元格', async () => {
    const 数据 = await 写入xlsx({ 工作表: [{ 名称: '区域规则', 数据: [[
      { 文字: [{ 文本: '甲' }], 数据验证: { 类型: '列表', 选项: ['甲', '乙'], 允许空白: true } },
      { 文字: [{ 文本: '乙' }], 数据验证: { 类型: '列表', 选项: ['甲', '乙'], 允许空白: true } },
    ]] }] })
    const 读回 = await 读取xlsx(数据)
    expect(读回.工作表列表[0].元数据.单元格验证).toMatchObject({
      A1: { 类型: '列表', 选项: ['甲', '乙'] },
      B1: { 类型: '列表', 选项: ['甲', '乙'] },
    })
    expect(读回.警告).not.toContain('数据验证规则未导入')
  })
  it('旧式密码保护不能当作可直接解除的本机保护', async () => {
    const 数据 = await 写入xlsx({ 工作表: [{ 名称: '密码保护', 数据: [['内容']], 保护: true }] })
    const 压缩包 = await JSZip.loadAsync(数据)
    const 路径 = 'xl/worksheets/sheet1.xml'
    const 原Xml = await 压缩包.file(路径).async('string')
    压缩包.file(路径, 原Xml.replace('<sheetProtection sheet="1"/>', '<sheetProtection sheet="1" password="ABCD"/>'))
    const 读回 = await 读取xlsx(await 压缩包.generateAsync({ type: 'nodebuffer' }))
    expect(读回.工作表列表[0].元数据.保护).toBe('外部')
    expect(读回.警告).toContain('工作表保护设置未导入')
  })
  it('精确筛选以原生筛选条件和隐藏行保存并读回', async () => {
    const 数据 = await 写入xlsx({ 工作表: [{ 名称: '筛选', 数据: [['类别'], ['甲'], ['乙'], ['甲']], 筛选: { 列: 0, 值: '甲' } }] })
    const 压缩包 = await JSZip.loadAsync(数据)
    const 工作表Xml = await 压缩包.file('xl/worksheets/sheet1.xml').async('string')
    expect(工作表Xml).toContain('<filterColumn colId="0"><filters><filter val="甲"/></filters></filterColumn>')
    const 工作簿 = new ExcelJS.Workbook()
    await 工作簿.xlsx.load(数据)
    expect(工作簿.worksheets[0].autoFilter).toBe('A1:A4')
    expect(工作簿.worksheets[0].getRow(3).hidden).toBe(true)
    expect(工作簿.worksheets[0].getRow(4).hidden).toBe(false)
    const 读回 = await 读取xlsx(数据)
    expect(读回.工作表列表[0].元数据.筛选).toEqual({ 列: 0, 值: '甲' })
    expect(读回.警告).not.toContain('筛选条件未导入')
  })
  it('空白筛选以原生条件保存并读回', async () => {
    const 数据 = await 写入xlsx({ 工作表: [{ 名称: '空白筛选', 数据: [['类别'], [''], ['甲']], 筛选: { 列: 0, 值: '' } }] })
    const 压缩包 = await JSZip.loadAsync(数据)
    const 工作表Xml = await 压缩包.file('xl/worksheets/sheet1.xml').async('string')
    expect(工作表Xml).toContain('<filters blank="1"/>')
    const 读回 = await 读取xlsx(数据)
    expect(读回.工作表列表[0].元数据.筛选).toEqual({ 列: 0, 值: '' })
    expect(读回.警告).not.toContain('筛选条件未导入')
  })
  it('包含空白和指定值的复合筛选不会被误读为单一空白条件', async () => {
    const 数据 = await 写入xlsx({ 工作表: [{ 名称: '复合筛选', 数据: [['类别'], [''], ['甲']], 筛选: { 列: 0, 值: '' } }] })
    const 压缩包 = await JSZip.loadAsync(数据)
    const 路径 = 'xl/worksheets/sheet1.xml'
    const 原Xml = await 压缩包.file(路径).async('string')
    压缩包.file(路径, 原Xml.replace('<filters blank="1"/>', '<filters blank="1"><filter val="甲"/></filters>'))
    const 读回 = await 读取xlsx(await 压缩包.generateAsync({ type: 'nodebuffer' }))
    expect(读回.工作表列表[0].元数据.筛选).toBeUndefined()
    expect(读回.警告).toContain('筛选条件未导入')
  })
  it('基础格式、合并、行列尺寸与冻结可写入并读回', async () => {
    const 数据 = await 写入xlsx({ 工作表: [{
      名称: '保真', 数据: [[{ 文字: [{ 文本: '标题' }], 格式: { 加粗: true, 字体颜色: '#336699', 填充颜色: '#FFF3B0', 水平对齐: 'center', 边框: { 下: true } } }, ''], ['甲', '1']],
      合并区域: ['A1:B1'], 列宽: [120, 88], 行高: [32, 24], 冻结: { 行: 1, 列: 0 },
    }] })
    const 工作簿 = new ExcelJS.Workbook()
    await 工作簿.xlsx.load(数据)
    const 表 = 工作簿.worksheets[0]
    expect(表.getCell('A1').font.bold).toBe(true)
    expect(表.getCell('A1').font.color.argb).toBe('FF336699')
    expect(表.getCell('A1').fill.fgColor.argb).toBe('FFFFF3B0')
    expect(表.getCell('A1').alignment.horizontal).toBe('center')
    expect(表.model.merges).toContain('A1:B1')
    expect(表.getColumn(1).width).toBeCloseTo(120 / 7, 0)
    expect(表.getRow(1).height).toBeCloseTo(24, 0)
    expect(表.views[0]).toMatchObject({ state: 'frozen', ySplit: 1, xSplit: 0 })
    const 读回 = await 读取xlsx(数据)
    expect(读回.工作表列表[0].元数据).toMatchObject({
      单元格格式: { A1: { 加粗: true, 字体颜色: '#336699', 填充颜色: '#FFF3B0', 水平对齐: 'center', 边框: { 下: true } } },
      合并区域: ['A1:B1'], 冻结: { 行: 1, 列: 0 },
    })
    expect(读回.工作表列表[0].元数据.列宽[0]).toBeCloseTo(120, 0)
    expect(读回.工作表列表[0].元数据.行高[0]).toBeCloseTo(32, 0)
    expect(读回.警告).not.toContain('单元格样式或数字格式未导入')
  })
  it('纸张方向、大小和页边距可写入并读回', async () => {
    const 数据 = await 写入xlsx({ 工作表: [{ 名称: '页面', 数据: [['内容']], 页面设置: { 方向: '横向', 纸张大小: 'A5', 页边距: '窄' } }] })
    const 工作簿 = new ExcelJS.Workbook()
    await 工作簿.xlsx.load(数据)
    const 设置 = 工作簿.worksheets[0].pageSetup
    expect(设置.orientation).toBe('landscape')
    expect(设置.paperSize).toBe(11)
    expect(设置.margins.left).toBe(0.25)
    const 读回 = await 读取xlsx(数据)
    expect(读回.工作表列表[0].页面设置).toEqual({ 方向: '横向', 纸张大小: 'A5', 页边距: '窄' })
  })
  it('只有普通数值和文本时不产生保真警告', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('普通表')
    表.getCell('A1').value = 42
    表.getCell('B1').value = '文字'
    const 结果 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    expect(结果.警告).toEqual([])
  })

  it('受支持的单元格字体样式读取后保留且不误报风险', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('格式表')
    表.getCell('A1').value = 42
    表.getCell('A1').font = { bold: true, color: { argb: 'FF336699' } }
    const 结果 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    expect(结果.工作表列表[0].元数据.单元格格式.A1).toMatchObject({ 加粗: true, 字体颜色: '#336699' })
    expect(结果.警告).toEqual([])
  })

  it('本程序创建的带边框和数值表格保存重开不误报默认主题颜色', async () => {
    const 数据 = await 写入xlsx({ 工作表: [{ 名称: '桌面表格', 数据: [
      [{ 文字: [{ 文本: '正文' }], 格式: { 边框: { 上: true, 下: true, 左: true, 右: true } } }, { 文字: [{ 文本: '1' }] }],
      [{ 文字: [{ 文本: '合计' }], 格式: { 水平对齐: 'center' } }, { 文字: [{ 文本: '2' }] }],
    ] }] })
    const 重开 = await 读取xlsx(数据)
    expect(重开.警告).toEqual([])
    expect(重开.工作表列表[0].元数据.单元格格式.A1.边框).toEqual({ 上: true, 下: true, 左: true, 右: true })
    expect(重开.html).toContain('正文')
  })

  it('文本型数字保留原始类型与前导零', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('编号')
    表.getCell('A1').value = '00123'
    const 读取 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    expect(读取.工作表列表[0].html).toContain('data-value-type="text"')
    expect(读取.警告).not.toContain('文本型数字保存后可能转为数值')
    const 保存 = await 写入xlsx({ 工作表: [{ 名称: '编号', 数据: [[{ 文字: [{ 文本: '00123' }], 类型: '文本' }]] }] })
    const 验证簿 = new ExcelJS.Workbook()
    await 验证簿.xlsx.load(保存)
    expect(验证簿.worksheets[0].getCell('A1').value).toBe('00123')
  })

  it('主题颜色按文件实际主题导入，自定义数字格式仍给出具体警告', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('高级格式')
    表.getCell('A1').value = 1234
    表.getCell('A1').font = { color: { theme: 2 } }
    表.getCell('A1').numFmt = '000000'
    const 结果 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    expect(结果.工作表列表[0].元数据.单元格格式.A1.字体颜色).toBe('#EEECE1')
    expect(结果.警告).not.toContain('部分主题色或透明颜色未导入')
    expect(结果.警告).toContain('部分数字格式未导入')
  })

  it('自定义主题色从文件解析并可保存为相同的显式颜色', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('自定义主题')
    表.getCell('A1').value = '主题文字'
    表.getCell('A1').font = { color: { theme: 2 } }
    表.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { theme: 4 } }
    const 压缩包 = await JSZip.loadAsync(await 工作簿.xlsx.writeBuffer())
    const 主题 = await 压缩包.file('xl/theme/theme1.xml').async('string')
    压缩包.file('xl/theme/theme1.xml', 主题.replace('EEECE1', '123456').replace('4F81BD', 'ABCDEF'))
    const 读取 = await 读取xlsx(await 压缩包.generateAsync({ type: 'nodebuffer' }))
    const 格式 = 读取.工作表列表[0].元数据.单元格格式.A1
    expect(格式).toMatchObject({ 字体颜色: '#123456', 填充颜色: '#ABCDEF' })
    expect(读取.警告).toEqual([])
    const 重开 = await 读取xlsx(await 写入xlsx({ 工作表: [{ 名称: '主题副本', 数据: [[{ 文字: [{ 文本: '主题文字' }], 格式 }]] }] }))
    expect(重开.工作表列表[0].元数据.单元格格式.A1).toMatchObject({ 字体颜色: '#123456', 填充颜色: '#ABCDEF' })
    expect(重开.警告).toEqual([])
  })

  it('未知主题索引、透明色与尚未支持的主题色调仍提示保真风险', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('未覆盖颜色')
    for (const [地址, 颜色] of [['A1', { theme: 99 }], ['B1', { argb: '00336699' }], ['C1', { theme: 4, tint: 0.5 }]]) {
      表.getCell(地址).value = '颜色'
      表.getCell(地址).font = { color: 颜色 }
    }
    const 读取 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    expect(读取.警告).toContain('部分主题色或透明颜色未导入')
    for (const 地址 of ['A1', 'B1', 'C1']) expect(读取.工作表列表[0].元数据.单元格格式[地址]?.字体颜色).toBeUndefined()
  })

  it('显式彩色边框无法保留时提示保真风险', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('彩色边框')
    表.getCell('A1').value = '标题'
    表.getCell('A1').border = { top: { style: 'thin', color: { argb: 'FFFF0000' } } }
    const 读回 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    expect(读回.警告).toContain('部分边框样式未导入')
  })

  it('读取包含图表部件的文件时报告图表丢失风险', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    工作簿.addWorksheet('图表数据').getCell('A1').value = 1
    const 压缩包 = await JSZip.loadAsync(await 工作簿.xlsx.writeBuffer())
    压缩包.file('xl/charts/chart1.xml', '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"/>')
    const 结果 = await 读取xlsx(await 压缩包.generateAsync({ type: 'nodebuffer' }))
    expect(结果.警告.join('；')).toMatch(/图表/)
  })

  it('合并区域可导入，超链接仍给出保真警告', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('链接表')
    表.mergeCells('A1:B1')
    表.getCell('A1').value = { text: '主页', hyperlink: 'https://example.com' }
    const 结果 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    expect(结果.工作表列表[0].元数据.合并区域).toContain('A1:B1')
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

  it('单元格批注写入后可读回，读取时不再报告批注丢失', async () => {
    const 数据 = await 写入xlsx({ 工作表: [{ 名称: '批注', 数据: [[{ 文字: [{ 文本: '金额' }], 批注: '请核对金额' }]] }] })
    const 工作簿 = new ExcelJS.Workbook()
    await 工作簿.xlsx.load(数据)
    expect(工作簿.worksheets[0].getCell('A1').note).toBe('请核对金额')
    const 读回 = await 读取xlsx(数据)
    expect(读回.工作表列表[0].html).toContain('data-comment="请核对金额"')
    expect(读回.警告).not.toContain('批注未导入')
  })

  it('空白单元格的批注及属性中的特殊字符可以往返', async () => {
    const 批注 = '甲"乙&丙<丁>'
    const 数据 = await 写入xlsx({ 工作表: [{ 名称: '空白批注', 数据: [[{ 文字: [{ 文本: '' }], 批注 }]] }] })
    const 读回 = await 读取xlsx(数据)
    expect(读回.工作表列表[0].html).toContain('data-comment="甲&quot;乙&amp;丙&lt;丁&gt;"')
    expect(读回.警告).not.toContain('批注未导入')
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

describe('xlsxCodec：工作表图片往返', () => {
  it('读取多个工作表的 PNG 和 JPEG 图片及位置尺寸，不误报媒体丢失', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 首页 = 工作簿.addWorksheet('首页')
    const 次页 = 工作簿.addWorksheet('次页')
    const png编号 = 工作簿.addImage({ buffer: Buffer.from(一像素png, 'base64'), extension: 'png' })
    const jpeg编号 = 工作簿.addImage({ buffer: Buffer.from(一像素jpeg, 'base64'), extension: 'jpeg' })
    首页.addImage(png编号, { tl: { col: 2, row: 3 }, ext: { width: 120, height: 80 } })
    次页.addImage(jpeg编号, { tl: { col: 1, row: 0 }, ext: { width: 96, height: 64 } })
    const 读取 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    expect(读取.工作表列表[0].元数据.图片).toEqual([{ 格式: 'png', 数据: 一像素png, 行: 3, 列: 2, 宽: 120, 高: 80 }])
    expect(读取.工作表列表[1].元数据.图片).toEqual([{ 格式: 'jpeg', 数据: 一像素jpeg, 行: 0, 列: 1, 宽: 96, 高: 64 }])
    expect(读取.警告).not.toContain('图片或媒体未导入')
    expect(读取.警告).not.toContain('绘图对象未导入')
  })

  it('按每张工作表写入图片并经表格库及本编解码器读回', async () => {
    const 模型 = { 工作表: [
      { 名称: '图一', 数据: [['甲']], 图片: [{ id: '本地图片', 格式: 'png', 数据: 一像素png, 行: 1, 列: 2, 宽: 128, 高: 96 }] },
      { 名称: '图二', 数据: [['乙']], 图片: [{ 格式: 'jpeg', 数据: 一像素jpeg, 行: 4, 列: 1, 宽: 240, 高: 180 }] },
    ] }
    const 数据 = await 写入xlsx(模型)
    const 工作簿 = new ExcelJS.Workbook()
    await 工作簿.xlsx.load(数据)
    expect(工作簿.worksheets.map((表) => 表.getImages().length)).toEqual([1, 1])
    expect(工作簿.getImage(工作簿.worksheets[0].getImages()[0].imageId).buffer).toEqual(Buffer.from(一像素png, 'base64'))
    expect(工作簿.getImage(工作簿.worksheets[1].getImages()[0].imageId).buffer).toEqual(Buffer.from(一像素jpeg, 'base64'))
    const 读回 = await 读取xlsx(数据)
    expect(读回.工作表列表[0].元数据.图片).toEqual([{ 格式: 'png', 数据: 一像素png, 行: 1, 列: 2, 宽: 128, 高: 96 }])
    expect(读回.工作表列表[1].元数据.图片).toEqual([{ 格式: 'jpeg', 数据: 一像素jpeg, 行: 4, 列: 1, 宽: 240, 高: 180 }])
    expect(读回.警告).not.toContain('图片或媒体未导入')
    expect(读回.警告).not.toContain('绘图对象未导入')
  })

  it('普通双锚点图片读入为像素尺寸', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('图片')
    const 图片编号 = 工作簿.addImage({ buffer: Buffer.from(一像素png, 'base64'), extension: 'png' })
    表.addImage(图片编号, 'A1:C4')
    const 读回 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    expect(读回.工作表列表[0].元数据.图片[0]).toMatchObject({ 格式: 'png', 行: 0, 列: 0 })
    expect(读回.工作表列表[0].元数据.图片[0].宽).toBeGreaterThan(0)
    expect(读回.工作表列表[0].元数据.图片[0].高).toBeGreaterThan(0)
    expect(读回.警告).not.toContain('图片或媒体未导入')
    expect(读回.警告).not.toContain('绘图对象未导入')
  })

  it('图片旁有未支持的绘图对象时保留绘图警告', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('混合绘图')
    const 图片编号 = 工作簿.addImage({ buffer: Buffer.from(一像素png, 'base64'), extension: 'png' })
    表.addImage(图片编号, { tl: { col: 0, row: 0 }, ext: { width: 32, height: 24 } })
    const 压缩包 = await JSZip.loadAsync(await 工作簿.xlsx.writeBuffer())
    const 路径 = 'xl/drawings/drawing1.xml'
    const 原Xml = await 压缩包.file(路径).async('string')
    压缩包.file(路径, 原Xml.replace('</xdr:wsDr>', '<xdr:sp/></xdr:wsDr>'))
    const 读回 = await 读取xlsx(await 压缩包.generateAsync({ type: 'nodebuffer' }))
    expect(读回.工作表列表[0].元数据.图片).toHaveLength(1)
    expect(读回.警告).toContain('绘图对象未导入')
  })

  it('图片超链接不会被误判为完整导入', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('链接图片')
    const 图片编号 = 工作簿.addImage({ buffer: Buffer.from(一像素png, 'base64'), extension: 'png' })
    表.addImage(图片编号, { tl: { col: 0, row: 0 }, ext: { width: 32, height: 24 }, hyperlinks: { hyperlink: 'https://example.com', tooltip: '查看来源' } })
    const 读回 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    expect(读回.工作表列表[0].元数据.图片).toHaveLength(1)
    expect(读回.警告).toContain('绘图对象未导入')
  })

  it('图片锚点移动规则未写回时保留绘图警告', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('复杂锚点')
    const 图片编号 = 工作簿.addImage({ buffer: Buffer.from(一像素png, 'base64'), extension: 'png' })
    表.addImage(图片编号, { tl: { col: 0, row: 1 }, br: { col: 2, row: 4 }, editAs: 'twoCell' })
    const 读回 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    expect(读回.工作表列表[0].元数据.图片).toHaveLength(1)
    expect(读回.警告).toContain('绘图对象未导入')
  })

  it('双锚点末端的非整数偏移未写回时保留绘图警告', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('偏移锚点')
    const 图片编号 = 工作簿.addImage({ buffer: Buffer.from(一像素png, 'base64'), extension: 'png' })
    表.addImage(图片编号, { tl: { col: 0, row: 1 }, br: { col: 2.5, row: 4.25 }, editAs: 'oneCell' })
    const 读回 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    expect(读回.工作表列表[0].元数据.图片).toHaveLength(1)
    expect(读回.警告).toContain('绘图对象未导入')
  })

  it('媒体名称缺失时仍可凭原始数据识别已导入图片', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('媒体名称')
    const 图片编号 = 工作簿.addImage({ buffer: Buffer.from(一像素png, 'base64'), extension: 'png' })
    表.addImage(图片编号, { tl: { col: 0, row: 0 }, ext: { width: 32, height: 24 } })
    const 原方法 = ExcelJS.Workbook.prototype.getImage
    const 替身 = vi.spyOn(ExcelJS.Workbook.prototype, 'getImage').mockImplementation(function (编号) {
      return { ...原方法.call(this, 编号), name: undefined }
    })
    try {
      const 读回 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
      expect(读回.工作表列表[0].元数据.图片).toHaveLength(1)
      expect(读回.警告).not.toContain('图片或媒体未导入')
    } finally {
      替身.mockRestore()
    }
  })

  it('图片旋转和裁剪未写回时保留绘图警告', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('图片效果')
    const 图片编号 = 工作簿.addImage({ buffer: Buffer.from(一像素png, 'base64'), extension: 'png' })
    表.addImage(图片编号, { tl: { col: 0, row: 0 }, ext: { width: 32, height: 24 } })
    const 压缩包 = await JSZip.loadAsync(await 工作簿.xlsx.writeBuffer())
    const 路径 = 'xl/drawings/drawing1.xml'
    const 原Xml = await 压缩包.file(路径).async('string')
    压缩包.file(路径, 原Xml.replace('<a:xfrm>', '<a:xfrm rot="5400000">').replace('<a:stretch>', '<a:srcRect l="10000"/><a:stretch>'))
    const 读回 = await 读取xlsx(await 压缩包.generateAsync({ type: 'nodebuffer' }))
    expect(读回.工作表列表[0].元数据.图片).toHaveLength(1)
    expect(读回.警告).toContain('绘图对象未导入')
  })

  it('未支持的 GIF 图片保留媒体及绘图警告', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('其他格式')
    const 图片编号 = 工作簿.addImage({ buffer: Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=', 'base64'), extension: 'gif' })
    表.addImage(图片编号, { tl: { col: 0, row: 0 }, ext: { width: 32, height: 24 } })
    const 读回 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    expect(读回.工作表列表[0].元数据.图片).toEqual([])
    expect(读回.警告).toContain('图片或媒体未导入')
    expect(读回.警告).toContain('绘图对象未导入')
  })

  it('拒绝无效或与声明格式不符的图片数据', async () => {
    const 图片 = { 格式: 'png', 数据: '@@@@', 行: 0, 列: 0, 宽: 20, 高: 20 }
    await expect(写入xlsx({ 工作表: [{ 名称: '无效', 数据: [], 图片: [图片] }] })).rejects.toThrow(/图片/)
    await expect(写入xlsx({ 工作表: [{ 名称: '格式不符', 数据: [], 图片: [{ ...图片, 数据: 一像素jpeg }] }] })).rejects.toThrow(/图片/)
    await expect(写入xlsx({ 工作表: [{ 名称: '不支持', 数据: [], 图片: [{ ...图片, 格式: 'gif', 数据: 一像素png }] }] })).rejects.toThrow(/图片/)
  })

  it('拒绝只有文件标记、缺少图像内容的伪图片', async () => {
    const 图片 = { 格式: 'jpeg', 数据: Buffer.from('ffd8ff00ffd9', 'hex').toString('base64'), 行: 0, 列: 0, 宽: 20, 高: 20 }
    await expect(写入xlsx({ 工作表: [{ 名称: '伪图片', 数据: [], 图片: [图片] }] })).rejects.toThrow(/图片格式或数据无效/)
  })

  it('拒绝无效位置与尺寸', async () => {
    const 图片 = { 格式: 'png', 数据: 一像素png, 行: 0, 列: 0, 宽: 20, 高: 20 }
    await expect(写入xlsx({ 工作表: [{ 名称: '无效', 数据: [], 图片: [{ ...图片, 行: -1 }] }] })).rejects.toThrow(/图片/)
    await expect(写入xlsx({ 工作表: [{ 名称: '无效', 数据: [], 图片: [{ ...图片, 行: 500 }] }] })).rejects.toThrow(/图片/)
    await expect(写入xlsx({ 工作表: [{ 名称: '无效', 数据: [], 图片: [{ ...图片, 列: 50 }] }] })).rejects.toThrow(/图片/)
    await expect(写入xlsx({ 工作表: [{ 名称: '无效', 数据: [], 图片: [{ ...图片, 高: 4097 }] }] })).rejects.toThrow(/图片/)
  })

  it('外部图片锚点超出表格展示范围时明确提示保真风险', async () => {
    const 工作簿 = new ExcelJS.Workbook()
    const 表 = 工作簿.addWorksheet('远处图片')
    const 图片编号 = 工作簿.addImage({ buffer: Buffer.from(一像素png, 'base64'), extension: 'png' })
    表.addImage(图片编号, { tl: { col: 0, row: 500 }, ext: { width: 32, height: 24 } })
    const 读回 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    expect(读回.工作表列表[0].元数据.图片).toEqual([])
    expect(读回.警告).toContain('图片或媒体未导入')
    expect(读回.警告).toContain('绘图对象未导入')
  })

  it('拒绝单张超过五兆字节及整簿超过二十兆字节', async () => {
    const 大图片 = 附加图片说明(5 * 1024 * 1024)
    const 图片 = { 格式: 'png', 数据: 大图片.toString('base64'), 行: 0, 列: 0, 宽: 20, 高: 20 }
    await expect(写入xlsx({ 工作表: [{ 名称: '超量', 数据: [], 图片: [图片] }] })).rejects.toThrow(/单张图片超过五兆字节/)
    const 分片 = 附加图片说明(4 * 1024 * 1024 + 300000)
    const 五张 = Array.from({ length: 5 }, (_, 列) => ({ ...图片, 数据: 分片.toString('base64'), 列 }))
    await expect(写入xlsx({ 工作表: [{ 名称: '累计超量', 数据: [], 图片: 五张 }] })).rejects.toThrow(/工作簿图片超过二十兆字节/)
  })
})
