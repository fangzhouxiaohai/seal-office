import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import fs from 'node:fs'
const require = createRequire(import.meta.url)
const { 转换文档, configureConversion, validateWorkbook } = require('../web/nativeConversion.cjs')
const { 写入xlsx, 读取xlsx } = require('../../main/office/xlsxCodec.js')
const JSZip = require('../../node_modules/jszip')
configureConversion({ confirmLocal: async () => true })
test('configured full XLS conversion is explicit, per-result, and never falls back after cancellation', async () => {
  const { 兼容读取警告 } = require('../web/nativeConversion.cjs')
  const XLSX = require('../node_modules/xlsx')
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['完整格式𠮷']]),'表')
  const xls=Buffer.from(XLSX.write(book,{type:'buffer',bookType:'biff8'})),xlsx=await 写入xlsx({工作表:[{名称:'表',数据:[['完整格式𠮷']]}]})
  let cancelled=false,remoteCalls=0,localCalls=0
  configureConversion({canUseRemote:()=>true,confirmLocal:async()=>{localCalls++;return true},remote:async(bytes,input,output)=>{remoteCalls++;assert(['xls','xlsx'].includes(input));if(cancelled)throw Error('已取消文档转换');return output==='xlsx'?xlsx:xls}})
  const converted=await 转换文档(xls,'xls','xlsx','table')
  assert.deepEqual(兼容读取警告('xls','table',converted),[])
  assert.equal(兼容读取警告('xls','table',Buffer.from(converted)).length,1)
  await 转换文档(xlsx,'xlsx','xls','table');assert.equal(localCalls,0)
  cancelled=true;await assert.rejects(转换文档(xls,'xls','xlsx','table'),/取消/)
  await assert.rejects(转换文档(xlsx,'xlsx','xls','table'),/取消/);assert.equal(localCalls,0);assert.equal(remoteCalls,4)
  configureConversion({confirmLocal:async()=>true})
  assert.equal(兼容读取警告('xls','table',await 转换文档(xls,'xls','xlsx','table')).length,1)
})
const model = { 工作表: [{ 名称: '中文预算', 数据: [['编号', '金额'], [{ 类型: '文本', 文字: [{ 文本: '0012' }] }, 123], ['中文项目', 456]] }] }
test('mobile reads independent real Excel XLSB and XLA fixtures without executing macros', async () => {
  for (const extension of ['xlsb', 'xla']) {
    const converted = await 转换文档(fs.readFileSync(new URL(`../../scripts/fixtures/documents/readonly.${extension}`, import.meta.url)), extension, 'xlsx', 'table')
    const result = await 读取xlsx(converted)
    assert.match(JSON.stringify(result), /中文|编号|预算|验收/)
  }
})
test('offline legacy and open spreadsheet conversions preserve Chinese and leading zero text', async () => {
  const bytes = await 写入xlsx(model)
  for (const extension of ['xls', 'ods', 'fods', 'dbf', 'dif', 'slk']) {
    const saved = await 转换文档(bytes, 'xlsx', extension, 'table')
    const opened = await 读取xlsx(await 转换文档(saved, extension, 'xlsx', 'table'))
    assert.match(JSON.stringify(opened), /中文项目/, extension); assert.match(JSON.stringify(opened), /0012/, extension)
  }
})
test('template and slideshow outputs change actual content type', async () => {
  const { 生成docx } = require('../../main/office/docxWriter.js'), { 写入pptx } = require('../../main/office/pptxCodec.js')
  const word = await 生成docx({ 段落: [{ 类型: '段落', 文字: [{ 文本: '手机模板验收' }] }] }), table = await 写入xlsx(model)
  const ppt = await 写入pptx({ 页面尺寸: { 宽: 960, 高: 540 }, 幻灯片: [{ id: '1', 文本框: [{ id: 'text', x: 20, y: 20, width: 300, height: 50, text: '手机演示验收' }] }] })
  for (const [type, inputFormat, outputFormat, bytes, contentType] of [['word','docx','dotx',word,'wordprocessingml.template.main+xml'], ['table','xlsx','xltx',table,'spreadsheetml.template.main+xml'], ['ppt','pptx','potx',ppt,'presentationml.template.main+xml'], ['ppt','pptx','ppsx',ppt,'presentationml.slideshow.main+xml']]) {
    const zip = await JSZip.loadAsync(await 转换文档(bytes, inputFormat, outputFormat, type))
    assert.ok((await zip.file('[Content_Types].xml').async('string')).includes(contentType))
  }
})
test('range, multi-sheet and cancel protections prevent truncated legacy output', async () => {
  assert.throws(() => validateWorkbook({ SheetNames: ['x'], Sheets: { x: { '!ref': 'A1:IW65537' } } }, 'xls'), /截断/)
  assert.throws(() => validateWorkbook({ SheetNames: ['x','y'], Sheets: { x: {}, y: {} } }, 'dbf'), /一张/)
  configureConversion({ confirmLocal: async () => false })
  await assert.rejects(转换文档(await 写入xlsx(model), 'xlsx', 'xls', 'table'), /取消/)
  let calls = 0
  configureConversion({ remote: async () => { calls++; return Buffer.from('synthetic') }, confirmLocal: async () => true })
  await assert.rejects(转换文档(Buffer.from('x'), 'wps', 'docx', 'word'), /无效/)
  await assert.rejects(转换文档(Buffer.from('not an Excel workbook'), 'xls', 'xlsx', 'table'), /有效的 Excel/)
  await 转换文档(Buffer.from('synthetic'), 'doc', 'docx', 'word'); assert.equal(calls, 1)
})
