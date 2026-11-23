const { 解码文本 } = require('../textCodec')
const { csvContainsWorkbook } = require('./workbookFormat')
const { 识别网页型旧版表格 } = require('./htmlXls')
const textExtensions = new Set(require('../documentFormats.json').filter(item => item.text).map(item => '.' + item.extension))

async function decodeDocument(bytes, ext, preparse = false) {
  let actual
  if (ext === '.csv' && await csvContainsWorkbook(bytes)) actual = 'xlsx'
  if (ext === '.xls') {
    const html = 识别网页型旧版表格(bytes)
    if (html !== null) return { 内容: html, 实际格式: 'html-table-xls', 二进制: false, 文本编码: 'utf8' }
  }
  if (!actual && textExtensions.has(ext)) return { ...解码文本(bytes), 二进制: false }
  const format = actual || ext.slice(1)
  let parsed
  if (preparse) {
    if (format === 'xlsx') parsed = await require('../office/xlsxCodec').读取xlsx(bytes)
    if (format === 'docx') parsed = await require('../office/docxReader').读取docx(bytes)
    if (format === 'pptx') parsed = await require('../office/pptxCodec').读取pptx(bytes)
  }
  return { ...(parsed ? { 已解析: { 成功: true, ...parsed } } : { 内容: bytes.toString('base64') }), 二进制: true, ...(actual ? { 实际格式: actual } : {}) }
}
module.exports = { decodeDocument }
