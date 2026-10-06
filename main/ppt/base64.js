// 大文件与高清截图都会产生很长的 base64 字符串。
// 这里使用单量词正则与长度优先判断，避免嵌套量词在长文本上回溯导致调用栈溢出。
function 是合法base64(数据) {
  return typeof 数据 === 'string' && 数据.length > 0 && 数据.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(数据)
}

function base64字节数(数据) {
  if (typeof 数据 !== 'string' || 数据.length === 0) return 0
  return 数据.length / 4 * 3 - (数据.endsWith('==') ? 2 : 数据.endsWith('=') ? 1 : 0)
}

module.exports = { 是合法base64, base64字节数 }
