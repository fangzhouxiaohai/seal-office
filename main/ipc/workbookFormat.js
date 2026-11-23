const JSZip = require('jszip')
const sax = require('sax')

/** Some spreadsheet exports use a CSV filename for a complete OOXML workbook. */
async function csvContainsWorkbook(bytes) {
  if (bytes.length < 4 || bytes.readUInt16LE(0) !== 0x4b50 || ![0x0403, 0x0605, 0x0807].includes(bytes.readUInt16LE(2))) return false
  const archive = await JSZip.loadAsync(bytes)
  const manifest = archive.file('[Content_Types].xml')
  if (manifest && manifest._data.uncompressedSize < 4 * 1024 * 1024) {
    let workbook = false
    const parser = sax.parser(true, { xmlns: true })
    parser.onopentag = node => {
      if (node.local !== 'Override' || node.uri !== 'http://schemas.openxmlformats.org/package/2006/content-types') return
      const type = node.attributes.ContentType?.value
      const part = node.attributes.PartName?.value
      if (type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml' &&
          part === '/xl/workbook.xml' && archive.file('xl/workbook.xml')) workbook = true
    }
    parser.write(await manifest.async('string')).close()
    if (workbook) return true
  }
  throw new Error('文件是压缩包，未找到有效的 XLSX 工作簿结构。')
}

module.exports = { csvContainsWorkbook }
