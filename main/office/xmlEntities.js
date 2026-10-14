/** XML 1.0 允许的码点；代理区和大多数控制字符不能出现在 OOXML 中。 */
function 是有效Xml码点(码点) {
  return 码点 === 0x9 || 码点 === 0xa || 码点 === 0xd ||
    码点 >= 0x20 && 码点 <= 0xd7ff ||
    码点 >= 0xe000 && 码点 <= 0xfffd ||
    码点 >= 0x10000 && 码点 <= 0x10ffff
}

/**
 * 解码 XML 的五个命名实体与十进制/十六进制数字实体。
 * 使用 fromCodePoint 而非 fromCharCode，避免扩展汉字和 emoji 被截断成错误字符。
 */
function 解码Xml实体(文本, 错误说明 = '文档') {
  const 映射 = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }
  return String(文本).replace(/&(?:lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (实体) => {
    const 名称 = 实体.slice(1, -1)
    if (名称[0] !== '#') return 映射[名称.toLowerCase()]
    const 十六进制 = 名称[1]?.toLowerCase() === 'x'
    const 码点 = Number.parseInt(名称.slice(十六进制 ? 2 : 1), 十六进制 ? 16 : 10)
    if (!Number.isInteger(码点) || !是有效Xml码点(码点)) throw new Error(`${错误说明}包含无效 XML 字符`)
    return String.fromCodePoint(码点)
  })
}

module.exports = { 解码Xml实体, 是有效Xml码点 }
