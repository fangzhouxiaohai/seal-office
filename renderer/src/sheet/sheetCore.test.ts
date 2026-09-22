import { describe, it, expect } from 'vitest'
import { 列转字母, 字母转列, 生成地址, 解析地址, 生成区域地址, 展开区域, 规范化区域 } from './address'
import { 格式化数字 } from './numberFormat'
import { 统计选区 } from './selectionStats'

describe('列号与字母换算', () => {
  it('单字母列号', () => {
    expect(列转字母(0)).toBe('A')
    expect(列转字母(25)).toBe('Z')
  })

  it('双字母列号', () => {
    expect(列转字母(26)).toBe('AA')
    expect(列转字母(27)).toBe('AB')
    expect(列转字母(51)).toBe('AZ')
    expect(列转字母(52)).toBe('BA')
  })

  it('字母转列号与反向一致', () => {
    ;['A', 'Z', 'AA', 'AB', 'BA', 'ZZ'].forEach((字母) => {
      expect(列转字母(字母转列(字母))).toBe(字母)
    })
  })

  it('字母转列号忽略大小写', () => {
    expect(字母转列('a')).toBe(0)
    expect(字母转列('aa')).toBe(26)
  })
})

describe('地址换算', () => {
  it('行列转地址', () => {
    expect(生成地址(0, 0)).toBe('A1')
    expect(生成地址(9, 2)).toBe('C10')
    expect(生成地址(99, 25)).toBe('Z100')
  })

  it('地址转行列', () => {
    expect(解析地址('A1')).toEqual({ 行: 0, 列: 0 })
    expect(解析地址('C10')).toEqual({ 行: 9, 列: 2 })
    expect(解析地址('AA1')).toEqual({ 行: 0, 列: 26 })
  })

  it('非法地址返回 null', () => {
    expect(解析地址('1A')).toBeNull()
    expect(解析地址('')).toBeNull()
    expect(解析地址('A0')).toBeNull()
    expect(解析地址('随便')).toBeNull()
  })

  it('地址解析与生成互为逆运算', () => {
    const 位置 = 解析地址('Z100')
    expect(位置).not.toBeNull()
    expect(生成地址(位置!.行, 位置!.列)).toBe('Z100')
  })
})

describe('区域换算', () => {
  it('生成区域地址', () => {
    expect(生成区域地址({ 行: 0, 列: 0 }, { 行: 2, 列: 2 })).toBe('A1:C3')
  })

  it('相同单元格的区域退化为单格地址', () => {
    expect(生成区域地址({ 行: 1, 列: 1 }, { 行: 1, 列: 1 })).toBe('B2')
  })

  it('展开区域为全部单元格', () => {
    const 列表 = 展开区域('A1:B2')
    expect(列表.map((项) => 生成地址(项.行, 项.列))).toEqual(['A1', 'B1', 'A2', 'B2'])
  })

  it('展开单格区域返回一个位置', () => {
    expect(展开区域('C3')).toEqual([{ 行: 2, 列: 2 }])
  })

  it('非法区域返回空数组', () => {
    expect(展开区域('随便')).toEqual([])
    expect(展开区域('')).toEqual([])
  })

  it('规范化区域使起点位于终点之前', () => {
    const 结果 = 规范化区域({ 行: 2, 列: 2 }, { 行: 0, 列: 0 })
    expect(结果.起点).toEqual({ 行: 0, 列: 0 })
    expect(结果.终点).toEqual({ 行: 2, 列: 2 })
  })
})

describe('数字格式化', () => {
  it('常规格式保留原值', () => {
    expect(格式化数字(1234.567, '常规')).toBe('1234.567')
  })

  it('数值格式默认保留两位小数', () => {
    expect(格式化数字(1234.5, '数值')).toBe('1234.50')
  })

  it('数值格式可指定小数位', () => {
    expect(格式化数字(1234.567, '数值', 1)).toBe('1234.6')
    expect(格式化数字(1234.567, '数值', 3)).toBe('1234.567')
  })

  it('货币格式带人民币符号与千位分隔', () => {
    expect(格式化数字(1234.5, '货币')).toBe('¥1,234.50')
  })

  it('百分比格式按百分数展示', () => {
    expect(格式化数字(0.125, '百分比')).toBe('12.50%')
  })

  it('千位分隔格式保留整数部分', () => {
    expect(格式化数字(1234567, '千位分隔')).toBe('1,234,567')
  })

  it('负数保留符号', () => {
    expect(格式化数字(-1234.5, '数值')).toBe('-1234.50')
    expect(格式化数字(-0.5, '百分比')).toBe('-50.00%')
  })

  it('非有限数值原样返回文本', () => {
    expect(格式化数字(Number.NaN, '数值')).toBe('NaN')
  })
})

describe('选区统计', () => {
  it('统计数量、求和、平均值与极值', () => {
    const 结果 = 统计选区(['1', '2', '3', '4'])
    expect(结果.计数).toBe(4)
    expect(结果.求和).toBe(10)
    expect(结果.平均值).toBe(2.5)
    expect(结果.最大).toBe(4)
    expect(结果.最小).toBe(1)
  })

  it('忽略非数值内容', () => {
    const 结果 = 统计选区(['1', '文本', '', '3'])
    expect(结果.计数).toBe(2)
    expect(结果.求和).toBe(4)
  })

  it('无有效数值时返回零且不产生 NaN', () => {
    const 结果 = 统计选区(['文本', ''])
    expect(结果.计数).toBe(0)
    expect(结果.求和).toBe(0)
    expect(结果.平均值).toBe(0)
    expect(结果.最大).toBe(0)
    expect(结果.最小).toBe(0)
  })

  it('单个数值的平均值等于其本身', () => {
    const 结果 = 统计选区(['7'])
    expect(结果.平均值).toBe(7)
  })
})
