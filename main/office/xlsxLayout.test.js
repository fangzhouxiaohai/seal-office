const ExcelJS = require('exceljs')
const { 读取xlsx, 写入xlsx } = require('./xlsxCodec')

async function 创建整列布局样本() {
  const 工作簿 = new ExcelJS.Workbook()
  const 表 = 工作簿.addWorksheet('布局回归', { views: [{ state: 'normal', zoomScale: 70, zoomScaleNormal: 70 }] })
  表.properties.defaultRowHeight = 15.6
  表.properties.defaultColWidth = 9
  for (let 列 = 1; 列 <= 16384; 列++) {
    表.getColumn(列).width = 9
    表.getColumn(列).font = { name: '宋体', size: 12 }
  }
  表.getColumn(2).width = 20
  表.getCell('A1').value = '合成布局回归'
  表.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true }
  表.mergeCells('A1:C1')
  表.getCell('R39').value = 123
  return 工作簿.xlsx.writeBuffer()
}

describe('标准工作簿布局', () => {
  it('合并区域的各边框写回时不被主格样式覆盖', async () => {
    const 字节 = await 写入xlsx({ 工作表: [{ 名称: '合并外缘', 数据: [[
      { 文字: [{ 文本: '标题' }], 格式: { 边框: { 上: true, 左: true } } },
      { 文字: [{ 文本: '' }], 格式: { 边框: { 上: true, 右: true } } },
    ], [
      { 文字: [{ 文本: '' }], 格式: { 边框: { 下: true, 左: true } } },
      { 文字: [{ 文本: '' }], 格式: { 边框: { 下: true, 右: true } } },
    ]], 合并区域: ['A1:B2'] }] })
    const 工作簿 = new ExcelJS.Workbook()
    await 工作簿.xlsx.load(字节)
    expect(工作簿.worksheets[0].getCell('B2').border).toEqual({ bottom: { style: 'thin' }, right: { style: 'thin' } })
  })

  it('小数行高和列宽不在导入时取整', async () => {
    const 工作簿 = new ExcelJS.Workbook(), 表 = 工作簿.addWorksheet('小数尺寸')
    表.getCell('A1').value = '尺寸'
    表.getColumn(1).width = 15.5555555555556
    表.getRow(1).height = 37
    const 读回 = await 读取xlsx(await 工作簿.xlsx.writeBuffer())
    expect(读回.工作表列表[0].元数据.列宽[0]).toBeCloseTo(15.5555555555556 * 7, 8)
    expect(读回.工作表列表[0].元数据.行高[0]).toBeCloseTo(37 * 4 / 3, 8)
  })

  it('整列默认格式用区间保留，不展开为一万多项编辑列宽', async () => {
    const 结果 = await 读取xlsx(await 创建整列布局样本())
    const 元数据 = 结果.工作表列表[0].元数据
    expect(Object.keys(元数据.列宽).length).toBeLessThanOrEqual(18)
    expect(元数据.列布局).toEqual(expect.arrayContaining([
      expect.objectContaining({ 起列: 2, 止列: 16383, 宽度: 63, 格式: expect.objectContaining({ 字体: '宋体', 字号: 12 }) }),
    ]))
    expect(元数据.默认行高).toBeCloseTo(20.8)
    expect(元数据.默认列宽).toBe(63)
  })

  it('标准缩放和缩小字体填充可直接导入，不产生虚假的保真阻断', async () => {
    const 结果 = await 读取xlsx(await 创建整列布局样本())
    expect(结果.警告).toEqual([])
    expect(结果.工作表列表[0].元数据.视图).toEqual({ 缩放: 70, 普通缩放: 70, 显示网格线: true })
    expect(结果.工作表列表[0].元数据.单元格格式.A1.缩小字体填充).toBe(true)
  })

  it('旧版大范围表的空白占位不写成百万级空单元格', async () => {
    const 行数 = 44, 列数 = 16384
    const 数据 = Array.from({ length: 行数 }, () => new Array(列数).fill(''))
    数据[0][0] = '标题'
    数据[38][16383] = '远端内容'
    const 字节 = await 写入xlsx({ 工作表: [{ 名称: '旧范围', 数据 }] })
    expect(字节.length).toBeLessThan(50000)
    const 工作簿 = new ExcelJS.Workbook()
    await 工作簿.xlsx.load(字节)
    let 实际单元格 = 0
    工作簿.worksheets[0].eachRow((行) => 行.eachCell(() => { 实际单元格++ }))
    expect(实际单元格).toBe(2)
    const 读回 = await 读取xlsx(字节)
    const 表 = 读回.工作表列表[0]
    expect(表.元数据.单元格格式.A1).toBeUndefined()
    expect(表.html).toContain('标题')
    expect(表.html).toContain('远端内容')
  })

  it('区间列格式、缩放及缩小字体可以写回标准文件并由独立解析器核对', async () => {
    const 字节 = await 写入xlsx({ 工作表: [{ 名称: '回写', 数据: [[{ 文字: [{ 文本: '长文本' }], 格式: { 缩小字体填充: true } }]],
      列布局: [{ 起列: 0, 止列: 16383, 宽度: 63, 格式: { 字体: '宋体', 字号: 12 } }],
      默认列宽: 63, 默认行高: 20.8, 视图: { 缩放: 70, 普通缩放: 70, 显示网格线: false },
      列宽: [140], 冻结: { 行: 1, 列: 1 },
    }] })
    const 工作簿 = new ExcelJS.Workbook()
    await 工作簿.xlsx.load(字节)
    const 表 = 工作簿.worksheets[0]
    expect(表.getColumn(16384).width).toBe(9)
    expect(表.getColumn(16384).font).toMatchObject({ name: '宋体', size: 12 })
    expect(表.getColumn(1).width).toBe(20)
    expect(表.getCell('A1').alignment.shrinkToFit).toBe(true)
    expect(表.views[0]).toMatchObject({ state: 'frozen', xSplit: 1, ySplit: 1, zoomScale: 70, showGridLines: false })
    expect(表.properties.defaultRowHeight).toBeCloseTo(15.6)
  })
})
