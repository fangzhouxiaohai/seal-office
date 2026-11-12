import { describe, it, expect } from 'vitest'
import { 创建工作表, 批量写入单元格 } from './model'
import { 规范工作表筛选, 计算筛选隐藏行, 筛选说明, 筛选最大列 } from './sheetFilter'
import { 从Html表格构建工作表 } from './sheetImport'
import { 导出为Xlsx } from './sheetExport'

const 成绩表 = () => 批量写入单元格(创建工作表('成绩', 10, 6), {
  B2: '姓名', C2: '班级', D2: '成绩',
  B3: '张三', C3: '一班', D3: '95',
  B4: '李四', C4: '二班', D4: '58',
  B5: '王五', C5: '一班', D5: '72',
  B6: '赵六', C6: '', D6: '88',
  B7: '孙七', C7: '三班', D7: '66',
})

const 复合筛选 = {
  范围: 'B2:D7',
  列条件: [
    { 列: 2, 值列表: ['一班', '三班'], 空白: true },
    { 列: 3, 自定义: { 且: true, 条件: [{ 运算符: 'greaterThanOrEqual' as const, 值: '60' }, { 运算符: 'lessThan' as const, 值: '90' }] } },
  ],
  排序状态Xml: '<sortState ref="B3:D7"/>',
}

describe('表格筛选模型', () => {
  it('旧版 { 列, 值 } 规范为新模型，范围从首行覆盖到工作表数据末行', () => {
    const 表 = 批量写入单元格(创建工作表('旧版', 10, 4), { A1: '类别', A2: '甲', A3: '乙', B3: 'x' })
    expect(规范工作表筛选({ 列: 0, 值: '甲' }, 表)).toEqual({ 范围: 'A1:A10', 列条件: [{ 列: 0, 值列表: ['甲'] }] })
    expect(规范工作表筛选({ 列: 1, 值: '' }, 表)?.列条件).toEqual([{ 列: 1, 空白: true }])
  })

  it('多列多值、空白与自定义区间条件按 AND 组合隐藏行', () => {
    expect([...计算筛选隐藏行({ ...成绩表(), 筛选: 复合筛选 })].sort()).toEqual([2, 3])
  })

  it('通配符与原样保留的条件：保留条件不隐藏任何行', () => {
    const 表 = { ...成绩表(), 筛选: { 范围: 'B2:D7', 列条件: [
      { 列: 1, 自定义: { 且: false, 条件: [{ 运算符: 'equal' as const, 值: '*三' }, { 运算符: 'equal' as const, 值: '王?' }] } },
      { 列: 3, 原始Xml: '<filterColumn colId="2"><top10 val="2"/></filterColumn>' },
    ] } }
    expect([...计算筛选隐藏行(表)].sort()).toEqual([3, 5, 6])
  })

  it('旧版单值筛选的隐藏行与此前行为一致', () => {
    const 表 = 批量写入单元格(创建工作表('旧版', 5, 2), { A1: '类别', A2: '甲', A3: '乙', A4: '甲' })
    expect([...计算筛选隐藏行({ ...表, 筛选: { 列: 0, 值: '甲' } })].sort()).toEqual([2, 4])
  })

  it('说明文字列出列与条件，最大列取范围右边界', () => {
    expect(筛选说明({ 列: 0, 值: '' })).toBe('第 1 列筛选：空白')
    expect(筛选说明(复合筛选)).toBe('多列筛选：C 列、D 列')
    expect(筛选最大列(复合筛选)).toBe(3)
    expect(筛选最大列({ 列: 4, 值: '甲' })).toBe(4)
  })

  it('导入的多列筛选原样进入工作表模型，导出时原样写回', () => {
    const 表 = 从Html表格构建工作表('<table><tr><td>甲</td></tr></table>', '导入', undefined, { 筛选: { ...复合筛选, 范围: 'B2:H7' } })!
    expect(表.筛选).toEqual({ ...复合筛选, 范围: 'B2:H7' })
    expect(表.列数).toBeGreaterThanOrEqual(8)
    expect(导出为Xlsx(表)!.工作表[0].筛选).toEqual({ ...复合筛选, 范围: 'B2:H7' })
  })
})
