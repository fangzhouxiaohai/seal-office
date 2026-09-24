const mammoth = require('mammoth')

async function 读取docx(数据) {
  const 结果 = await mammoth.convertToHtml({ buffer: Buffer.from(数据) })
  return {
    html: 结果.value,
    警告: 结果.messages.map((项) => 项.message),
  }
}

module.exports = { 读取docx }
