// 保存后回读校验：正常文件零差异，注入偏差能检出具体表、单元格与项目
const JSZip = require('jszip')
const { 写入xlsx } = require('./xlsxCodec')
const { 校验xlsx回读, 格式化差异 } = require('./xlsxVerify')

const 成绩模型 = () => ({ 工作表: [{
  名称: '成绩',
  数据: [
    [{ 文字: [{ 文本: '姓名' }], 格式: { 加粗: true, 填充颜色: '#DBE5F1' } }, '班级', '成绩', ''],
    ['张三', '一班', '95', { 公式: 'C2*2', 结果: 190 }],
    ['李四', '二班', '58', { 公式: 'xlookup(A3,A2:A3,C2:C3)', 结果: 58 }],
    [{ 文字: [{ 文本: '00123' }], 类型: '文本', 格式: { 字体颜色: '#C0504D' } }, '一班', '72', { 值: true }],
  ],
  合并区域: ['A5:B5'],
  列宽: [120, 88, 64],
  行高: [32, 24],
  筛选: { 范围: 'A1:C4', 列条件: [{ 列: 1, 值列表: ['一班'] }] },
  页面设置: { 页边距: '常规', 方向: '纵向', 纸张大小: 'A4', 打印区域: 'A1:C4', 打印标题行: '1:1' },
}, { 名称: '空白页', 数据: [] }] })

async function 改写部件(数据, 路径, 改写) {
  const 包 = await JSZip.loadAsync(数据)
  包.file(路径, 改写(await 包.file(路径).async('string')))
  return 包.generateAsync({ type: 'nodebuffer' })
}

describe('校验xlsx回读', () => {
  it('正常保存的文件回读后零差异', async () => {
    const 模型 = 成绩模型()
    const 结果 = await 校验xlsx回读(await 写入xlsx(模型), 模型)
    expect(结果.失败).toEqual([])
    expect(结果.警告).toEqual([])
    expect(结果.一致).toBe(true)
    expect(结果.已抽样).toBe(false)
  })

  it('旧版单表契约 { 行 } 与旧版筛选模型同样零差异', async () => {
    const 模型 = { 工作表: [{ 名称: '旧版', 数据: [['类别'], ['甲'], ['乙']], 筛选: { 列: 0, 值: '甲' } }] }
    expect((await 校验xlsx回读(await 写入xlsx(模型), 模型)).一致).toBe(true)
    const 行模型 = { 行: [['甲', '1'], ['乙', '2.50']] }
    expect((await 校验xlsx回读(await 写入xlsx(行模型), 行模型)).一致).toBe(true)
  })

  it('注入错误筛选值时检出筛选条件失败', async () => {
    const 模型 = 成绩模型()
    const 数据 = await 改写部件(await 写入xlsx(模型), 'xl/worksheets/sheet1.xml', (xml) => xml.replace('<filter val="一班"/>', '<filter val="二班"/>'))
    const 结果 = await 校验xlsx回读(数据, 模型)
    expect(结果.一致).toBe(false)
    expect(结果.失败).toEqual(expect.arrayContaining([expect.objectContaining({ 表: '成绩', 项目: '筛选条件' })]))
  })

  it('注入单元格文本、公式与颜色偏差时逐格检出', async () => {
    const 模型 = 成绩模型()
    let 数据 = await 写入xlsx(模型)
    数据 = await 改写部件(数据, 'xl/sharedStrings.xml', (xml) => xml.replace('<t>李四</t>', '<t>李五</t>'))
    数据 = await 改写部件(数据, 'xl/worksheets/sheet1.xml', (xml) => xml.replace('<f>C2*2</f>', '<f>C2*3</f>'))
    数据 = await 改写部件(数据, 'xl/styles.xml', (xml) => xml.replace('FFC0504D', 'FF000000'))
    const 结果 = await 校验xlsx回读(数据, 模型)
    const 摘要 = 结果.失败.map((项) => `${项.表} ${项.位置} ${项.项目}`)
    expect(摘要).toEqual(expect.arrayContaining(['成绩 A3 单元格内容', '成绩 D2 公式', '成绩 A4 字体颜色']))
    expect(格式化差异(结果.失败.find((项) => 项.位置 === 'A3'))).toBe('工作表“成绩” A3：单元格内容不一致（期望：李四；实际：李五）')
  })

  it('合并区域缺失为失败，列宽与打印区域偏差为警告', async () => {
    const 模型 = 成绩模型()
    let 数据 = await 写入xlsx(模型)
    数据 = await 改写部件(数据, 'xl/worksheets/sheet1.xml', (xml) => xml.replace(/<mergeCells\b[\s\S]*?<\/mergeCells>/, '').replace(/(<col min="1" max="1" width=")[\d.]+/, '$130'))
    数据 = await 改写部件(数据, 'xl/workbook.xml', (xml) => xml.replace('$C$4', '$C$9'))
    const 结果 = await 校验xlsx回读(数据, 模型)
    expect(结果.失败.map((项) => 项.项目)).toContain('合并区域')
    expect(结果.警告.map((项) => 项.项目)).toEqual(expect.arrayContaining(['列宽', '打印区域']))
  })

  it('超过一万行时抽样校验并如实标注', async () => {
    const 数据 = Array.from({ length: 10050 }, (_, 行) => [`第${行}行`, String(行)])
    const 模型 = { 工作表: [{ 名称: '大表', 数据 }] }
    const 结果 = await 校验xlsx回读(await 写入xlsx(模型), 模型)
    expect(结果.已抽样).toBe(true)
    expect(结果.一致).toBe(true)
  })
})
