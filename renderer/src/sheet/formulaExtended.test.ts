import { describe, expect, it } from 'vitest'
import { 已支持公式函数, 求值公式 } from './formula'
import { localDateToExcelSerial } from './formulaDates'
import { formulaFixtureCells, formulaGoldenCases } from './formulaFixtures'

const read = (address: string, sheet?: string) => !sheet || sheet.toLowerCase() === 'data' ? formulaFixtureCells[address] ?? '' : '#REF!'
describe('明确审核的标量函数扩展', () => {
  it.each(formulaGoldenCases)('%s = %s', (formula, expected) => {
    const actual = 求值公式(formula, read)
    expect(actual.错误, formula).toBe(false)
    if (typeof expected === 'number') expect(actual.值 as number).toBeCloseTo(expected, 7)
    else expect(actual.值).toBe(expected)
  })
  it('清单超过一百种，排除 JavaScript helper、环境函数、volatile 与未实现的函数', () => {
    expect(已支持公式函数.length).toBeGreaterThan(100)
    for (const name of ['UTILS', 'CONSTRUCTOR', 'WEBSERVICE', 'EVAL', 'NOW', 'TODAY', 'RAND', 'LINEST']) expect(求值公式(`=${name}(1)`, read)).toMatchObject({ 错误: true, 未支持: true })
  })
  it('二维矩阵行列不会按展平数组误查找，也不把数组结果伪造为首个标量', () => {
    expect(求值公式('=INDEX(Data!A1:C4,4,2)', read)).toEqual({ 值: 4, 错误: false })
    expect(求值公式('=INDEX(Data!J1:M1,3)', read)).toEqual({ 值: 3, 错误: false })
    expect(求值公式('=INDEX(Data!A1:C4,2)',read).数组).toEqual([[20,2,'b']])
    expect(求值公式('=INDEX(Data!A1:C4,0,2)',read).数组).toEqual([[1],[2],[3],[4]])
    expect(求值公式('=Data!A1:C4',read).数组).toEqual([[10,1,'a'],[20,2,'b'],[30,3,'a'],[40,4,'c']])
    expect(求值公式('=ABS(Data!A1:A4)',read).数组).toEqual([[10],[20],[30],[40]])
    expect(求值公式('=SUM(Data!A1:A4*Data!B1:B4)',read)).toEqual({值:300,错误:false})
    expect(求值公式('=VLOOKUP(99,Data!A1:C4,3,FALSE)', read)).toMatchObject({ 错误: true })
    expect(求值公式('=SUMIFS(Data!A1:A4,Data!A1:B2,1)', read)).toMatchObject({ 错误: true })
  })
  it('库返回 Error 是计算错误，IFERROR/IFNA/ISERROR 惰性检查，未知函数保持缓存回退语义', () => {
    expect(求值公式('=SQRT(-1)', read)).toEqual({ 值: '#错误', 错误: true })
    expect(求值公式('=1/0', read)).toEqual({ 值: '#错误', 错误: true })
    expect(求值公式('=IFERROR(SQRT(-1),"可处理")', read)).toEqual({ 值: '可处理', 错误: false })
    expect(求值公式('=IFNA(VLOOKUP(99,Data!A1:C4,2,FALSE),7)', read)).toEqual({ 值: 7, 错误: false })
    expect(求值公式('=ISERROR(SQRT(-1))', read)).toEqual({ 值: 'TRUE', 错误: false })
    expect(求值公式('=ISNA(NA())', read)).toEqual({ 值: 'TRUE', 错误: false })
    expect(求值公式('=ISERR(NA())', read)).toEqual({ 值: 'FALSE', 错误: false })
    expect(求值公式('=ISERROR()', read)).toEqual({ 值: '#错误', 错误: true })
    expect(求值公式('=IF(TRUE,42,UNKNOWN())', read)).toEqual({ 值: 42, 错误: false })
    expect(求值公式('=IFERROR(UNKNOWN(),7)', read)).toMatchObject({ 错误: true, 未支持: true })
    expect(求值公式('=ISERROR(UNKNOWN())', read)).toMatchObject({ 错误: true, 未支持: true })
  })
  it('中文、emoji、扩展汉字、组合音标保持 Unicode 码点边界', () => {
    expect(求值公式('=LEN("😀𠀀👩🏽‍💻é")', read).值).toBe(8)
    expect(求值公式('=LEFT("😀𠀀中文",2)', read).值).toBe('😀𠀀')
    expect(求值公式('=RIGHT("文😀𠀀",2)', read).值).toBe('😀𠀀')
    expect(求值公式('=MID("文😀𠀀尾",2,2)', read).值).toBe('😀𠀀')
    expect(求值公式('=FIND("尾","文😀𠀀尾")', read).值).toBe(4)
    expect(求值公式('=XLOOKUP("a*",Data!C1:C4,Data!A1:A4,99)', read).值).toBe(99)
    expect(求值公式('=SEARCH("a?b","前a😀b尾")', read).值).toBe(2)
    expect(求值公式('=SEARCH("a~*b","前a*b尾")', read).值).toBe(2)
    expect(求值公式('=MATCH("a*",Data!C1:C4,0)', read).值).toBe(1)
  })
  it('ROUND 半数远离零，科学计数和十进制误差不破坏边界', () => {
    for (const [formula, expected] of [['=ROUND(-1.005,2)', -1.01], ['=ROUND(1.005,2)', 1.01], ['=ROUND(-150,-2)', -200], ['=ROUND(1e-7,8)', 1e-7], ['=ROUND(-0.1,0)', 0]] as const) expect(求值公式(formula, read).值).toBe(expected)
  })
  it('T.DIST 正确接收 cumulative 布尔参数，并支持负 x 与密度值', () => {
    expect(求值公式('=T.DIST(-1,1,TRUE)', read).值).toBeCloseTo(0.25, 8)
    expect(求值公式('=T.DIST(0,1,FALSE)', read).值).toBeCloseTo(1 / Math.PI, 8)
    expect(求值公式('=T.DIST.RT(-1,1)', read).值).toBeCloseTo(0.75, 8)
    expect(求值公式('=T.DIST.2T(1,1)', read).值).toBeCloseTo(0.5, 8)
  })
  it.each([
    ['=DATE(1900,2,29)', 60], ['=DATE(1900,1,60)', 60], ['=DATE(1900,3,0)', 60], ['=DATE(1900,3,1)', 61], ['=YEAR(60)', 1900], ['=MONTH(60)', 2], ['=DAY(60)', 29],
    ['=DATE(0,1,1)', 1], ['=DATE(100,1,1)', 36526], ['=DATE(1899,1,1)', 693598], ['=DATE(9999,12,31)', 2958465], ['=DAY(0)', 0], ['=WEEKDAY(1)', 1],
  ])('Excel 1900 兼容规则 %s = %s', (formula, expected) => expect(求值公式(formula as string, read)).toEqual({ 值: expected, 错误: false }))
  it('日期转换使用本地日历分量，非法日期和年份上界不悄悄滚动', () => {
    expect(localDateToExcelSerial(new Date(2024, 0, 1))).toBe(45292)
    expect(localDateToExcelSerial(new Date(2024, 1, 29, 12))).toBe(45351.5)
    for (const formula of ['=DATE(10000,1,1)', '=DATE(9999,12,32)', '=DATE(-1,1,1)', '=DATEVALUE("2023-02-29")', '=EDATE(DATE(9999,12,31),1)']) expect(求值公式(formula, read)).toMatchObject({ 错误: true })
    expect(求值公式('=HOUR(0.99999999)', read).值).toBe(23)
    expect(求值公式('=MINUTE(0.99999999)', read).值).toBe(59)
    expect(求值公式('=SECOND(0.99999999)', read).值).toBe(59)
  })
  it('高代价计算与单元格文本有界，非法参数及时返回而非递归或分配巨量内存', () => {
    expect(求值公式('=FACT(1e100)', read)).toMatchObject({ 错误: true })
    expect(求值公式('=FACTDOUBLE(1e100)', read)).toMatchObject({ 错误: true })
    expect(求值公式('=REPT("x",1e100)', read)).toMatchObject({ 错误: true })
    expect(求值公式('=POISSON.DIST(1e100,3,TRUE)', read)).toMatchObject({ 错误: true, 未支持: true })
    expect(求值公式('=COMBIN(1000000,2)', read).值).toBe(499999500000)
    expect(求值公式('=LCM(9999991,2)', read).值).toBe(19999982)
  })
})
