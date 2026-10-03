import type { SheetImage } from './model'

const 单张最大字节 = 5 * 1024 * 1024
const 最大像素数 = 20_000_000

function 缩放尺寸(宽: number, 高: number): { 宽: number; 高: number } {
  if (!Number.isInteger(宽) || !Number.isInteger(高) || 宽 < 1 || 高 < 1 ||
    宽 > 8192 || 高 > 8192 || 宽 * 高 > 最大像素数) {
    throw new Error('图片像素尺寸过大或无效')
  }
  const 比例 = Math.min(1, 480 / 宽, 320 / 高)
  return { 宽: Math.max(1, Math.round(宽 * 比例)), 高: Math.max(1, Math.round(高 * 比例)) }
}

function 读取Png尺寸(字节: Uint8Array): { 宽: number; 高: number } | null {
  const 签名 = [137, 80, 78, 71, 13, 10, 26, 10]
  if (字节.length < 24 || !签名.every((值, 下标) => 字节[下标] === 值) ||
    字节[8] !== 0 || 字节[9] !== 0 || 字节[10] !== 0 || 字节[11] !== 13 ||
    String.fromCharCode(...字节.slice(12, 16)) !== 'IHDR') return null
  const 视图 = new DataView(字节.buffer, 字节.byteOffset, 字节.byteLength)
  return { 宽: 视图.getUint32(16), 高: 视图.getUint32(20) }
}

function 读取Jpeg尺寸(字节: Uint8Array): { 宽: number; 高: number } | null {
  if (字节.length < 12 || 字节[0] !== 0xff || 字节[1] !== 0xd8) return null
  let 游标 = 2
  while (游标 + 3 < 字节.length) {
    if (字节[游标] !== 0xff) return null
    while (字节[游标] === 0xff) 游标 += 1
    const 标记 = 字节[游标]
    游标 += 1
    if (标记 === 0xd9 || 标记 === 0xda) return null
    if (标记 === 0xd8 || 标记 === 0x01 || (标记 >= 0xd0 && 标记 <= 0xd7)) continue
    if (游标 + 1 >= 字节.length) return null
    const 段长 = (字节[游标] << 8) | 字节[游标 + 1]
    if (段长 < 2 || 游标 + 段长 > 字节.length) return null
    if ((标记 >= 0xc0 && 标记 <= 0xcf) && ![0xc4, 0xc8, 0xcc].includes(标记)) {
      if (段长 < 7) return null
      return { 高: (字节[游标 + 3] << 8) | 字节[游标 + 4], 宽: (字节[游标 + 5] << 8) | 字节[游标 + 6] }
    }
    游标 += 段长
  }
  return null
}

function 转Base64(字节: Uint8Array): string {
  let 原文 = ''
  for (let 起点 = 0; 起点 < 字节.length; 起点 += 8192) {
    原文 += String.fromCharCode(...字节.subarray(起点, 起点 + 8192))
  }
  return btoa(原文)
}

/** 校验文件名、媒体类型、实际签名与像素尺寸，再构建可保存的图片数据。 */
export function 准备图片数据(文件名: string, 媒体类型: string, 字节: Uint8Array): Pick<SheetImage, '格式' | '数据' | '宽' | '高'> {
  if (字节.length > 单张最大字节) throw new Error('单张图片不能超过 5 MB')
  const 后缀 = 文件名.match(/\.([^.]+)$/)?.[1]?.toLowerCase()
  const 格式 = 后缀 === 'png' ? 'png' : 后缀 === 'jpg' || 后缀 === 'jpeg' ? 'jpeg' : null
  if (!格式 || (媒体类型 && 媒体类型 !== `image/${格式}`)) throw new Error('图片格式仅支持 PNG 和 JPEG')
  const 原始尺寸 = 格式 === 'png' ? 读取Png尺寸(字节) : 读取Jpeg尺寸(字节)
  if (!原始尺寸) throw new Error('图片格式无效或文件已损坏')
  return { 格式, 数据: 转Base64(字节), ...缩放尺寸(原始尺寸.宽, 原始尺寸.高) }
}

function 读取文件字节(文件: File): Promise<ArrayBuffer> {
  if (typeof 文件.arrayBuffer === 'function') return 文件.arrayBuffer()
  return new Promise((完成, 失败) => {
    const 阅读器 = new FileReader()
    阅读器.onload = () => 阅读器.result instanceof ArrayBuffer ? 完成(阅读器.result) : 失败(new Error('无法读取图片内容'))
    阅读器.onerror = () => 失败(new Error('无法读取图片内容'))
    阅读器.readAsArrayBuffer(文件)
  })
}

/** 浏览器图片解码用于阻止仅伪造文件头的内容进入工作表。 */
export async function 读取本机图片(文件: File): Promise<Pick<SheetImage, '格式' | '数据' | '宽' | '高'>> {
  if (文件.size > 单张最大字节) throw new Error('单张图片不能超过 5 MB')
  const 候选 = 准备图片数据(文件.name, 文件.type, new Uint8Array(await 读取文件字节(文件)))
  const 尺寸 = await new Promise<{ 宽: number; 高: number }>((完成, 失败) => {
    const 图像 = new Image()
    图像.onload = () => {
      try { 完成(缩放尺寸(图像.naturalWidth, 图像.naturalHeight)) }
      catch (错误) { 失败(错误) }
    }
    图像.onerror = () => 失败(new Error('图片无法解码，请检查文件内容'))
    图像.src = `data:image/${候选.格式};base64,${候选.数据}`
  })
  return { ...候选, ...尺寸 }
}
