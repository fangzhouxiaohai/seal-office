import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { 求值公式 } from './formula'
import { 从Html表格构建工作表 } from './sheetImport'
import { 导出为Xlsx } from './sheetExport'
import { 创建工作表, 写入单元格, 重算工作簿, 读取单元格 } from './model'
import { 净化富文本 } from '../editor/sanitizeHtml'

const require = createRequire(import.meta.url)
const { 创建公式兼容表格 } = require('../../../test/fixtures/formulaCompatibilityXlsx.cjs')
const { 读取xlsx, 写入xlsx } = require('../../../main/office/xlsxCodec.js')

async function 打开(字节: any) {
  const 导入 = await 读取xlsx(字节)
  return 重算工作簿(导入.工作表列表.map((表: any) => 从Html表格构建工作表(净化富文本(表.html), 表.名称, 表.页面设置, 表.元数据)!))
}

describe('Excel/WPS 常见公式互操作', () => {
  it('已有来源公式不重写存储拼写，新输入的现代函数使用兼容存储名', async () => {
    const 来源 = await 打开(await 写入xlsx({ 行: [[{ 公式: 'CONCAT("A","B")', 结果: 'AB', 保留公式拼写: true }]] }))
    expect((导出为Xlsx(来源)!.工作表[0].数据[0][0] as any).保留公式拼写).toBe(true)
    const 不改 = await 打开(await 写入xlsx(导出为Xlsx(来源)))
    expect(读取单元格(不改[0], 'A1').原始值).toBe('=CONCAT("A","B")')
    const 编辑 = [写入单元格(来源[0], 'A1', '=CONCAT("C","D")')]
    expect((导出为Xlsx(编辑)!.工作表[0].数据[0][0] as any).保留公式拼写).toBeUndefined()
    const 重开 = await 打开(await 写入xlsx(导出为Xlsx(编辑)))
    expect(读取单元格(重开[0], 'A1')).toMatchObject({ 原始值: '=_xlfn.CONCAT("C","D")', 显示值: 'CD' })
  })
  it('动态数组属性经完整编辑器模型导入、编辑其他单元和保存保留，替换原公式清除旧属性', async () => {
    const 字节 = await 写入xlsx({ 行: [[{ 公式: '_xlfn.UNIQUE(B1:B2)', 数组范围: 'A1:A2', 动态数组: true, 结果: 7 }, '7'], ['8', '8']] })
    let 工作簿 = await 打开(字节)
    expect(读取单元格(工作簿[0], 'A1').公式来源).toMatchObject({ 动态数组: true, 数组范围: 'A1:A2' })
    工作簿 = [写入单元格(工作簿[0], 'B2', '9')]
    const 模型 = 导出为Xlsx(工作簿)!
    expect(模型.工作表[0].数据[0][0]).toMatchObject({ 动态数组: true, 数组范围: 'A1:A2', 结果: 7 })
    const 重开 = await 打开(await 写入xlsx(模型))
    expect(读取单元格(重开[0], 'A1').公式来源).toMatchObject({ 动态数组: true, 数组范围: 'A1:A2' })
    const 替换 = 导出为Xlsx([写入单元格(工作簿[0], 'A1', '=SUM(B1:B2)')])!
    expect(替换.工作表[0].数据[0][0]).not.toHaveProperty('动态数组')
    expect(替换.工作表[0].数据[0][0]).not.toHaveProperty('数组范围')
  })
  it('绝对和混合引用、科学计数、百分比、转义引号、连接与 Office 函数前缀可计算', () => {
    const 值 = (地址: string) => ({ A1: 5, A2: 8 }[地址] ?? '')
    expect(求值公式('=SUM($A$1:$A2)+A$1+$A1', 值).值).toBe(23)
    expect(求值公式('=1e3+.5+25%', 值).值).toBe(1000.75)
    expect(求值公式('="A""1"&"："&+A1', 值).值).toBe('A"1：5')
    expect(求值公式('=_xlfn.XLOOKUP(8,$A$1:$A$2,$A$1:$A$2)', 值).值).toBe(8)
    expect(求值公式('=IF(TRUE,3,1/0)', 值).值).toBe(3)
    expect(求值公式('=IFERROR(1/0,42)', 值).值).toBe(42)
    expect(求值公式('=_xlfn.UNKNOWN(1)', 值)).toMatchObject({ 错误: true, 未支持: true })
    expect(求值公式('=1/0', 值)).toEqual({ 值: '#错误', 错误: true })
  })

  it('共享、跨表、未知及数组公式经导入、编辑和保存重开保留原文、缓存和范围', async () => {
    let 工作簿 = await 打开(await 创建公式兼容表格({ 严格: true, 显式前缀: true }))
    expect(读取单元格(工作簿[0], 'B2')).toMatchObject({ 原始值: '=SUM($A2,A$1,$A$1)+IF("A1"="A1",0,99)', 显示值: '18' })
    expect(读取单元格(工作簿[0], 'C2').显示值).toBe('A1')
    expect(读取单元格(工作簿[0], 'D1').显示值).toBe('5')
    expect(读取单元格(工作簿[0], 'E1').显示值).toBe('24')
    expect(读取单元格(工作簿[0], 'F1')).toMatchObject({ 显示值: '0', 公式状态: '来源缓存' })
    expect(读取单元格(工作簿[0], 'F2').显示值).toBe('FALSE')
    expect(读取单元格(工作簿[0], 'F3').显示值).toBe('')
    expect(读取单元格(工作簿[0], 'F4').显示值).toBe('#N/A')
    expect(读取单元格(工作簿[0], 'F5')).toMatchObject({ 显示值: '#待计算', 公式状态: '待计算' })
    expect(读取单元格(工作簿[0], 'F6').显示值).toBe('A<&😀')
    expect(读取单元格(工作簿[0], 'G1')).toMatchObject({ 显示值: '5', 公式状态: '来源缓存', 公式来源: { 数组范围: 'G1:G2' } })
    // 能执行的公式发生实际计算错误时，不回退到旧缓存 99。
    expect(读取单元格(工作簿[0], 'I1').显示值).toBe('#错误')

    工作簿 = 重算工作簿([写入单元格(工作簿[0], 'A1', '9'), 写入单元格(工作簿[1], 'A1', '20')])
    expect(读取单元格(工作簿[0], 'B2').显示值).toBe('26')
    expect(读取单元格(工作簿[0], 'E1').显示值).toBe('40')
    expect(读取单元格(工作簿[0], 'F1')).toMatchObject({ 显示值: '0', 公式状态: '来源缓存' })
    expect(读取单元格(工作簿[0], 'J1')).toMatchObject({ 显示值: '9', 公式状态: '依赖缓存' })
    const 字节 = await 写入xlsx(导出为Xlsx(工作簿))
    const 重开 = await 打开(字节)
    for (const 地址 of ['B2', 'C2', 'D1', 'E1', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'G1', 'H1', 'J1']) {
      expect(读取单元格(重开[0], 地址).原始值).toBe(读取单元格(工作簿[0], 地址).原始值)
      expect(读取单元格(重开[0], 地址).显示值).toBe(读取单元格(工作簿[0], 地址).显示值)
    }
    const 来源 = (await 读取xlsx(字节)).工作表列表[0].元数据.公式来源
    expect(来源.F1.结果).toBe(0)
    expect(来源.F2.结果).toBe(false)
    expect(来源.F3.结果).toBe('')
    expect(来源.F4.结果).toEqual({ error: '#N/A' })
    expect(来源.F5).not.toHaveProperty('结果')
    expect(来源.G1.数组范围).toBe('G1:G2')
    expect(来源.H1.数组范围).toBe('H1:H2')
    expect(来源.J1.结果).toBe(9)
  })

  it('替换公式清除旧来源缓存，新增不支持的公式不会冒用原缓存', async () => {
    const 工作簿 = await 打开(await 创建公式兼容表格())
    const 表 = 写入单元格(工作簿[0], 'F1', '=_xlfn.UNKNOWN(999)')
    expect(读取单元格(表, 'F1')).toMatchObject({ 显示值: '#待计算', 公式状态: '待计算' })
    expect(读取单元格(表, 'F1').公式来源).toBeUndefined()
    expect(读取单元格(表, 'J1')).toMatchObject({ 显示值: '#待计算', 公式状态: '待计算' })
    const 数据 = 导出为Xlsx([表, 工作簿[1]])!
    expect(数据.工作表[0].数据[0][5]).not.toHaveProperty('结果')
    expect(数据.工作表[0].数据[0][9]).not.toHaveProperty('结果')
  })

  it('跨表引用使用表名转义并阻止跨表循环无限递归', () => {
    let 甲 = 创建工作表('甲'), 乙 = 创建工作表("乙'方")
    甲 = 写入单元格(甲, 'A1', "='乙''方'!$A$1+1")
    乙 = 写入单元格(乙, 'A1', '8')
    expect(重算工作簿([甲, 乙])[0].单元格.A1.显示值).toBe('9')
    乙 = 写入单元格(乙, 'A1', "='甲'!A1+1")
    expect(重算工作簿([甲, 乙]).map(表 => 表.单元格.A1.显示值)).toEqual(['#错误', '#错误'])
  })

  it('空白引用不进入平均值或计数；重复重算保持快照引用以支持撤销重做', () => {
    const 取值 = (地址: string) => 地址 === 'A1' ? 10 : ''
    expect(求值公式('=AVERAGE(A1:A3)', 取值).值).toBe(10)
    expect(求值公式('=COUNT(A1:A3)', 取值).值).toBe(1)
    const 普通表 = [写入单元格(创建工作表('普通'), 'A1', '10')]
    expect(重算工作簿(普通表)).toBe(普通表)
    const 公式表 = 重算工作簿([写入单元格(普通表[0], 'B1', '=$A$1*2')])
    expect(重算工作簿(公式表)).toBe(公式表)
    const 跨表 = 重算工作簿([写入单元格(普通表[0], 'B1', "='第二张表'!A1*2"), 写入单元格(创建工作表('第二张表'), 'A1', '3')])
    expect(重算工作簿(跨表)).toBe(跨表)
  })
})
