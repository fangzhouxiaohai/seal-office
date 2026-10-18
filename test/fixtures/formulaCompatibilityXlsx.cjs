const ExcelJS = require('exceljs')
const JSZip = require('jszip')

// 合成的 OOXML 互操作样例，不含 WPS 程序代码或用户文档。
async function 创建公式兼容表格({ 严格 = false, 显式前缀 = false } = {}) {
  const 簿 = new ExcelJS.Workbook()
  簿.addWorksheet('公式兼容').getCell('A1').value = 5
  簿.addWorksheet('来源 表').getCell('A1').value = 12
  const 包 = await JSZip.loadAsync(await 簿.xlsx.writeBuffer())
  const 单元 = (地址, 公式, 缓存, 类型 = '', 属性 = '') => `<c r="${地址}"${类型 ? ` t="${类型}"` : ''}><f${属性}>${公式.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</f>${缓存 === undefined ? '' : `<v>${String(缓存).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</v>`}</c>`
  const 行 = [
    `<row r="1"><c r="A1"><v>5</v></c>${单元('B1', 'SUM($A1,A$1,$A$1)+IF("A1"="A1",0,99)', 15, '', ' t="shared" si="0" ref="B1:B2"')}${单元('C1', 'IF(A1>0,"A1","B1")', 'A1', 'str', ' t="shared" si="1" ref="C1:C2"')}${单元('D1', '_xlfn.XLOOKUP($A$1,$A$1:$A$2,$A$1:$A$2,0)', 5)}${单元('E1', "'来源 表'!$A$1*2", 24)}${单元('F1', '_xlfn.UNKNOWN(1)', 0)}${单元('G1', '_xlfn._xlws.FILTER(A1:A2,A1:A2>0)', 5, '', ' t="array" ref="G1:G2"')}${单元('H1', 'SUM(A1:A2*2)', 26, '', ' t="array" ref="H1:H2"')}${单元('I1', '1/0', 99)}${单元('J1', 'F1+A1', 5)}</row>`,
    `<row r="2"><c r="A2"><v>8</v></c><c r="B2"><f t="shared" si="0"/><v>18</v></c><c r="C2" t="str"><f t="shared" si="1"/><v>A1</v></c>${单元('F2', '_xlfn.UNKNOWN(2)', 0, 'b')}<c r="G2"><v>8</v></c><c r="H2"><v>26</v></c></row>`,
    `<row r="3">${单元('F3', '_xlfn.UNKNOWN(3)', '', 'str')}</row>`,
    `<row r="4">${单元('F4', '_xlfn.UNKNOWN(4)', '#N/A', 'e')}</row>`,
    `<row r="5">${单元('F5', '_xlfn.UNKNOWN(5)', undefined)}</row>`,
    `<row r="6">${单元('F6', '_xlfn.UNKNOWN(6)', 'A<&😀', 'str')}</row>`,
    // 从属共享公式先于主公式：合法的 si 引用不应依赖 XML 行出现次序。
    '<row r="7"><c r="B7"><f t="shared" si="2"/><v>6</v></c></row>',
    `<row r="8">${单元('B8', 'A2+1', 9, '', ' t="shared" si="2" ref="B7:B8"')}</row>`,
  ]
  let xml = await 包.file('xl/worksheets/sheet1.xml').async('string')
  xml = xml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${行.join('')}</sheetData>`)
  包.file('xl/worksheets/sheet1.xml', xml)
  if (严格 || 显式前缀) {
    for (const 部件 of Object.values(包.files)) {
      if (部件.dir || !/\.(?:xml|rels)$/.test(部件.name)) continue
      let 内容 = await 部件.async('string')
      if (显式前缀 && 内容.includes('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')) {
        内容 = 内容.replace('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', 'xmlns:sml="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')
          .replace(/<(\/?)([A-Za-z][\w.-]*)(?=[\s/>])/g, '<$1sml:$2')
      }
      if (严格) 内容 = 内容.replaceAll('http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'http://purl.oclc.org/ooxml/spreadsheetml/main')
        .replaceAll('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'http://purl.oclc.org/ooxml/officeDocument/relationships')
      包.file(部件.name, 内容)
    }
  }
  return 包.generateAsync({ type: 'nodebuffer' })
}

module.exports = { 创建公式兼容表格 }
