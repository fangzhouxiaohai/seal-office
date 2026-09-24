const ExcelJS = require('exceljs')

async function 读取xlsx(数据) {
  const 工作簿 = new ExcelJS.Workbook()
  await 工作簿.xlsx.load(Buffer.from(数据))
  const 工作表 = 工作簿.worksheets[0]
  if (!工作表) return { html: '<p><br></p>', 警告: [] }
  const 行 = []
  工作表.eachRow((行数据) => {
    const 单元格 = []
    行数据.eachCell({ includeEmpty: true }, (单元) => {
      单元格.push(`<td>${转义(String(单元.text || ''))}</td>`)
    })
    行.push(`<tr>${单元格.join('')}</tr>`)
  })
  return { html: `<table><tbody>${行.join('')}</tbody></table>`, 警告: [] }
}

async function 写入xlsx(模型) {
  const 工作簿 = new ExcelJS.Workbook()
  const 工作表 = 工作簿.addWorksheet('工作表')
  const 行 = 模型 && Array.isArray(模型.行) ? 模型.行 : []
  行.forEach((项, 行号) => {
    项.forEach((值, 列号) => {
      工作表.getCell(行号 + 1, 列号 + 1).value = 值 == null ? '' : String(值)
    })
  })
  return 工作簿.xlsx.writeBuffer()
}

function 转义(文本) {
  return 文本.replace(/[&<>"']/g, (字符) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[字符]))
}

module.exports = { 读取xlsx, 写入xlsx }
