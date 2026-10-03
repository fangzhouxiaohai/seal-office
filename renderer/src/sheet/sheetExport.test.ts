import { describe, it, expect } from 'vitest'
import { 导出为Csv, 导出为Html表格, 导出为Xlsx, 生成表格文件名, 转义Csv字段 } from './sheetExport'
import { 创建工作表, 写入单元格, 设置批注, 设置格式, 设置列宽, 设置行高, 切换合并, 设置数据验证 } from './model'
import { 从Html表格构建工作表 } from './sheetImport'

const 构造表 = () => {
  let 表 = 创建工作表('测试表')
  表 = 写入单元格(表, 'A1', '姓名')
  表 = 写入单元格(表, 'B1', '金额')
  表 = 写入单元格(表, 'A2', '张三')
  表 = 写入单元格(表, 'B2', '1200')
  表 = 写入单元格(表, 'A3', '李四')
  表 = 写入单元格(表, 'B3', '=B2*2')
  return 表
}

describe('CSV 字段转义', () => {
  it('普通文本原样输出', () => {
    expect(转义Csv字段('普通文本')).toBe('普通文本')
  })

  it('含逗号的字段加引号', () => {
    expect(转义Csv字段('甲,乙')).toBe('"甲,乙"')
  })

  it('含引号的字段内部引号双写', () => {
    expect(转义Csv字段('含"引号"的文本')).toBe('"含""引号""的文本"')
  })

  it('含换行的字段加引号', () => {
    expect(转义Csv字段('第一行\n第二行')).toBe('"第一行\n第二行"')
  })
})

describe('CSV 导出', () => {
  it('逐行导出显示值', () => {
    const csv = 导出为Csv(构造表())
    expect(csv.split('\n')).toEqual(['姓名,金额', '张三,1200', '李四,2400'])
  })

  it('公式导出计算结果而非公式原文', () => {
    const csv = 导出为Csv(构造表())
    expect(csv).toContain('2400')
    expect(csv).not.toContain('=B2*2')
  })

  it('按实际内容裁剪导出范围', () => {
    const csv = 导出为Csv(构造表())
    expect(csv.split('\n')).toHaveLength(3)
    expect(csv.split('\n')[0].split(',')).toHaveLength(2)
  })

  it('空工作表返回空字符串', () => {
    expect(导出为Csv(创建工作表('空表'))).toBe('')
  })

  it('含特殊字符的内容保持可解析', () => {
    let 表 = 创建工作表('测试')
    表 = 写入单元格(表, 'A1', '甲,乙')
    表 = 写入单元格(表, 'B1', '丙')
    expect(导出为Csv(表)).toBe('"甲,乙",丙')
  })
})

describe('HTML 导出', () => {
  it('生成含标题与语言声明的完整文档', () => {
    const html = 导出为Html表格(构造表(), '测试表')
    expect(html).toContain('<title>测试表</title>')
    expect(html).toContain('lang="zh-CN"')
    expect(html).toContain('charset="utf-8"')
  })

  it('生成表格结构并包含全部内容', () => {
    const html = 导出为Html表格(构造表(), '测试表')
    expect((html.match(/<tr>/g) ?? []).length).toBe(3)
    expect(html).toContain('张三')
    expect(html).toContain('2400')
  })

  it('空工作表返回空字符串', () => {
    expect(导出为Html表格(创建工作表('空表'), '空表')).toBe('')
  })

  it('内容中的 HTML 标签被转义，不破坏导出页结构', () => {
    let 表 = 创建工作表('测试')
    表 = 写入单元格(表, 'A1', '<script>alert(1)</script>')
    const html = 导出为Html表格(表, '测试')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('标题中的 HTML 标签同样被转义', () => {
    let 表 = 创建工作表('测试')
    表 = 写入单元格(表, 'A1', '内容')
    const html = 导出为Html表格(表, '<b>标题</b>')
    expect(html).not.toContain('<b>标题</b>')
    expect(html).toContain('&lt;b&gt;')
  })
})

describe('导出文件名', () => {
  it('按扩展名生成文件名', () => {
    expect(生成表格文件名('Sheet1', 'csv')).toBe('Sheet1.csv')
    expect(生成表格文件名('Sheet1', 'html')).toBe('Sheet1.html')
  })

  it('带点扩展名（xlsx）直接拼接', () => {
    expect(生成表格文件名('Sheet1', '.xlsx')).toBe('Sheet1.xlsx')
  })

  it('名称为空时回落默认值', () => {
    expect(生成表格文件名('   ', 'csv')).toBe('工作表.csv')
    expect(生成表格文件名('   ', '.xlsx')).toBe('工作表.xlsx')
  })
})

describe('Xlsx 导出模型', () => {
  it('空白验证单元格与保护状态进入表格文件写入模型', () => {
    const 表 = 设置数据验证(创建工作表('规则表', 4, 4), 'C3', { 类型: '列表', 选项: ['待办', '完成'], 允许空白: false })
    const 模型 = 导出为Xlsx({ ...表, 保护: '本机' })!
    expect(模型.工作表[0].数据[2][2]).toEqual({ 文字: [{ 文本: '' }], 数据验证: { 类型: '列表', 选项: ['待办', '完成'], 允许空白: false } })
    expect(模型.工作表[0].保护).toBe(true)
  })
  it('导入的文本型数字在保存前保留文本类型，编辑后按新输入处理', () => {
    const 表 = 从Html表格构建工作表('<table><tr><td data-value-type="text">00123</td></tr></table>')!
    expect(导出为Xlsx(表)!.工作表[0].数据[0][0]).toEqual({ 文字: [{ 文本: '00123' }], 类型: '文本' })
    expect(导出为Xlsx(写入单元格(表, 'A1', '42'))!.工作表[0].数据[0][0]).toBe('42')
  })
  it('基础格式、合并、行列尺寸与视图设置进入文件模型', () => {
    let 表 = 创建工作表('保真', 4, 3)
    表 = 写入单元格(表, 'A1', '标题')
    表 = 设置格式(表, 'A1', { 加粗: true, 字体颜色: '#336699', 填充颜色: '#FFF3B0', 水平对齐: 'center' })
    表 = 设置列宽(表, 0, 120)
    表 = 设置行高(表, 0, 32)
    表 = 切换合并(表, 'A1:B1')
    const 模型 = 导出为Xlsx({ ...表, 冻结: { 行: 1, 列: 0 }, 筛选: { 列: 0, 值: '甲' } })!
    expect(模型.工作表[0].数据[0][0]).toMatchObject({ 格式: { 加粗: true, 字体颜色: '#336699' } })
    expect(模型.工作表[0]).toMatchObject({ 合并区域: ['A1:B1'], 冻结: { 行: 1, 列: 0 }, 筛选: { 列: 0, 值: '甲' } })
    expect(模型.工作表[0].列宽[0]).toBe(120)
    expect(模型.工作表[0].行高[0]).toBe(32)
  })
  it('页面设置随工作表进入文件写入模型', () => {
    const 表 = { ...写入单元格(创建工作表('页面'), 'A1', '内容'), 页面设置: { 页边距: '窄' as const, 方向: '横向' as const, 纸张大小: 'A5' as const } }
    expect(导出为Xlsx(表)!.工作表[0].页面设置).toEqual(表.页面设置)
  })
  it('批注随普通单元格和公式单元格写入模型', () => {
    let 表 = 创建工作表('批注', 3, 2)
    表 = 设置批注(写入单元格(表, 'A1', '金额'), 'A1', '请核对')
    表 = 设置批注(写入单元格(表, 'B1', '=1+2'), 'B1', '公式说明')
    const 模型 = 导出为Xlsx(表)
    expect(模型!.工作表[0].数据[0][0]).toEqual({ 文字: [{ 文本: '金额' }], 批注: '请核对' })
    expect(模型!.工作表[0].数据[0][1]).toEqual({ 公式: '1+2', 结果: 3, 批注: '公式说明' })
  })
  it('生成含名称与单元格原始值的工作表模型', () => {
    const 模型 = 导出为Xlsx(构造表())
    expect(模型).not.toBeNull()
    expect(模型!.工作表).toHaveLength(1)
    expect(模型!.工作表[0].名称).toBe('测试表')
    expect(模型!.工作表[0].数据).toEqual([
      ['姓名', '金额'],
      ['张三', '1200'],
      ['李四', { 公式: 'B2*2', 结果: 2400 }],
    ])
  })

  it('XLSX 保存保留公式和计算结果', () => {
    const 模型 = 导出为Xlsx(构造表())
    expect(模型!.工作表[0].数据[2][1]).toEqual({ 公式: 'B2*2', 结果: 2400 })
  })

  it('空工作表返回 null', () => {
    expect(导出为Xlsx(创建工作表('空表'))).toBeNull()
  })
})

describe('导出为Xlsx：多工作表', () => {
  it('接受工作表数组并输出全部表定义', () => {
    let 表一 = 创建工作表('一季度', 3, 2)
    表一 = 写入单元格(表一, 'A1', '甲')
    let 表二 = 创建工作表('二季度', 3, 2)
    表二 = 写入单元格(表二, 'A1', '乙')
    const 模型 = 导出为Xlsx([表一, 表二])
    expect(模型).not.toBeNull()
    expect(模型!.工作表).toHaveLength(2)
    expect(模型!.工作表[0].名称).toBe('一季度')
    expect(模型!.工作表[0].数据[0][0]).toBe('甲')
    expect(模型!.工作表[1].名称).toBe('二季度')
  })

  it('全部为空表时返回 null', () => {
    expect(导出为Xlsx([创建工作表('空', 3, 2)])).toBeNull()
  })
})
