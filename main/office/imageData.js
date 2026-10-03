// 浏览器与主进程共用的图片数据校验，不访问文件系统或网络。
const 单张最大字节 = 20 * 1024 * 1024
const 文档最大图片字节 = 100 * 1024 * 1024

/** @param {Uint8Array} 字节 */
function 读取图片信息(字节) {
  if (!字节.length || 字节.length > 单张最大字节) throw new Error('图片为空或超过单张 20 MB 上限')
  const 视图 = new DataView(字节.buffer, 字节.byteOffset, 字节.byteLength)
  let 格式 = '', 宽 = 0, 高 = 0
  const 文本 = (起点, 长度) => String.fromCharCode(...字节.subarray(起点, 起点 + 长度))
  if (字节.length >= 45 && [137, 80, 78, 71, 13, 10, 26, 10].every((值, 下标) => 字节[下标] === 值) &&
      视图.getUint32(8) === 13 && 文本(12, 4) === 'IHDR' && 文本(字节.length - 8, 4) === 'IEND') {
    格式 = 'png'; 宽 = 视图.getUint32(16); 高 = 视图.getUint32(20)
  } else if (字节.length >= 14 && 字节[0] === 255 && 字节[1] === 216 && 字节[字节.length - 2] === 255 && 字节[字节.length - 1] === 217) {
    let 游标 = 2
    while (游标 + 3 < 字节.length) {
      if (字节[游标++] !== 255) break
      while (字节[游标] === 255) 游标++
      const 标记 = 字节[游标++]
      if (标记 === 217 || 标记 === 218) break
      if (标记 === 216 || 标记 === 1 || 标记 >= 208 && 标记 <= 215) continue
      if (游标 + 1 >= 字节.length) break
      const 长度 = 视图.getUint16(游标)
      if (长度 < 2 || 游标 + 长度 > 字节.length) break
      if (标记 >= 192 && 标记 <= 207 && ![196, 200, 204].includes(标记) && 长度 >= 7) {
        格式 = 'jpeg'; 高 = 视图.getUint16(游标 + 3); 宽 = 视图.getUint16(游标 + 5); break
      }
      游标 += 长度
    }
  } else if (字节.length >= 14 && ['GIF87a', 'GIF89a'].includes(文本(0, 6)) && 字节[字节.length - 1] === 59) {
    格式 = 'gif'; 宽 = 视图.getUint16(6, true); 高 = 视图.getUint16(8, true)
  } else if (字节.length >= 54 && 文本(0, 2) === 'BM' && 视图.getUint32(2, true) <= 字节.length &&
      视图.getUint32(10, true) >= 26 && 视图.getUint32(10, true) < 字节.length) {
    格式 = 'bmp'; 宽 = 视图.getInt32(18, true); 高 = Math.abs(视图.getInt32(22, true))
  }
  if (!格式 || !Number.isInteger(宽) || !Number.isInteger(高) || 宽 < 1 || 高 < 1 || 宽 > 32768 || 高 > 32768 || 宽 * 高 > 100_000_000) {
    throw new Error('图片格式、内容或像素尺寸无效；当前支持 PNG、JPEG、GIF 和 BMP')
  }
  return { 格式, 宽, 高 }
}

/** @param {string} 数据 */
function 解码图片数据(数据) {
  if (typeof 数据 !== 'string' || !数据 || 数据.length > Math.ceil(单张最大字节 / 3) * 4 + 8) throw new Error('图片数据为空或超过单张 20 MB 上限')
  // 避免对整段编码使用嵌套量词，较大的有效图片会使正则回溯栈溢出。
  if (数据.length % 4 !== 0 || /[^A-Za-z0-9+/]/.test(数据.slice(0, -4)) ||
      !/^[A-Za-z0-9+/]{2}(?:[A-Za-z0-9+/]{2}|[A-Za-z0-9+/]=|==)$/.test(数据.slice(-4))) throw new Error('图片数据编码无效')
  const 原文 = atob(数据)
  const 字节 = Uint8Array.from(原文, (字符) => 字符.charCodeAt(0))
  return { 字节, ...读取图片信息(字节) }
}

module.exports = { 读取图片信息, 解码图片数据, 单张最大字节, 文档最大图片字节 }
