import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { 从Html表格构建工作表 } from './sheetImport'
import { 导出为Xlsx } from './sheetExport'
import { 重算工作簿, 写入单元格, 设置格式, 创建工作表 } from './model'
import { 格式化来源数字 } from './numberFormat'
const require = createRequire(import.meta.url)
const { 读取xlsx, 写入xlsx } = require('../../../main/office/xlsxCodec.js')

async function 打开(字节: any) {
  const 导入 = await 读取xlsx(字节)
  return 重算工作簿(导入.工作表列表.map((表: any) => 从Html表格构建工作表(表.html, 表.名称, 表.页面设置, 表.元数据)!))
}
describe('日期与数字格式完整编辑链路', () => {
  it('日期1904的serial0参与YEAR和跨表计算，编辑/保存/重开不改变基准或代码', async () => {
    const 字节 = await 写入xlsx({ 日期系统1904: true, 工作表: [
      { 名称: '数据', 数据: [[{ 文字: [{ 文本: '0' }], 格式: { 数字格式代码: 'yyyy-mm-dd' } }, { 公式: 'YEAR(A1)', 结果: 1904 }], [{ 公式: 'DATE(1904,1,2)', 结果: 1, 格式: { 数字格式代码: 'yyyy-mm-dd' } }]] },
      { 名称: '汇总', 数据: [[{ 公式: 'YEAR(数据!A1)', 结果: 1904 }]] },
    ] })
    let 簿 = await 打开(字节)
    expect(簿[0].单元格.A1).toMatchObject({ 原始值: '0', 显示值: '1904-01-01' })
    expect(簿[0].单元格.B1.显示值).toBe('1904')
    expect(簿[0].单元格.A2).toMatchObject({ 原始值: '=DATE(1904,1,2)', 计算值: 1, 显示值: '1904-01-02' })
    expect(簿[1].单元格.A1.显示值).toBe('1904')
    簿 = 重算工作簿([写入单元格(簿[0], 'A1', '366'), 簿[1]])
    expect(簿[0].单元格.A1.显示值).toBe('1905-01-01')
    expect(簿[1].单元格.A1.显示值).toBe('1905')
    const 模型 = 导出为Xlsx(簿)!; expect(模型.日期系统1904).toBe(true)
    const 重开 = await 打开(await 写入xlsx(模型))
    expect(重开.map(表 => 表.日期系统1904)).toEqual([true, true])
    expect(重开[0].单元格.A1).toMatchObject({ 原始值: '366', 显示值: '1905-01-01', 格式: { 数字格式代码: 'yyyy-mm-dd' } })
    expect(重开[1].单元格.A1.显示值).toBe('1905')
    expect(() => 导出为Xlsx([重开[0], 创建工作表('错误基准')])).toThrow('日期基准不一致')
  })

  it.each([[0,'yyyy-mm-dd','1900-01-00'],[59,'yyyy-mm-dd','1900-02-28'],[60,'yyyy-mm-dd','1900-02-29'],[61,'yyyy-mm-dd','1900-03-01'],[0.5,'hh:mm:ss','12:00:00'],[1234,'000000','001234'],[1234,'0.00E+00','1.23E+03'],[1.25,'# ?/?','1 1/4'],[1234.56,'#,##0.00','1,234.56']] as const)('原始数值 %s 按代码 %s 预览为 %s', (值,代码,预期) => {
    expect(格式化来源数字(值,代码)).toBe(预期)
  })

  it('用户选择新数字格式清除来源代码，保留数据和已有日期基准', () => {
    let 表 = 创建工作表('数据'); 表.日期系统1904 = true
    表 = 写入单元格(表, 'A1', '12')
    表 = 设置格式(表, 'A1', { 数字格式代码: '000000' }); expect(表.单元格.A1.显示值).toBe('000012')
    表 = 设置格式(表, 'A1', { 数字格式: '百分比', 小数位: 0 })
    expect(表.单元格.A1.格式.数字格式代码).toBeUndefined(); expect(表.单元格.A1.显示值).toBe('1200%')
    expect(表.单元格.A1.原始值).toBe('12'); expect(表.日期系统1904).toBe(true)
  })
})
