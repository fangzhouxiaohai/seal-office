import { createRequire } from 'node:module'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { 从Html表格构建工作表 } from './sheetImport'
import { 导出为Xlsx, 导出为Csv } from './sheetExport'
import { 创建工作表, 写入单元格, 重算工作簿, 插入行, 插入列, type Sheet } from './model'
const { 读取xlsx, 写入xlsx } = createRequire(import.meta.url)('../../../main/office/xlsxCodec.js')
const { 规范公式函数名 } = createRequire(import.meta.url)('../../../main/office/xlsxFunctionNames.js')
async function read(bytes: Uint8Array): Promise<Sheet[]> {
  const decoded = await 读取xlsx(bytes)
  return 重算工作簿(decoded.工作表列表.map((sheet: {html:string;名称:string;页面设置:any;元数据:any})=>从Html表格构建工作表(sheet.html,sheet.名称,sheet.页面设置,sheet.元数据)!))
}
describe('real dynamic XLSX metadata and caches', () => {
  it('writes native dynamic array XML, caches every child, imports and actually recomputes after input edits', async () => {
    let sheet = 写入单元格(创建工作表('动态数组'), 'D1','3')
    sheet = 写入单元格(sheet,'A1','=SEQUENCE(D1,2,10)')
    const model = 导出为Xlsx(sheet)!
    expect(model.工作表[0].数据[0][0]).toMatchObject({公式:'SEQUENCE(D1,2,10)',数组范围:'A1:B3',动态数组:true,结果:10})
    expect(model.工作表[0].数据[2][1]).toMatchObject({值:15})
    const bytes = await 写入xlsx(model), zip = await JSZip.loadAsync(bytes)
    const xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(xml).toMatch(/<c r="A1"[^>]*cm="1"/)
    expect(xml).toMatch(/<f t="array" ref="A1:B3">_xlfn.SEQUENCE\(D1,2,10\)<\/f>/)
    expect(await zip.file('xl/metadata.xml')!.async('string')).toContain('XLDAPR')
    const initial = (await read(bytes))[0]
    expect(initial.单元格.B3).toMatchObject({计算值:15,溢出锚点:'A1'})
    const edited = 写入单元格(initial,'D1','2')
    const reopened = (await read(await 写入xlsx(导出为Xlsx(edited))))[0]
    expect(reopened.单元格.A1.溢出范围).toBe('A1:B2')
    expect(reopened.单元格.B2.计算值).toBe(13)
    expect(reopened.单元格.B3?.溢出锚点).toBeUndefined()
  })
  it('converts public # references to OOXML ANCHORARRAY without touching strings, sheet names or structured fields', () => {
    expect(规范公式函数名('SUM(A1#)+SUM(\'中 文\'!$B$2#)&"A1#"&Table1[Column#]')).toBe('SUM(_xlfn.ANCHORARRAY(A1))+SUM(_xlfn.ANCHORARRAY(\'中 文\'!$B$2))&"A1#"&Table1[Column#]')
    expect(规范公式函数名('[Other.xlsx]Sheet1!A1#')).toBe('[Other.xlsx]Sheet1!A1#')
  })
  it('cross-sheet # references survive native XLSX save/reopen and recompute when an anchor changes', async () => {
    const source=写入单元格(创建工作表('源 表'),'A1','=SEQUENCE(2,2)')
    const result=写入单元格(创建工作表('结果'),'A1',"=TRANSPOSE('源 表'!A1#)")
    const initial=await read(await 写入xlsx(导出为Xlsx([source,result])))
    expect(initial[1].单元格.A1.原始值).toBe("=TRANSPOSE(_xlfn.ANCHORARRAY('源 表'!A1))")
    expect(initial[1].单元格.B2.计算值).toBe(4)
    const edited=重算工作簿([写入单元格(initial[0],'A1','=SEQUENCE(2,2,10)'),initial[1]])
    expect(edited[1].单元格.A2.计算值).toBe(11)
    expect((await read(await 写入xlsx(导出为Xlsx(edited))))[1].单元格.B2.计算值).toBe(13)
  })
  it('imports standard dynamic cached strings with formatting as derived results instead of blockers', async () => {
    const bytes=await 写入xlsx({工作表:[{名称:'文本',数据:[[{公式:'TRANSPOSE({"甲";"乙"})',结果:'旧缓存',数组范围:'A1:B1',动态数组:true},{值:'旧乙',格式:{加粗:true}}]]}]})
    const imported=(await read(bytes))[0]
    expect(imported.单元格.A1.计算值).toBe('甲')
    expect(imported.单元格.B1).toMatchObject({计算值:'乙',溢出锚点:'A1',格式:{加粗:true}})
    expect(imported.单元格.A1.公式状态).toBeUndefined()
  })
  it('preserves genuine boolean/error child caches for unsupported dynamic formulas without pretending to recalculate', async () => {
    const bytes=await 写入xlsx({工作表:[{名称:'未知',数据:[[{公式:'_xlfn.UNSUPPORTED_ARRAY()',结果:1,数组范围:'A1:C1',动态数组:true},{值:false},{值:{error:'#N/A'}}]]}]})
    const initial=(await read(bytes))[0]
    expect(initial.单元格.B1).toMatchObject({计算值:'FALSE',布尔结果:false,公式状态:'来源缓存',溢出锚点:'A1'})
    expect(initial.单元格.C1).toMatchObject({计算值:'#N/A',计算错误:true,公式状态:'来源缓存'})
    const saved=await 写入xlsx(导出为Xlsx(initial)), zip=await JSZip.loadAsync(saved), xml=await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(xml).toMatch(/<c r="B1"[^>]*t="b"><v>0<\/v><\/c>/)
    expect(xml).toMatch(/<c r="C1"[^>]*t="e"><v>#N\/A<\/v><\/c>/)
    expect((await read(saved))[0].单元格.B1.布尔结果).toBe(false)
  })
  it('writes real #SPILL! errors without overwriting blockers and retries after reopening', async () => {
    const sheet={...创建工作表('阻塞'),单元格:{A1:{原始值:'=SEQUENCE(2,2)',显示值:'',格式:{}},B2:{原始值:'保留此值',显示值:'保留此值',格式:{}}}}
    const bytes=await 写入xlsx(导出为Xlsx(sheet)), zip=await JSZip.loadAsync(bytes), xml=await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(xml).toMatch(/<c r="A1"[^>]*t="e"[^>]*>.*?<v>#SPILL!<\/v>/)
    const initial=(await read(bytes))[0]
    expect(initial.单元格.A1.显示值).toBe('#SPILL!');expect(initial.单元格.B2.原始值).toBe('保留此值')
  })
  it('keeps an empty FILTER #CALC! result a native dynamic anchor so later input changes can spill',async()=>{
    const source=写入单元格(创建工作表('空结果'),'A1','=FILTER({1;2},{0;0})')
    expect(source.单元格.A1).toMatchObject({显示值:'#CALC!',动态数组:true,计算错误:true})
    const bytes=await 写入xlsx(导出为Xlsx(source)),zip=await JSZip.loadAsync(bytes),xml=await zip.file('xl/worksheets/sheet1.xml')!.async('string')
    expect(xml).toMatch(/<c r="A1"[^>]*cm="1"/);expect(xml).toContain('<v>#CALC!</v>')
    const reopened=(await read(bytes))[0]
    expect(写入单元格(reopened,'A1','=FILTER({1;2},{1;1})').单元格.A2.计算值).toBe(2)
  })
  it('does not allocate absent cache rows or a giant grid from an imported dynamic array ref',async()=>{
    const bytes=await 写入xlsx({工作表:[{名称:'缺缓存',数据:[[{公式:'_xlfn.UNKNOWN_ARRAY()',结果:7,动态数组:true,数组范围:'A1:A20000'}]]}]})
    const decoded=await 读取xlsx(bytes)
    expect((decoded.html.match(/<tr>/g)??[]).length).toBe(1)
    const imported=(await read(bytes))[0]
    expect(imported.行数*imported.列数).toBeLessThanOrEqual(100000)
    expect(imported.单元格.A1).toMatchObject({显示值:'#SPILL!',溢出错误:'展开区域超过本机安全显示上限'})
    const giant=await 写入xlsx({工作表:[{名称:'巨大元数据',数据:[[{公式:'_xlfn.UNKNOWN_ARRAY()',结果:7,动态数组:true,数组范围:'A1:XFD1048576'}]]}]})
    const foreign=await 读取xlsx(giant),sheet=(await read(giant))[0]
    expect(foreign.警告).toContain('部分动态数组区域超过安全上限，未完整导入其缓存')
    expect(sheet.行数).toBe(10);expect(sheet.列数).toBe(6)
    expect(sheet.单元格.A1).toMatchObject({计算值:7,公式状态:'来源缓存'})
    expect(导出为Xlsx(sheet)!.工作表[0].数据[0][0]).toMatchObject({公式:'_xlfn.UNKNOWN_ARRAY()',结果:7,数组范围:'A1:XFD1048576',动态数组:true})
    const wide=(await read(await 写入xlsx({工作表:[{名称:'宽数组',数据:[[{公式:'_xlfn.UNKNOWN_ARRAY()',结果:7,动态数组:true,数组范围:'A1:XFD1'}]]}]})))[0]
    expect(wide.行数*wide.列数).toBeLessThanOrEqual(100000)
    expect(wide.单元格.A1.显示值).toBe('#SPILL!')
  })
  it('preserves spill semantics after row/column structure changes and exports evaluated CSV values', async () => {
    const source=写入单元格(创建工作表('数据'),'B2','=SEQUENCE(2,2)')
    const changed=重算工作簿([插入列(插入行(source,0),0)])[0]
    expect(changed.单元格.C3.溢出范围).toBe('C3:D4')
    expect(changed.单元格.D4.计算值).toBe(4)
    const reopened=(await read(await 写入xlsx(导出为Xlsx(changed))))[0]
    expect(reopened.单元格.D4.计算值).toBe(4)
    expect(导出为Csv(reopened)).toContain(',,3,4')
  })
})
