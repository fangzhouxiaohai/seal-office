const ExcelJS = require('exceljs')
const JSZip = require('jszip')
const path = require('path')

// 人工数据覆盖 Open XML SDK 常见的显式前缀和包内绝对关系，不包含用户文件内容。
async function 创建带前缀表格({ 前缀 = 'x', 关系前缀 = 'r', 绝对关系 = true } = {}) {
  const 工作簿 = new ExcelJS.Workbook()
  const 表 = 工作簿.addWorksheet('逐条验收', { views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }] })
  表.addRow(['项目验收表'])
  表.mergeCells('A1:C1')
  表.addRow(['项目', '数量', '金额'])
  表.addRow(['x:文字 & <x:c>\n正常显示', 3, { formula: 'B3*10', result: 30 }])
  表.getCell('A1').font = { name: 'Arial', size: 18, bold: true, color: { argb: 'FF2463EB' } }
  表.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF1FF' } }
  表.getCell('A3').dataValidation = { type: 'list', formulae: ['"待办,完成"'], allowBlank: true }
  表.getColumn(1).width = 28
  表.getRow(1).height = 30
  表.getCell('C3').numFmt = '0.00'
  表.addTable({ name: 'Acceptance', ref: 'A5', headerRow: true, columns: [{ name: '事项' }, { name: '结果' }], rows: [['人工样例', '完成']] })
  工作簿.addWorksheet('测试证据').getCell('A1').value = '第二张工作表'
  const 压缩包 = await JSZip.loadAsync(await 工作簿.xlsx.writeBuffer())
  for (const 部件 of Object.values(压缩包.files)) {
    if (部件.dir || !/\.(?:xml|rels)$/.test(部件.name)) continue
    let xml = await 部件.async('string')
    if (xml.includes('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')) {
      xml = xml.replace('xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', `xmlns:${前缀}="http://schemas.openxmlformats.org/spreadsheetml/2006/main"`)
        .replace(/<(\/?)([A-Za-z][\w.-]*)(?=[\s/>])/g, `<$1${前缀}:$2`)
        .replace(/\br:/g, `${关系前缀}:`)
        .replace('xmlns:r=', `xmlns:${关系前缀}=`)
    }
    if (绝对关系 && 部件.name.endsWith('.rels')) {
      const 匹配 = 部件.name.match(/^(.*\/)?_rels\/[^/]+\.rels$/)
      const 目录 = 匹配 ? (匹配[1] ?? '') : ''
      xml = xml.replace(/Target="([^"]+)"/g, (_, 目标) => `Target="/${path.posix.normalize(path.posix.join(目录, 目标))}"`)
    }
    压缩包.file(部件.name, xml)
  }
  return 压缩包.generateAsync({ type: 'nodebuffer' })
}

module.exports = { 创建带前缀表格 }
