const XLSX = require('xlsx')
const JSZip = require('jszip')
const formats = require('../../main/documentFormats.json')
const { 解码文本 } = require('../../main/textCodec')
let remote, confirmLocal
function configureConversion(options) { remote = options.remote; confirmLocal = options.confirmLocal }
const tableInputs = new Set(['xls', 'xlt', 'xlsb', 'xla', 'ods', 'ots', 'fods', 'dbf', 'dif', 'slk'])
const tableOutputs = { xls: 'biff8', ods: 'ods', fods: 'fods', dbf: 'dbf', dif: 'dif', slk: 'sylk' }
const templateTypes = {
  dotx: ['/word/document.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml'],
  xltx: ['/xl/workbook.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml'],
  potx: ['/ppt/presentation.xml', 'application/vnd.openxmlformats-officedocument.presentationml.template.main+xml'],
  ppsx: ['/ppt/presentation.xml', 'application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml'],
}
const localReadWarning = '移动端离线兼容读取主要保留数据和公式，高级样式、图表、图片等可能无法完整保留。来源文件保持不变，请核对后另存为副本'
function 兼容读取警告(extension, type) { return tableInputs.has(extension) || extension === 'xml' && type === 'table' ? [localReadWarning] : [] }
function validateWorkbook(workbook, outputFormat) {
  if (!workbook.SheetNames?.length || workbook.SheetNames.length > 100) throw new Error('工作簿为空或工作表数量过多')
  if (['dbf','dif','slk'].includes(outputFormat) && workbook.SheetNames.length !== 1) throw new Error('这种数据格式只能保存一张工作表，请使用 XLSX')
  let cells = 0
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    if (sheet['!ref']) {
      const range = XLSX.utils.decode_range(sheet['!ref'])
      if (range.e.r >= 1000000 || range.e.c >= 16384) throw new Error('工作表范围超出手机处理上限')
      if (['xls','slk'].includes(outputFormat) && (range.e.r >= 65536 || range.e.c >= 256)) throw new Error('旧格式最多支持 65536 行、256 列，请使用 XLSX 避免截断')
    }
    cells += Object.keys(sheet).filter(key => !key.startsWith('!')).length
    if (cells > 1000000) throw new Error('工作簿单元格过多，请在电脑版处理')
  }
}
async function validateLocalInput(bytes, extension) {
  if (['xls', 'xlt', 'xla'].includes(extension) && !bytes.subarray(0, 8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]))) throw new Error('文件不是有效的 Excel 97–2003 二进制表格')
  if (['xlsx','xlsb','ods','ots'].includes(extension)) {
    const zip = await JSZip.loadAsync(bytes)
    let size = 0
    for (const file of Object.values(zip.files)) { size += file._data?.uncompressedSize || 0; if (size > 100 * 1024 * 1024) throw new Error('表格解压内容超出手机处理上限') }
    const part = extension === 'xlsx' ? 'xl/workbook.xml' : extension === 'xlsb' ? 'xl/workbook.bin' : 'content.xml'
    if (!zip.file(part)) throw new Error('表格正文与文件扩展名不一致')
    if (['ods','ots'].includes(extension)) {
      const mime = await zip.file('mimetype')?.async('string')
      if (!['application/vnd.oasis.opendocument.spreadsheet','application/vnd.oasis.opendocument.spreadsheet-template'].includes(mime)) throw new Error('文件不是开放电子表格')
    }
  }
  if (['dif','slk','fods','xml'].includes(extension)) {
    const text = 解码文本(bytes).内容.replace(/^\uFEFF/, '').trimStart()
    if (extension === 'dif' && (!/^TABLE\b/.test(text) || !/\bDATA\b/.test(text)) || extension === 'slk' && !/^ID;/.test(text) || extension === 'fods' && !/<(?:office:)?spreadsheet\b/.test(text) || extension === 'xml' && !text.includes('urn:schemas-microsoft-com:office:spreadsheet')) throw new Error('表格正文与文件扩展名不一致')
  }
}
async function 转换文档(bytes, inputFormat, outputFormat, type) {
  const source = formats.find(f => f.extension === inputFormat)
  const target = formats.find(f => f.extension === outputFormat && f.type === type && !f.readOnlySource)
  if (!source || !target || (source.type !== type && inputFormat !== 'xml')) throw new Error('文档转换格式无效')
  if (bytes.length > 100 * 1024 * 1024) throw new Error('单个文件不能超过 100 MiB')
  if (templateTypes[outputFormat] && inputFormat === { word: 'docx', table: 'xlsx', ppt: 'pptx' }[type]) {
    const zip = await JSZip.loadAsync(bytes), [part, contentType] = templateTypes[outputFormat], declaration = zip.file('[Content_Types].xml')
    if (!declaration) throw new Error('文档缺少格式声明')
    const xml = await declaration.async('string')
    if (!xml.includes(part)) throw new Error('文档正文类型与扩展名不一致')
    zip.file('[Content_Types].xml', xml.replace(/<Override\b[^>]*>/g, block => block.includes(`PartName="${part}"`) ? block.replace(/ContentType="[^"]+"/, `ContentType="${contentType}"`) : block))
    return zip.generateAsync({ type: 'nodebuffer' })
  }
  if (type === 'table' && ((tableInputs.has(inputFormat) || inputFormat === 'xml') && outputFormat === 'xlsx' || inputFormat === 'xlsx' && tableOutputs[outputFormat])) {
    await validateLocalInput(bytes, inputFormat)
    // DIF/SYLK readers consume a decoded string directly; their buffer route treats UTF-8 as Latin-1.
    const textInput = ['dif', 'slk'].includes(inputFormat)
    const workbook = XLSX.read(textInput ? 解码文本(bytes).内容.replace(/^\uFEFF/, '') : bytes, { type: textInput ? 'binary' : 'buffer', cellDates: false, cellStyles: true, cellFormula: true, bookVBA: false, WTF: true })
    validateWorkbook(workbook, outputFormat)
    if (outputFormat !== 'xlsx' && (!confirmLocal || !await confirmLocal(outputFormat))) throw new Error('已取消兼容格式保存，原文件未修改')
    const output = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: tableOutputs[outputFormat] || 'xlsx', compression: true, cellStyles: true, codepage: outputFormat === 'dbf' ? 936 : undefined }))
    return ['dif', 'slk'].includes(outputFormat) ? Buffer.concat([Buffer.from([239, 187, 191]), output]) : output
  }
  if (!remote) throw new Error('请先在设置中心配置文档转换服务，再打开或保存这种格式')
  return remote(bytes, inputFormat, outputFormat, type)
}
module.exports = { 转换文档, configureConversion, 兼容读取警告, validateWorkbook }
