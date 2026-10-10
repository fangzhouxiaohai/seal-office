import { afterEach, describe, expect, it, vi } from 'vitest'
import { 读取本地文件内容 } from '../fileOpen'
import { 从Html表格构建工作表 } from './sheetImport'
import { 创建工作表, 写入单元格 } from './model'
import { 表格文本输出 } from './sheetSave'

afterEach(() => { Reflect.deleteProperty(window, 'electronAPI') })
async function 读取CSV(内容: string) {
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { readFile: vi.fn().mockResolvedValue({ 成功: true, 内容, 二进制: false, 扩展名: '.csv' }) } })
  const 解析 = await 读取本地文件内容('D:/验收.csv')
  return 从Html表格构建工作表(解析.内容!)!
}
describe('CSV 原格式保存与重开', () => {
  it('GB18030 和 UTF-16 来源编码随编辑内容保存', async () => {
    for (const 编码 of ['gb18030', 'utf16le'] as const) {
      Object.defineProperty(window, 'electronAPI', { configurable: true, value: { readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: '编号,说明\r\n0012,中文', 文本编码: 编码, 二进制: false, 扩展名: '.csv' }) } })
      const read = await 读取本地文件内容('D:/编码.csv')
      const sheet = 从Html表格构建工作表(read.内容!)!
      const output = 表格文本输出('D:/编码.csv', [写入单元格(sheet, 'B2', '新中文')])!
      expect(output.编码).toBe(编码); expect(output.内容).toContain('0012,新中文')
    }
  })
  it('TSV 引号中的制表符和换行保留字段边界', async () => {
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { readFile: vi.fn().mockResolvedValue({ 成功: true, 内容: '编号\t说明\n0012\t"甲\t乙\n第二行"\n', 二进制: false, 扩展名: '.tsv' }) } })
    const read = await 读取本地文件内容('D:/数据.tsv')
    const sheet = 从Html表格构建工作表(read.内容!)!
    expect(sheet.单元格.A2.原始值).toBe('0012')
    expect(表格文本输出('D:/数据.tsv', [sheet])?.内容).toBe('编号\t说明\n0012\t"甲\t乙\n第二行"\n')
  })
  it.each([
    '编号,说明,\r\n0012,"甲,乙",\r\n=1+1,"含""引号""\r\n第二行",\r\n',
    '\uFEFF"编号",名称\r\n0007,中文\r\n', 'a,b,\n,,\n', 'a,b\rc,d\r', '', '\uFEFF', '\n', '"末尾换行\n"',
  ])('保留字面值、空字段、空行、BOM 与换行：%j', async 来源 => {
    const 表 = await 读取CSV(来源)
    const 输出 = 表格文本输出('D:/验收.csv', [表])!
    expect(输出.损失).toEqual([])
    const 重开 = await 读取CSV(输出.内容)
    expect(重开.单元格).toEqual(表.单元格)
    expect(重开.CSV来源).toEqual(表.CSV来源)
    expect(输出.内容.startsWith('\uFEFF')).toBe(来源.startsWith('\uFEFF'))
  })
  it('编辑单元格后保留前导零、空尾列，新增内容扩大边界', async () => {
    const 表 = await 读取CSV('编号,说明,\r\n0012,原文,\r\n')
    const 新表 = 写入单元格(写入单元格(表, 'B2', '中文,"引号"\n换行'), 'D3', '新增')
    const 输出 = 表格文本输出('D:/验收.csv', [新表])!
    expect(输出.内容).toContain('0012,"中文,""引号""\n换行",')
    const 重开 = await 读取CSV(输出.内容)
    expect(重开.单元格.A2.原始值).toBe('0012')
    expect(重开.单元格.D3.原始值).toBe('新增')
    expect(重开.CSV来源?.行字段数).toEqual([3, 3, 4])
  })
  it('多表不能标记整个工作簿已保存为 CSV；公式和样式报告转换损失', () => {
    const 表 = 写入单元格(创建工作表('甲'), 'A1', '=1+1')
    expect(() => 表格文本输出('a.csv', [表, 创建工作表('乙')])).toThrow('CSV 只能保存一张工作表')
    表.单元格.A1.格式 = { 加粗: true }
    expect(表格文本输出('a.csv', [表])?.损失).toEqual(['公式（仅保存计算结果）', '单元格样式'])
    expect(表格文本输出('a.xlsx', [表])).toBeNull()
  })
  it('旧版 JSON 完整保存多表、格式与数据模型', () => {
    const 表 = [写入单元格(创建工作表('甲'), 'A1', '=1+1'), 创建工作表('乙')]
    const 输出 = 表格文本输出('a.json', 表)!
    expect(输出.损失).toEqual([])
    expect(JSON.parse(输出.内容)).toEqual(表)
  })
})
