import { describe, expect, it } from 'vitest'
import { 创建工作表, 写入单元格, 清空单元格, 重算工作表, 重算工作簿, 设置格式, type Sheet } from './model'
const sheet = (cells: Record<string, string>, name = '数据'): Sheet => ({ ...创建工作表(name, 6, 6), 单元格: Object.fromEntries(Object.entries(cells).map(([address, value]) => [address, { 原始值: value, 显示值: value, 格式: {} }])) })
const values = (sheet: Sheet, addresses: string[]) => addresses.map(address => sheet.单元格[address]?.计算值 ?? sheet.单元格[address]?.显示值)
describe('workbook spill ownership and recalculation', () => {
  it('spills two dimensions, retains only the anchor expression and is idempotent', () => {
    const result = 重算工作表(sheet({ A1: '=SEQUENCE(3,2)' }))
    expect(values(result, ['A1','B1','A2','B2','A3','B3'])).toEqual([1,2,3,4,5,6])
    expect(result.单元格.A1.溢出范围).toBe('A1:B3')
    expect(result.单元格.B3).toMatchObject({ 原始值: '', 溢出锚点: 'A1' })
    expect(重算工作簿([result])[0]).toBe(result)
  })
  it('resizes and removes derived cells without removing their independent formatting', () => {
    let result = 重算工作表(sheet({ A1: '=SEQUENCE(D1,2)', D1: '3' }))
    result = 设置格式(result, 'B3:B3', { 加粗: true })
    result = 写入单元格(result,'D1','2')
    expect(result.单元格.A3).toBeUndefined()
    expect(result.单元格.B3).toMatchObject({ 原始值: '', 显示值: '', 格式: { 加粗: true } })
    expect(result.单元格.B3.溢出锚点).toBeUndefined()
    result = 清空单元格(result,['A1'])
    expect(result.单元格.B2).toBeUndefined()
    expect(result.单元格.B3.格式.加粗).toBe(true)
  })
  it('never overwrites a real cell or a formula returning empty text, and retries when unblocked', () => {
    let result = 重算工作表(sheet({ A1:'=SEQUENCE(2,2)',B2:'7' }))
    expect(result.单元格.A1).toMatchObject({ 显示值:'#SPILL!',溢出错误:'B2 阻塞溢出区域' })
    expect(result.单元格.B2.原始值).toBe('7')
    result = 清空单元格(result,['B2'])
    expect(result.单元格.B2.计算值).toBe(4)
    expect(重算工作表(sheet({A1:'=SEQUENCE(2,2)',B2:'=""'})).单元格.A1.显示值).toBe('#SPILL!')
  })
  it('merged cells block spilling; formatting alone does not', () => {
    const source = sheet({A1:'=SEQUENCE(2,2)'})
    expect(重算工作表({...source,合并区域:['B2:C2']}).单元格.A1.显示值).toBe('#SPILL!')
    expect(重算工作表(设置格式(source,'B2:B2',{填充颜色:'#fff'})).单元格.B2.计算值).toBe(4)
  })
  it('checks physical Excel bounds and bounds display allocation', () => {
    const source = sheet({XFD1048576:'=SEQUENCE(2,2)'})
    expect(重算工作表(source).单元格.XFD1048576.显示值).toBe('#SPILL!')
    expect(重算工作表(sheet({ A1:'=SEQUENCE(20000)' })).单元格.A1).toMatchObject({显示值:'#SPILL!',溢出错误:'展开区域超过本机安全显示上限'})
  })
  it('expands a small visible grid within the safe budget', () => {
    const source = {...sheet({D5:'=SEQUENCE(4,4)'}),行数:6,列数:6}
    const result = 重算工作表(source)
    expect(result.行数).toBe(8); expect(result.列数).toBe(7)
    expect(result.单元格.G8.计算值).toBe(16)
  })
  it('resolves forward child and # dependencies independently of object insertion order', () => {
    const result = 重算工作表(sheet({ D1:'=B2+1', E1:'=SUM(A1#)', A1:'=SEQUENCE(2,2)' }))
    expect(values(result,['D1','E1'])).toEqual([5,10])
  })
  it.each([false,true])('does not mistake speculative discovery for a cycle (reverse=%s)', reverse => {
    const entries: [string,string][] = [['A1','=SEQUENCE(2,,C1)'],['D1','=SEQUENCE(2,,A1)'],['F1','=D2+1'],['F2','=SUM(A1#)']]
    const result=重算工作表(sheet(Object.fromEntries(reverse?entries.reverse():entries)))
    expect(values(result,['A1','A2','D1','D2','F1','F2'])).toEqual([0,1,0,1,2,1])
  })
  it('keeps genuine independent circular arrays erroneous without contaminating normal blanks or partial errors', () => {
    const result=重算工作表(sheet({A1:'=SEQUENCE(2,,C1)',D1:'=SEQUENCE(2,,D1)',F1:'=IFERROR({1,2}/{1,0},7)',F3:'=C3+5'}))
    expect(values(result,['A1','A2','D1','F1','G1','F3'])).toEqual([0,1,'#错误',1,7,5])
  })
  it('retries speculative candidates through cross-sheet chains', () => {
    const source=sheet({A1:'=SEQUENCE(2,,C1)',D1:"=SEQUENCE(2,,'中间'!A1)"},'源表')
    const middle=sheet({A1:"='源表'!A1+10"},'中间')
    const output=sheet({A1:"='源表'!D2+1",C1:"=SUM('源表'!A1#)"},'输出')
    const result=重算工作簿([output,source,middle])
    expect(values(result[0],['A1','C1'])).toEqual([12,1])
    expect(values(result[1],['D1','D2'])).toEqual([10,11])
    expect(result[2].单元格.A1.计算值).toBe(10)
  })
  it('resolves cross-sheet arrays and broadcasts in the correct date context', () => {
    const first = {...sheet({A1:'=SEQUENCE(2,1,DATE(1904,1,1))'},'源表'),日期系统1904:true}
    const second = {...sheet({A1:"=YEAR('源表'!A1#)", C1:"=SUM('源表'!A1#)"},'结果'),日期系统1904:true}
    const result = 重算工作簿([second,first])
    expect(values(result[0],['A1','A2','C1'])).toEqual([1904,1904,1])
  })
  it('only anchors accept edits/deletion; deleting an entire selected array is allowed', () => {
    const result = 重算工作表(sheet({A1:'=SEQUENCE(2,2)'}))
    expect(()=>写入单元格(result,'B2','999')).toThrow(/锚点 A1/)
    expect(()=>清空单元格(result,['B2'])).toThrow(/锚点 A1/)
    const cleared = 清空单元格(result,['A1','B1','A2','B2'])
    expect(cleared.单元格.A1).toBeUndefined();expect(cleared.单元格.B2).toBeUndefined()
  })
  it('filters out erroneous source rows without confusing literal error-like text with real errors', () => {
    const result = 重算工作表(sheet({A1:'1',A2:'=1/0',A3:'3',B1:'1',B2:'0',B3:'1',D1:'=FILTER(A1:A3,B1:B3)',F1:'=IFERROR(A1:A3,0)'}))
    expect(values(result,['D1','D2','F1','F2','F3'])).toEqual([1,3,1,0,3])
    const literal=重算工作表(sheet({A1:'#N/A',C1:'=A1:A1'}))
    expect(literal.单元格.C1).toMatchObject({计算值:'#N/A'})
    expect(literal.单元格.C1.计算错误).toBeUndefined()
  })
  it('missing unsupported dynamic caches stay pending instead of manufacturing zero caches', () => {
    const source=sheet({A1:'=_xlfn.UNSUPPORTED_ARRAY()'})
    source.单元格.A1.公式来源={原始值:source.单元格.A1.原始值,结果:1,动态数组:true,数组范围:'A1:A2'}
    source.单元格.A2={原始值:'',显示值:'',格式:{加粗:true}}
    expect(重算工作表(source).单元格.A2).toMatchObject({显示值:'#待计算',公式状态:'待计算',格式:{加粗:true}})
  })
  it('preserves interior blank, zero and boolean future-function caches without coercing or blocking them', () => {
    const source=sheet({D1:'=B2+3',D2:'=ISBLANK(B1)',D3:'=A2=0',A1:'=_xlfn.UNSUPPORTED_ARRAY()'})
    source.单元格.A1.公式来源={原始值:source.单元格.A1.原始值,结果:1,动态数组:true,数组范围:'A1:B2',数组缓存:{B1:'',A2:0,B2:false}}
    const result=重算工作表(source)
    expect(values(result,['A1','B1','A2','B2','D1','D2','D3'])).toEqual([1,'',0,'FALSE',3,'FALSE','TRUE'])
    expect(result.单元格.B1).toMatchObject({溢出锚点:'A1',公式状态:'来源缓存'})
    expect(result.单元格.B2.布尔结果).toBe(false)
  })
  it('retains unsupported imported dynamic caches honestly and protects children', () => {
    const source = sheet({A1:'=_xlfn.UNSUPPORTED_ARRAY()',A2:'2',C1:'=SUM(A1#)'})
    source.单元格.A1.公式来源={原始值:source.单元格.A1.原始值,结果:1,数组范围:'A1:A2',动态数组:true}
    source.单元格.A2.溢出锚点='A1'
    const result = 重算工作表(source)
    expect(result.单元格.A1.公式状态).toBe('来源缓存')
    expect(result.单元格.A2).toMatchObject({计算值:2,溢出锚点:'A1',公式状态:'来源缓存'})
    expect(result.单元格.C1).toMatchObject({计算值:3,公式状态:'依赖缓存'})
  })
})
