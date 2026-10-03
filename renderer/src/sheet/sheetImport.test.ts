import { describe, it, expect } from 'vitest'
import { 从Html表格构建工作表 } from './sheetImport'
import { 读取单元格 } from './model'

describe('表格 HTML 导入', () => {
  it('CSV 文本标记避免公式计算并保留前导零', () => {
    const 表 = 从Html表格构建工作表('<table><tr><td data-value-type="text">0012</td><td data-value-type="text">=1+1</td></tr></table>')!
    expect(读取单元格(表, 'A1')).toMatchObject({ 原始值: '0012', 显示值: '0012', 值类型: '文本' })
    expect(读取单元格(表, 'B1')).toMatchObject({ 原始值: '=1+1', 显示值: '=1+1', 值类型: '文本' })
  })

  it('空白单元格的数据验证与工作表保护从元数据恢复', () => {
    const 表 = 从Html表格构建工作表('<table><tr><td></td></tr></table>', '受控表', undefined, {
      单元格验证: { C3: { 类型: '列表', 选项: ['待办', '完成'], 允许空白: false } },
      保护: '本机',
    })!
    expect(读取单元格(表, 'C3').数据验证).toEqual({ 类型: '列表', 选项: ['待办', '完成'], 允许空白: false })
    expect(表.保护).toBe('本机')
  })
  it('导入基础格式、合并、行列尺寸与视图设置', () => {
    const 表 = 从Html表格构建工作表('<table><tr><td>标题</td><td></td></tr></table>', '保真', undefined, {
      单元格格式: { A1: { 加粗: true, 字体颜色: '#336699' } },
      合并区域: ['A1:B1'], 列宽: { 0: 120 }, 行高: { 0: 32 },
      冻结: { 行: 1, 列: 0 }, 筛选: { 列: 0, 值: '甲' },
    })
    expect(读取单元格(表!, 'A1').格式).toMatchObject({ 加粗: true, 字体颜色: '#336699' })
    expect(表!.合并区域).toEqual(['A1:B1'])
    expect(表!.列宽[0]).toBe(120)
    expect(表!.行高[0]).toBe(32)
    expect(表!.冻结).toEqual({ 行: 1, 列: 0 })
    expect(表!.筛选).toEqual({ 列: 0, 值: '甲' })
  })
  it('导入工作表时带入页面设置', () => {
    const 表 = 从Html表格构建工作表('<table><tr><td>内容</td></tr></table>', '页面', { 页边距: '宽', 方向: '横向', 纸张大小: 'B5' })
    expect(表?.页面设置).toEqual({ 页边距: '宽', 方向: '横向', 纸张大小: 'B5' })
  })
  it('解析行列并写入对应单元格', () => {
    const html = '<table><tbody><tr><td>甲</td><td>1</td></tr><tr><td>乙</td><td>2</td></tr></tbody></table>'
    const 表 = 从Html表格构建工作表(html)
    expect(表).not.toBeNull()
    expect(读取单元格(表!, 'A1').显示值).toBe('甲')
    expect(读取单元格(表!, 'B1').显示值).toBe('1')
    expect(读取单元格(表!, 'A2').显示值).toBe('乙')
    expect(读取单元格(表!, 'B2').显示值).toBe('2')
  })

  it('支持表头 th 单元格', () => {
    const html = '<table><thead><tr><th>名称</th><th>数值</th></tr></thead><tbody><tr><td>X</td><td>9</td></tr></tbody></table>'
    const 表 = 从Html表格构建工作表(html)
    expect(读取单元格(表!, 'A1').显示值).toBe('名称')
    expect(读取单元格(表!, 'B2').显示值).toBe('9')
  })

  it('公式在导入后参与重算', () => {
    const html = '<table><tbody><tr><td>2</td><td>3</td><td>=A1*B1</td></tr></tbody></table>'
    const 表 = 从Html表格构建工作表(html)
    expect(读取单元格(表!, 'C1').显示值).toBe('6')
  })

  it('读取 XLSX 公式标记后仍可编辑公式原文', () => {
    const html = '<table><tbody><tr><td>2</td><td>3</td><td data-formula="=A1*B1">6</td></tr></tbody></table>'
    const 表 = 从Html表格构建工作表(html)
    expect(读取单元格(表!, 'C1').原始值).toBe('=A1*B1')
    expect(读取单元格(表!, 'C1').显示值).toBe('6')
  })

  it('从 XLSX 表格标记恢复批注，包括空白单元格上的批注', () => {
    const html = '<table><tbody><tr><td data-comment="请核对">10</td><td data-comment="空白批注"></td></tr></tbody></table>'
    const 表 = 从Html表格构建工作表(html)
    expect(读取单元格(表!, 'A1').批注).toBe('请核对')
    expect(读取单元格(表!, 'B1').批注).toBe('空白批注')
  })

  it('无表格标记返回 null，空工作簿仍可重新打开', () => {
    expect(从Html表格构建工作表('<p>无表格</p>')).toBeNull()
    const 空表 = 从Html表格构建工作表('<table><tbody></tbody></table>', '空白表')
    expect(空表?.name).toBe('空白表')
    expect(空表?.单元格).toEqual({})
  })

  it('列数超过 26 时仍能显示和编辑全部导入数据', () => {
    const 单行 = Array.from({ length: 30 }, (_, i) => `<td>${i}</td>`).join('')
    const 表 = 从Html表格构建工作表(`<table><tbody><tr>${单行}</tr></tbody></table>`)
    expect(表!.列数).toBeGreaterThanOrEqual(30)
    expect(读取单元格(表!, 'AD1').原始值).toBe('29')
  })

  it('行数超过 100 时仍能显示和编辑全部导入数据', () => {
    const 行 = Array.from({ length: 101 }, (_, i) => `<tr><td>${i + 1}</td></tr>`).join('')
    const 表 = 从Html表格构建工作表(`<table><tbody>${行}</tbody></table>`)
    expect(表!.行数).toBeGreaterThanOrEqual(101)
    expect(读取单元格(表!, 'A101').原始值).toBe('101')
  })
})
