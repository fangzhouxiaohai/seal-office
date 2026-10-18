import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { 求值公式 } from './formula'
import { 创建工作表, 批量写入单元格, 写入单元格, 重算工作簿, type Sheet } from './model'
import { 从Html表格构建工作表 } from './sheetImport'
import { 导出为Xlsx } from './sheetExport'
const codec=createRequire(import.meta.url)('../../../main/office/xlsxCodec.js')
const read=async(bytes:Uint8Array):Promise<Sheet[]>=>{const book=await codec.读取xlsx(bytes);return 重算工作簿(book.工作表列表.map((sheet:any)=>从Html表格构建工作表(sheet.html,sheet.名称,sheet.页面设置,sheet.元数据)!))}
describe('installed WPS calculation-rule compatibility',()=>{
  it.each([
    ['=LEN("😀𠀀中文")',6],['=LEFT("😀甲",1)','\ud83d'],['=LEFT("😀甲",2)','😀'],['=RIGHT("甲😀",1)','\ude00'],['=RIGHT("甲😀",2)','😀'],['=MID("😀甲",2,1)','\ude00'],['=MID("😀甲",3,1)','甲'],['=FIND("甲","😀甲")',3],['=SEARCH("甲","😀甲")',3],['=REPLACE("😀甲",3,1,"乙")','😀乙'],
  ])('matches native WPS UTF16 evidence for %s',(formula,expected)=>{
    const result=求值公式(String(formula),()=>'',new Set(),'A1',{公式兼容模式:'WPS'})
    expect(result).toEqual({值:expected,错误:false})
  })
  it('does not change default Unicode code-point semantics and propagates mode into lazy child parsers',()=>{
    expect(求值公式('=LEN("😀𠀀中文")',()=>'' )).toEqual({值:4,错误:false})
    expect(求值公式('=IF(TRUE,LEN("😀"),1/0)',()=>'',new Set(),'A1',{公式兼容模式:'WPS'})).toEqual({值:2,错误:false})
  })
  it('direct referenced blanks keep WPS empty text while default Excel mode spills zero',()=>{
    const base=批量写入单元格(创建工作表('规则',6,6),{A1:'1',A2:'2',B2:'3',D1:'=A1:B2'})
    expect(base.单元格.E1.计算值).toBe(0)
    expect(重算工作簿([{...base,公式兼容模式:'WPS'}])[0].单元格.E1.计算值).toBe('')
  })
  it('native XLSX persists explicit mode, and isolated surrogate results omit illegal caches without losing expressions',async()=>{
    const source=批量写入单元格({...创建工作表('规则',6,6),公式兼容模式:'WPS'},{A1:'=LEN("😀")',B1:'=LEFT("😀甲",1)',C1:'=MID("😀甲",2,1)'})
    const exported=导出为Xlsx(source)!,bytes=await codec.写入xlsx(exported),zip=await JSZip.loadAsync(bytes)
    expect(exported.工作表[0].数据[0][1]).toMatchObject({公式:'LEFT("😀甲",1)'})
    expect((exported.工作表[0].数据[0][1] as any).结果).toBeUndefined()
    expect(await zip.file('docProps/custom.xml')!.async('string')).toContain('SealFormulaCompatibility')
    const reopened=(await read(bytes))[0]
    expect(reopened.公式兼容模式).toBe('WPS');expect(reopened.单元格.A1.计算值).toBe(2)
    expect(reopened.单元格.B1.计算值?.toString().charCodeAt(0)).toBe(55357)
    const excel=(await read(await codec.写入xlsx(导出为Xlsx({...reopened,公式兼容模式:'Excel'}))))[0]
    expect(excel.公式兼容模式).toBe('Excel');expect(excel.单元格.A1.计算值).toBe(1);expect(excel.单元格.B1.计算值).toBe('😀')
  })
  it('recognizes concrete WPS build + CalculationRule=0 source markers even if Application says Microsoft Excel',async()=>{
    const zip=await JSZip.loadAsync(await codec.写入xlsx({工作表:[{名称:'来源',数据:[[{公式:'LEN("😀")',结果:2}]]}]}))
    zip.file('docProps/custom.xml','<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property name="KSOProductBuildVer"><vt:lpwstr>2052-12.1.0.26895</vt:lpwstr></property><property name="CalculationRule"><vt:i4>0</vt:i4></property></Properties>')
    const source=(await read(await zip.generateAsync({type:'uint8array'})))[0]
    expect(source.公式兼容模式).toBe('WPS');expect(source.单元格.A1.计算值).toBe(2)
  })
  it('imports actual synthetic WPS-native # file and recomputes both arrays after an anchor edit',async()=>{
    const bytes=readFileSync('renderer/src/sheet/fixtures/wps-native-spill.xlsx')
    const source=(await read(bytes))[0]
    expect(source.单元格.B3.计算值).toBe(6);expect(source.单元格.F2.计算值).toBe(6)
    const edited=写入单元格(source,'A1','=SEQUENCE(3,2,10)')
    expect(edited.单元格.F2.计算值).toBe(15)
    const reopened=(await read(await codec.写入xlsx(导出为Xlsx(edited))))[0]
    expect(reopened.单元格.F2.计算值).toBe(15);expect(reopened.单元格.D1.原始值).toMatch(/ANCHORARRAY/i)
  })
})
