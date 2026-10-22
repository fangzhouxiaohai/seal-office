import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { 从Html表格构建工作表 } from './sheetImport'
import { 导出为Xlsx, 导出为Html表格 } from './sheetExport'
import { 写入单元格, 清空单元格, 设置格式, 设置页面设置 } from './model'
import RichCellText from './RichCellText'
const require = createRequire(import.meta.url)
const ExcelJS = require('exceljs')
const { 读取xlsx, 写入xlsx } = require('../../../main/office/xlsxCodec')
const margins = {left:.75,right:.75,top:1,bottom:1,header:.511811023622047,footer:.511811023622047}
const load = (result: any) => result.工作表列表.map((s: any) => 从Html表格构建工作表(s.html,s.名称,s.页面设置,s.元数据)!)

it('富文本、字符集、默认对齐、自定义页边距经过编辑和保存重开保留；编辑富文本不复活旧文字', async () => {
  const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('报名表')
  book.addWorksheet('空表').pageSetup.margins = margins
  sheet.pageSetup.margins = margins
  sheet.getCell('A1').value = {richText:[{text:'编号：',font:{name:'宋体',size:11,charset:134}},{text:'001𠮷',font:{name:'宋体',size:16,bold:true,color:{argb:'FFCC0000'}}}]}
  sheet.getCell('A1').alignment = {horizontal:'general',indent:0,shrinkToFit:false,textRotation:0}
  const imported = await 读取xlsx(await book.xlsx.writeBuffer())
  expect(imported.警告).toEqual([])
  const sheets = load(imported)
  expect(sheets[0].单元格.A1.原始值).toBe('编号：001𠮷')
  const view=render(<RichCellText cell={sheets[0].单元格.A1}/> )
  expect(view.getByText('001𠮷')).toHaveStyle({fontSize:'16px',fontWeight:600,color:'#cc0000'})
  const print=导出为Html表格(sheets[0],'打印')
  expect(print).toContain('margin:1in 0.75in 1in 0.75in')
  expect(print).toContain('font-size: 16px')
  expect(print).toContain('001𠮷')
  sheets[0] = 写入单元格(sheets[0],'B2','测试修改')
  const saved = await 写入xlsx(导出为Xlsx(sheets)), reopened = await 读取xlsx(saved)
  expect(reopened.警告).toEqual([])
  expect(reopened.工作表列表).toHaveLength(2)
  expect(reopened.工作表列表[0].元数据.单元格富文本.A1).toEqual(imported.工作表列表[0].元数据.单元格富文本.A1)
  expect(reopened.工作表列表[0].页面设置.自定义页边距).toEqual(margins)
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(saved)
  expect(workbook.worksheets[0].getCell('A1').value.richText[0].font.charset).toBe(134)
  // OOXML may omit default alignment; an absent horizontal attribute is General.
  expect(workbook.worksheets[0].getCell('A1').alignment?.horizontal ?? 'general').toBe('general')
  expect(写入单元格(sheets[0],'A1','新内容').单元格.A1.富文本).toBeUndefined()
  expect(清空单元格(sheets[0],['A1']).单元格.A1?.富文本).toBeUndefined()
  expect(设置格式(sheets[0],'A1:A1',{加粗:false}).单元格.A1.富文本?.every(run=>run.格式?.加粗===false)).toBe(true)
  expect(设置页面设置(sheets[0],{页边距:'窄'}).页面设置?.自定义页边距).toBeUndefined()
})

it.skipIf(!process.env.SEAL_XLS_SAMPLE)('用户原始 XLS 经本机转换、实际编辑模型、XLS 保存再开', async () => {
  require.cache[require.resolve('electron')] = {exports:{app:{isPackaged:false}}} as any
  const { 转换文档 } = require('../../../main/office/nativeConversion')
  const bytes=readFileSync(process.env.SEAL_XLS_SAMPLE!)
  const imported=await 读取xlsx(await 转换文档(bytes,'xls','xlsx','table'))
  expect(imported.警告).toEqual([])
  const sheets=load(imported)
  // The BIFF converter canonicalizes legacy charset hints; compare Unicode text
  // and visible font properties. XLSX charset byte preservation is tested above.
  const visible=(s:any)=>({name:s.name,page:s.页面设置,merges:s.合并区域,
    cells:Object.fromEntries(Object.entries(s.单元格).filter(([address,cell]:any)=>address!=='B5'&&cell.原始值!=='').map(([address,cell]:any)=>[address,{
      value:cell.原始值,display:cell.显示值,
      rich:cell.富文本?.map((run:any)=>({文本:run.文本,格式:Object.fromEntries(Object.entries(run.格式??{}).filter(([key])=>key!=='字体元数据'))})),
    }]))})
  const before=sheets.map(visible)
  sheets[0]=写入单元格(sheets[0],'B5','回归测试𠮷')
  const saved=await 转换文档(await 写入xlsx(导出为Xlsx(sheets)),'xlsx','xls','table')
  const reopened=await 读取xlsx(await 转换文档(saved,'xls','xlsx','table'))
  expect(reopened.警告).toEqual([])
  const result=load(reopened)
  expect(result[0].单元格.B5.原始值).toBe('回归测试𠮷')
  expect(result.map(visible)).toEqual(before)
},180000)
