const { PDFDocument } = require('pdf-lib')
/** Parse the actual worker output, including its cross-reference and page tree. */
async function validatePdf(bytes) {
  const data = Buffer.from(bytes)
  if (!/^%PDF-1\.[0-9]|^%PDF-2\.0/.test(data.subarray(0, 9).toString('ascii')) || !/%%EOF\s*$/.test(data.subarray(-2048).toString('latin1'))) throw new Error('转换结果不是完整的 PDF')
  const document = await PDFDocument.load(data, { updateMetadata: false, throwOnInvalidObject: true })
  if (!document.getPageCount()) throw new Error('转换结果 PDF 没有页面')
  return data
}
module.exports = { validatePdf }
