import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
test('mobile full-conversion adapter preserves the private BIFF sample through edit/save/reopen', {skip:!process.env.SEAL_XLS_SAMPLE,timeout:180000},async()=>{
  require.cache[require.resolve('electron')]={exports:{app:{isPackaged:false}}}
  const native=require('../../main/office/nativeConversion.js'),mobile=require('../web/nativeConversion.cjs'),{读取xlsx}=require('../../main/office/xlsxCodec.js'),ExcelJS=require('exceljs')
  const original=fs.readFileSync(process.env.SEAL_XLS_SAMPLE),copy=Buffer.from(original)
  mobile.configureConversion({canUseRemote:()=>true,remote:native.转换文档})
  const converted=await mobile.转换文档(original,'xls','xlsx','table'),first=await 读取xlsx(converted)
  assert.deepEqual(first.警告,[]);assert.deepEqual(mobile.兼容读取警告('xls','table',converted),[])
  const book=new ExcelJS.Workbook();await book.xlsx.load(converted);book.worksheets[0].getCell('B5').value='移动端回归𠮷'
  const saved=await mobile.转换文档(Buffer.from(await book.xlsx.writeBuffer()),'xlsx','xls','table')
  const again=await mobile.转换文档(saved,'xls','xlsx','table'),last=await 读取xlsx(again)
  assert.deepEqual(last.警告,[]);assert.deepEqual(mobile.兼容读取警告('xls','table',again),[])
  const reopened=new ExcelJS.Workbook();await reopened.xlsx.load(again)
  assert.equal(reopened.worksheets[0].getCell('B5').value,'移动端回归𠮷')
  const initial=new ExcelJS.Workbook();await initial.xlsx.load(converted)
  assert.deepEqual(reopened.worksheets.map(s=>s.name),initial.worksheets.map(s=>s.name))
  for(let i=0;i<initial.worksheets.length;i++){
    const before=initial.worksheets[i],after=reopened.worksheets[i]
    assert.deepEqual(after.pageSetup.margins,before.pageSetup.margins)
    before.eachRow(row=>row.eachCell(cell=>{if(cell.address!=='B5')assert.equal(after.getCell(cell.address).text,cell.text,cell.address)}))
  }
  assert.deepEqual(fs.readFileSync(process.env.SEAL_XLS_SAMPLE),copy)
})
