import { describe, it, expect } from 'vitest'
import {
  列转字母,
  字母转列,
  生成地址,
  解析地址,
  生成区域地址,
  展开区域,
  规范化区域,
} from './address'

describe('列号与字母换算 - 边界值', () => {
  it('26进制边界：A-Z', () => {
    expect(列转字母(0)).toBe('A')
    expect(列转字母(25)).toBe('Z')
  })

  it('26进制边界：AA-AZ', () => {
    expect(列转字母(26)).toBe('AA')
    expect(列转字母(50)).toBe('AY')
    expect(列转字母(51)).toBe('AZ')
    expect(列转字母(76)).toBe('BY')
  })

  it('26进制边界：BA-BZ', () => {
    expect(列转字母(52)).toBe('BA')
    expect(列转字母(77)).toBe('BZ')
    expect(列转字母(78)).toBe('CA')
    expect(列转字母(102)).toBe('CY')
    expect(列转字母(103)).toBe('CZ')
  })

  it('26进制边界：YZ-YY-YZ', () => {
    expect(列转字母(674)).toBe('YY')
    expect(列转字母(675)).toBe('YZ')
  })

  it('26进制边界：ZY-ZZ', () => {
    // col=699 -> ZX (bijective 700 = 26*26+24)
    // col=700 -> ZY (bijective 701 = 26*26+25)
    // col=701 -> ZZ (bijective 702 = 26*26+26)
    expect(列转字母(699)).toBe('ZX')
    expect(列转字母(700)).toBe('ZY')
    expect(列转字母(701)).toBe('ZZ')
  })

  it('26进制边界：ZZ-AAA', () => {
    // 双字母最大 ZZ (bijective 702)
    // 三字母最小 AAA (bijective 703)
    expect(列转字母(702)).toBe('AAA')
    expect(列转字母(703)).toBe('AAB')
  })

  it('Excel最大列XFD（16384）', () => {
    // X = 24, F = 5, D = 3
    // bijective: 26*26^2 + 6*26 + 4 = 17576 + 156 + 4 = 17736
    // 0-indexed: XFD = 16383, bijective 16384
    expect(列转字母(16383)).toBe('XFD')
  })

  it('超大列号', () => {
    expect(列转字母(16384)).toBe('XFE')
    expect(列转字母(16385)).toBe('XFF')
  })

  it('非法输入', () => {
    expect(列转字母(-1)).toBe('')
    expect(列转字母(NaN)).toBe('')
    expect(列转字母(Infinity)).toBe('')
    expect(列转字母(-Infinity)).toBe('')
  })
})

describe('字母转列 - 边界值', () => {
  it('单字母', () => {
    expect(字母转列('A')).toBe(0)
    expect(字母转列('Z')).toBe(25)
  })

  it('双字母', () => {
    // bijective 值 - 1
    expect(字母转列('AA')).toBe(26)  // 27-1
    expect(字母转列('AZ')).toBe(51)  // 52-1
    expect(字母转列('ZX')).toBe(699) // 700-1
    expect(字母转列('ZY')).toBe(700) // 701-1
    expect(字母转列('ZZ')).toBe(701) // 702-1
  })

  it('三字母', () => {
    expect(字母转列('AAA')).toBe(702) // 703-1
    expect(字母转列('XFD')).toBe(16383)
  })

  it('非法输入', () => {
    expect(字母转列('')).toBe(-1)
    expect(字母转列('1')).toBe(-1)
    expect(字母转列('A1')).toBe(-1)
    expect(字母转列(' ')).toBe(-1)
  })
})

describe('地址换算 - 边界值', () => {
  it('大行列地址生成', () => {
    expect(生成地址(0, 699)).toBe('ZX1')
    expect(生成地址(0, 700)).toBe('ZY1')
    expect(生成地址(0, 701)).toBe('ZZ1')
    expect(生成地址(0, 702)).toBe('AAA1')
    expect(生成地址(999, 16383)).toBe('XFD1000')
  })

  it('大地址解析', () => {
    expect(解析地址('ZX1')).toEqual({ 行: 0, 列: 699 })
    expect(解析地址('ZY1')).toEqual({ 行: 0, 列: 700 })
    expect(解析地址('ZZ100')).toEqual({ 行: 99, 列: 701 })
    expect(解析地址('XFD16384')).toEqual({ 行: 16383, 列: 16383 })
  })

  it('大小写混合格式', () => {
    expect(解析地址('a1')).toEqual({ 行: 0, 列: 0 })
    expect(解析地址('z1')).toEqual({ 行: 0, 列: 25 })
    expect(解析地址('Aa1')).toEqual({ 行: 0, 列: 26 })
  })
})

describe('区域换算 - 边界值', () => {
  it('跨边界区域 A1 到 Z1', () => {
    const 区域1 = 展开区域('A1:Z1')
    expect(区域1.length).toBe(26)
    expect(区域1[0]).toEqual({ 行: 0, 列: 0 })
    expect(区域1[25]).toEqual({ 行: 0, 列: 25 })
  })

  it('跨AA边界的区域', () => {
    // Y1(col=24) 到 AB1(col=27) => Y, Z, AA, AB = 4个单元格
    const 区域 = 展开区域('Y1:AB1')
    expect(区域.length).toBe(4)
    expect(区域[0]).toEqual({ 行: 0, 列: 24 }) // Y
    expect(区域[1]).toEqual({ 行: 0, 列: 25 }) // Z
    expect(区域[2]).toEqual({ 行: 0, 列: 26 }) // AA
    expect(区域[3]).toEqual({ 行: 0, 列: 27 }) // AB
  })

  it('跨26²边界的区域', () => {
    // 规范化：min/max 取左上/右下
    const 规范化 = 规范化区域({ 行: 0, 列: 701 }, { 行: 1, 列: 25 })
    expect(规范化.起点.行).toBe(0)
    expect(规范化.起点.列).toBe(25) // min
    expect(规范化.终点.行).toBe(1)
    expect(规范化.终点.列).toBe(701) // max
  })

  it('区域地址生成 - 大坐标', () => {
    expect(生成区域地址({ 行: 0, 列: 0 }, { 行: 0, 列: 25 })).toBe('A1:Z1')
    // Z1 (col=25) 到 AA1 (col=26)
    expect(生成区域地址({ 行: 0, 列: 25 }, { 行: 0, 列: 26 })).toBe('Z1:AA1')
    // 单格退化
    expect(生成区域地址({ 行: 99, 列: 701 }, { 行: 99, 列: 701 })).toBe('ZZ100')
  })

  it('逆序区域规范化', () => {
    const 结果 = 规范化区域({ 行: 10, 列: 50 }, { 行: 5, 列: 25 })
    expect(结果.起点).toEqual({ 行: 5, 列: 25 })
    expect(结果.终点).toEqual({ 行: 10, 列: 50 })
  })
})

describe('列转字母与字母转列互逆', () => {
  it('覆盖全范围的互逆性', () => {
    const 字母范围 = ['A', 'Z', 'AA', 'AZ', 'BA', 'ZX', 'ZY', 'ZZ', 'AAA', 'XFD']
    for (const 字母 of 字母范围) {
      const 列 = 字母转列(字母)
      expect(列转字母(列)).toBe(字母)
    }
  })

  it('从列号到字母再回来的互逆性', () => {
    const 列范围 = [0, 1, 25, 26, 51, 52, 77, 78, 102, 699, 700, 701, 702, 703, 16383, 16384]
    for (const 列 of 列范围) {
      const 字母 = 列转字母(列)
      expect(字母转列(字母)).toBe(列)
    }
  })
})
