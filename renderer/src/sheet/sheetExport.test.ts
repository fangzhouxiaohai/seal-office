import { describe, it, expect } from 'vitest'
import { 导出为Csv, 导出为Html表格, 生成表格文件名, 转义Csv字段 } from './sheetExport'
import { 创建工作表, 写入单元格 } from './model'

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
})

describe('导出文件名', () => {
  it('按扩展名生成文件名', () => {
    expect(生成表格文件名('Sheet1', 'csv')).toBe('Sheet1.csv')
    expect(生成表格文件名('Sheet1', 'html')).toBe('Sheet1.html')
  })

  it('名称为空时回落默认值', () => {
    expect(生成表格文件名('   ', 'csv')).toBe('工作表.csv')
  })
})
