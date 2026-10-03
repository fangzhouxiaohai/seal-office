import { describe, it, expect } from 'vitest'
import { 从Html表格构建工作表 } from './sheetImport'
import { 读取单元格 } from './model'

describe('表格 HTML 导入', () => {
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
