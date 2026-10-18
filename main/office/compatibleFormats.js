const JSZip = require('jszip')
const 格式列表 = require('../documentFormats.json')
const { 转换文档, 兼容读取警告 } = require('./nativeConversion')
const { 读取docx, } = require('./docxReader')
const { 生成docx } = require('./docxWriter')
const { 读取xlsx, 写入xlsx } = require('./xlsxCodec')
const { 读取pptx, 写入pptx } = require('./pptxCodec')
const { 解码文本, 编码文本 } = require('../textCodec')

const 标准扩展 = { word: 'docx', table: 'xlsx', ppt: 'pptx' }
const 读取器 = { word: 读取docx, table: 读取xlsx, ppt: 读取pptx }
const 写入器 = { word: 生成docx, table: 写入xlsx, ppt: 写入pptx }
const 主内容类型 = {
  word: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
  table: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
  ppt: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
}
/** OOXML 模板和宏文档与普通文档共用正文结构；只调整内存副本，不执行或改写原宏。 */
async function 标准化OOXML(字节, 类型) {
  const 压缩包 = await JSZip.loadAsync(字节)
  const 文件 = 压缩包.file('[Content_Types].xml')
  if (!文件) throw new Error('OOXML 文档缺少内容类型声明')
  const 主部件 = { word: '/word/document.xml', table: '/xl/workbook.xml', ppt: '/ppt/presentation.xml' }[类型]
  const 声明 = await 文件.async('string')
  if (!声明.includes(主部件)) throw new Error('文件正文类型与扩展名不一致')
  压缩包.file('[Content_Types].xml', 声明.replace(/<Override\b[^>]*>/g, 块 => 块.includes(`PartName="${主部件}"`) ? 块.replace(/ContentType="[^"]+"/, `ContentType="${主内容类型[类型]}"`) : 块))
  return 压缩包.generateAsync({ type: 'nodebuffer' })
}
async function 读取兼容文档(扩展, 字节) {
  const 格式 = 格式列表.find(项 => 项.extension === 扩展 && 项.conversion)
  if (!格式) throw new Error('不支持的兼容文档格式')
  let 类型 = 格式.type
  if (扩展 === 'prn') {
    const { 内容 } = 解码文本(字节)
    const 行 = 内容.replace(/^\uFEFF/, '').replace(/(?:\r\n|\r|\n)$/, '').split(/\r\n|\r|\n/)
    const 数据 = 行.map(文本 => 文本.trimEnd().split(/ {2,}|\t/).map(值 => ({ 类型: '文本', 文字: [{ 文本: 值 }] })))
    const 结果 = await 读取xlsx(await 写入xlsx({ 工作表: [{ 名称: '数据', 数据 }] }))
    return { ...结果, 类型, 警告: [...(结果.警告 ?? []), 'PRN 按连续空格或制表符分列；无分隔的固定字段需核对边界。请另存为副本以保留来源文件'] }
  }
  if (扩展 === 'xml') {
    const 文本 = 字节.toString('utf8')
    if (文本.includes('urn:schemas-microsoft-com:office:spreadsheet')) 类型 = 'table'
    else if (!文本.includes('http://schemas.microsoft.com/office/word/2003/wordml')) throw new Error('此 XML 不是 Office 文档，请按 XML 文本打开')
  }
  const 数据 = 格式.ooxml ? await 标准化OOXML(字节, 类型) : await 转换文档(字节, 扩展, 标准扩展[类型], 类型)
  const 结果 = await 读取器[类型](数据)
  const 警告 = [...(结果.警告 ?? [])]
  if (兼容读取警告) 警告.push(...兼容读取警告(扩展, 类型))
  if (['doc', 'dot', 'xls', 'xlt', 'ppt', 'pot', 'pps'].includes(扩展) &&
    (字节.includes(Buffer.from('_VBA_PROJECT', 'utf16le')) || 字节.includes(Buffer.from('VBA', 'utf16le')))) 警告.push('来源文件含旧版宏，宏不会执行或回写，请另存为普通文档以保护原文件')
  if (格式.readOnlySource) 警告.push('宏、加载项或二进制专有结构无法完整回写；来源文件保持不变，请另存为普通文档格式')
  return { ...结果, 类型, 警告 }
}
async function 写入兼容文档(类型, 扩展, 模型) {
  const 格式 = 格式列表.find(项 => 项.extension === 扩展 && (项.type === 类型 || 项.extension === 'pdf') && !项.readOnlySource)
  if (!格式 || !写入器[类型]) throw new Error('该文档格式不能写入，请选择受支持的普通文档格式')
  if (['dbf', 'prn', 'dif', 'slk'].includes(扩展) && 模型.工作表?.length !== 1) throw new Error('这种数据格式只能保存一张工作表，请另存为 XLSX')
  if (扩展 === 'prn') {
    if (!Array.isArray(模型.工作表) || 模型.工作表.length !== 1) throw new Error('PRN 只能保存一张数据表，请另存为 XLSX 以保留全部工作表')
    const 行 = 模型.工作表[0].数据.map(行 => 行.map(值 => typeof 值 === 'object' && 值 ? (值.文字 ?? []).map(片段 => 片段.文本).join('') : String(值 ?? '')))
    if (行.some(行 => 行.some(值 => /[\r\n\t]| {2,}/.test(值)))) throw new Error('PRN 无法可靠保存换行、制表符或连续空格字段，请使用 CSV 或 XLSX')
    const 宽度 = []
    行.forEach(行 => 行.forEach((值, 列) => { 宽度[列] = Math.max(宽度[列] ?? 0, [...值].length) }))
    return 编码文本('\uFEFF' + 行.map(行 => 宽度.map((宽, 列) => { const 值 = 行[列] ?? ''; return 值 + ' '.repeat(宽 - [...值].length + 2) }).join('').trimEnd()).join('\r\n'))
  }
  const 字节 = await 写入器[类型](模型)
  return 扩展 === 标准扩展[类型] ? 字节 : await 转换文档(字节, 标准扩展[类型], 扩展, 类型)
}
module.exports = { 读取兼容文档, 写入兼容文档, 标准化OOXML }
