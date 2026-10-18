import { describe, expect, it } from 'vitest'
import { 求值公式 } from './formula'
const cells: Record<string, number | string> = { A1: 3, B1: 'c', A2: 1, B2: 'a', A3: 2, B3: 'b', A4: 1, B4: 'a' }
const evaluate = (formula: string) => 求值公式(formula, address => cells[address] ?? '', new Set(), 'E1', { 取溢出: address => address === 'J1' ? [[1, 2], [3, 4]] : [] })
describe('bounded two-dimensional dynamic arrays', () => {
  it.each([
    ['=WORKDAY(SEQUENCE(2,1,0),1)',[[3],[3]]],
    ['=WORKDAY(SEQUENCE(2,1,0),1,{3;4})',[[5],[5]]],
    ['=WORKDAY.INTL(SEQUENCE(2,1,0),1,11)',[[1],[3]]],
    ['=WORKDAY.INTL(SEQUENCE(2,1,0),{1;2},11,{3;4})',[[1],[6]]],
    ['=NETWORKDAYS({0;1},{3;4})',[[2],[2]]],
    ['=NETWORKDAYS({0;1},{3;4},{3;4})',[[1],[0]]],
    ['=NETWORKDAYS.INTL({0;1},{3;4},7)',[[2],[3]]],
    ['=NETWORKDAYS.INTL({0;1},{3;4},7,{3;4})',[[1],[1]]],
  ])('broadcasts date/day/weekend roles and preserves the whole holiday range: %s',(formula,matrix)=>{
    const result=求值公式(String(formula),()=>'',new Set(),'A1',{日期系统1904:true})
    expect(result.错误).toBe(false);expect(result.数组).toEqual(matrix)
  })
  it('retains 1900 scalar semantics, holiday ranges, per-element errors and incompatible shape errors',()=>{
    expect(evaluate('=WORKDAY(SEQUENCE(2,1,DATE(2024,1,5)),1)').数组).toEqual([[45299],[45299]])
    expect(evaluate('=WORKDAY(DATE(2024,1,5),1)')).toEqual({值:45299,错误:false})
    expect(evaluate('=IFERROR(WORKDAY.INTL({1;2},1,{1;1111111}),"错误")').数组).toEqual([[2],['错误']])
    expect(evaluate('=WORKDAY({1;2},{1;2;3})').错误).toBe(true)
    expect(evaluate('=1/0')).toEqual({值:'#错误',错误:true})
  })
  it.each([
    ['=SEQUENCE(2,3,10,-2)', [[10, 8, 6], [4, 2, 0]]],
    ['=SEQUENCE(,3)', [[1, 2, 3]]],
    ['={1,2;3,4}*2+1', [[3, 5], [7, 9]]],
    ['={1;2;3}+{10,20}', [[11, 21], [12, 22], [13, 23]]],
    ['=FILTER(A1:B4,A1:A4>1)', [[3, 'c'], [2, 'b']]],
    ['=FILTER(A1:B4,(A1:A4>1)*(A1:A4<3))', [[2, 'b']]],
    ['=FILTER({1,2;3,4},{TRUE,FALSE})', [[1], [3]]],
    ['=SORT(A1:B4)', [[1, 'a'], [1, 'a'], [2, 'b'], [3, 'c']]],
    ['=SORT(A1:B4,2,-1)', [[3, 'c'], [2, 'b'], [1, 'a'], [1, 'a']]],
    ['=SORTBY(A1:B4,A1:A4,-1,B1:B4,1)', [[3, 'c'], [2, 'b'], [1, 'a'], [1, 'a']]],
    ['=UNIQUE(A1:B4)', [[3, 'c'], [1, 'a'], [2, 'b']]],
    ['=UNIQUE(A1:B4,,TRUE)', [[3, 'c'], [2, 'b']]],
    ['=TRANSPOSE({1,2,3;4,5,6})', [[1, 4], [2, 5], [3, 6]]],
    ['=SORT(UNIQUE(A1:A4))', [[1], [2], [3]]],
    ['=LEN({"😀𠀀","中文";"abc","é"})', [[2, 2], [3, 2]]],
    ['=IF({TRUE;FALSE},SEQUENCE(2,2),0)', [[1, 2], [0, 0]]],
    ['=IF(TRUE,SEQUENCE(2),1/0)', [[1], [2]]],
    ['=J1#', [[1, 2], [3, 4]]],
    ['=_xlfn.ANCHORARRAY(J1)', [[1, 2], [3, 4]]],
    ['=TAKE(SEQUENCE(3,3),-2,2)', [[4, 5], [7, 8]]],
    ['=DROP(SEQUENCE(3,3),1,-1)', [[4, 5], [7, 8]]],
    ['=CHOOSECOLS(SEQUENCE(2,3),3,1,-2)', [[3, 1, 2], [6, 4, 5]]],
    ['=CHOOSEROWS(SEQUENCE(3,2),-1,1)', [[5, 6], [1, 2]]],
    ['=HSTACK({1;2},{3;4})', [[1, 3], [2, 4]]],
    ['=VSTACK({1,2},{3,4})', [[1, 2], [3, 4]]],
    ['=TOCOL({1,2;3,4},0,TRUE)', [[1], [3], [2], [4]]],
    ['=TOROW({1,2;3,4})', [[1, 2, 3, 4]]],
    ['=EXPAND({1,2},2,3,0)', [[1, 2, 0], [0, 0, 0]]],
    ['=WRAPROWS({1,2,3,4,5},3,0)', [[1, 2, 3], [4, 5, 0]]],
    ['=WRAPCOLS({1,2,3,4,5},3,0)', [[1, 4], [2, 5], [3, 0]]],
    ['=IFERROR(1/{0;2},9)', [[9],[0.5]]],
    ['=IF({TRUE,FALSE},1/{0,0},{7,8})', [['#DIV/0!',8]]],
    ['=ISERROR(1/{0;2})', [[true],[false]]],
    ['=INDEX(A1:B4,0,2)', [['c'],['a'],['b'],['a']]],
    ['=XLOOKUP(2,A1:A4,A1:B4)', [[2,'b']]],
    ['=IFERROR({"#N/A";1},9)', [['#N/A'],[1]]],
  ])('%s', (formula, expected) => { const result = evaluate(formula as string); expect(result.错误).toBe(false); expect(result.数组).toEqual(expected) })
  it('returns genuine empty/mismatched array errors and keeps computation bounded', () => {
    expect(evaluate('=FILTER(A1:B4,A1:A4>99)')).toMatchObject({ 值: '#CALC!', 错误: true })
    expect(evaluate('=FILTER(A1:B4,{TRUE;FALSE})')).toMatchObject({ 值: '#VALUE!', 错误: true })
    expect(evaluate('=FILTER(A1:B4,A1:A4>99,"无结果")')).toMatchObject({ 值: '无结果', 错误: false })
    expect(evaluate('=SEQUENCE(100001)')).toMatchObject({ 未支持: true })
    expect(evaluate('=1/0')).toMatchObject({ 值: '#错误', 错误: true })
    expect(evaluate('=IFERROR(FILTER(A1:B4,A1:A4>99),"无结果")')).toMatchObject({ 值: '无结果', 错误: false })
  })
})
