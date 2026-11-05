import { describe, expect, it } from 'vitest'
import { 导入网页型旧版表格 } from './htmlXlsImport'

describe('网页型旧版表格导入', () => {
  it('保留表头、文本编号、实体、中文、空字段与合并单元格', () => {
    const 工作表 = 导入网页型旧版表格('\uFEFF<html><body><table><tr><th colspan="2">审核表</th></tr><tr><td style="mso-number-format:\\@;">00123456789012345678</td><td>甲&amp;乙</td></tr><tr><td></td><td>中文</td></tr></table></body></html>')[0]
    expect(工作表.单元格.A1.显示值).toBe('审核表')
    expect(工作表.合并区域).toContain('A1:B1')
    expect(工作表.单元格.A2).toMatchObject({ 原始值: '00123456789012345678', 值类型: '文本' })
    expect(工作表.单元格.B2.显示值).toBe('甲&乙')
    expect(工作表.单元格.B3.显示值).toBe('中文')
    expect(工作表.列数).toBeGreaterThanOrEqual(2)
  })

  it('不把脚本和外链作为表格内容，也不执行源网页', () => {
    const 工作表 = 导入网页型旧版表格('<html><body><script>window.__htmlXlsExecuted=1</script><table><tr><td>正文<img src="https://invalid.example/a"></td><td>=1+1</td></tr></table></body></html>')[0]
    expect(工作表.单元格.A1.显示值).toBe('正文')
    expect(工作表.单元格.B1).toMatchObject({ 原始值: '=1+1', 值类型: '文本', 显示值: '=1+1' })
    expect((window as any).__htmlXlsExecuted).toBeUndefined()
  })

  it('非表格网页与超限内容明确失败', () => {
    expect(() => 导入网页型旧版表格('<html><body>没有表格</body></html>')).toThrow('表格')
    expect(() => 导入网页型旧版表格('<html><table><tr><td>甲</td></tr></table></html>', { 最大单元格数: 0 })).toThrow('上限')
  })

  it('千行十一列报表完整导入，首尾文本编号不改变', () => {
    const 数据行 = Array.from({ length: 1120 }, (_, 行) => `<tr>${Array.from({ length: 11 }, (_, 列) => `<td style="mso-number-format:\\@;">${行 === 0 && 列 === 0 ? '0001' : 行 === 1119 && 列 === 10 ? '009999999999999999' : `${行}-${列}`}</td>`).join('')}</tr>`).join('')
    const 表 = 导入网页型旧版表格(`<html><body><table><tr>${'<th>表头</th>'.repeat(11)}</tr>${数据行}</table></body></html>`)[0]
    expect(表.单元格.A2.原始值).toBe('0001')
    expect(表.单元格.K1121.原始值).toBe('009999999999999999')
    expect(表.单元格.K1121.值类型).toBe('文本')
    expect(表.单元格.A1122).toBeUndefined()
    expect(Object.keys(表.单元格)).toHaveLength(1121 * 11)
  })
})
