const iconv = require('iconv-lite')
const 编码列表 = new Set(['utf8', 'utf16le', 'utf16be', 'gb18030'])

function 解码文本(字节) {
  let 文本编码 = 'utf8'
  if (字节[0] === 0xff && 字节[1] === 0xfe) 文本编码 = 'utf16le'
  else if (字节[0] === 0xfe && 字节[1] === 0xff) 文本编码 = 'utf16be'
  else {
    try { new TextDecoder('utf-8', { fatal: true }).decode(字节) }
    catch { 文本编码 = 'gb18030' }
  }
  const 内容 = iconv.decode(字节, 文本编码, { stripBOM: false })
  // 截断或无效的编码不能作为可覆盖的文本打开。
  if (!iconv.encode(内容, 文本编码).equals(Buffer.from(字节))) throw new Error('文本编码无效或文件已截断，请先转换为 UTF-8 后打开')
  return { 内容, 文本编码 }
}

function 编码文本(内容, 编码 = 'utf8') {
  if (!编码列表.has(编码)) throw new Error('不支持的文本编码')
  const 字节 = iconv.encode(String(内容 ?? ''), 编码)
  if (iconv.decode(字节, 编码, { stripBOM: false }) !== String(内容 ?? '')) throw new Error('当前编码无法保存新增字符，请另存为 UTF-8 文档')
  return 字节
}
module.exports = { 解码文本, 编码文本 }
