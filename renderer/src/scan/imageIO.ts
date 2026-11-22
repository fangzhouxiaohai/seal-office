// 浏览器图片编解码：把用户选择的图片解码为像素数组（解码时即按最长边 ≤ 2400 缩放，控制内存），
// 处理完成后再编码为 JPEG。全部在本机完成，不上传。jsdom 没有画布，组件测试中由模拟替代。
import { 缩放尺寸, type 像素图 } from './imageProcessing'

import { 图片格式 } from './imageFormat'
import { 读取字节 } from './scanInput'

function 创建画布(宽: number, 高: number) {
  const 画布 = document.createElement('canvas'); 画布.width = 宽; 画布.height = 高
  const 画笔 = 画布.getContext('2d', { willReadFrequently: true })
  if (!画笔) throw new Error('当前环境无法处理图片')
  return { 画布, 画笔 }
}

async function 加载图像(文件: Blob): Promise<HTMLImageElement | ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(文件, { imageOrientation: 'from-image' }) }
    catch { /* 部分 WebView 仅在 img 元素上支持该格式。 */ }
  }
  const 地址 = URL.createObjectURL(文件)
  try {
    const 图 = new Image()
    await new Promise<void>((完成, 失败) => { 图.onload = () => 完成(); 图.onerror = () => 失败(new Error('图片解码失败')); 图.src = 地址 })
    return 图
  } finally { URL.revokeObjectURL(地址) }
}

export async function 解码图片(文件: Blob): Promise<像素图> {
  if (!文件.size) throw new Error('图片为空，请重新拍摄或选择原图')
  if (文件.size > 40 * 1024 * 1024) throw new Error('单张图片不能超过 40 MB')
  const 类型 = 图片格式(await 读取字节(文件.slice(0, 128)))
  if (!类型) throw new Error('无法识别图片文件，请选择 JPG、PNG、HEIF、WebP、AVIF、BMP 或 GIF 原图')
  const 原图 = 文件.type === 类型 ? 文件 : 文件.slice(0, 文件.size, 类型)
  let 来源: ImageBitmap | HTMLImageElement
  try { 来源 = await 加载图像(原图) }
  catch {
    if (类型 !== 'image/heif') throw new Error('图片数据无法解码，请重新选择完整原图')
    const { heicTo } = await import('heic-to/csp')
    来源 = await 加载图像(await heicTo({ blob: 原图, type: 'image/png' }))
  }
  try {
    if (!来源.width || !来源.height) throw new Error('图片尺寸无效')
    const 尺寸 = 缩放尺寸(来源.width, 来源.height)
    const { 画笔 } = 创建画布(尺寸.宽, 尺寸.高)
    画笔.drawImage(来源, 0, 0, 尺寸.宽, 尺寸.高)
    const 像素 = 画笔.getImageData(0, 0, 尺寸.宽, 尺寸.高)
    return { 宽: 尺寸.宽, 高: 尺寸.高, 数据: 像素.data }
  } finally { if ('close' in 来源) 来源.close() }
}

export async function 编码图片(图: 像素图, 类型: 'image/jpeg' | 'image/png' = 'image/jpeg', 质量 = 0.85): Promise<Uint8Array> {
  const { 画布, 画笔 } = 创建画布(图.宽, 图.高)
  画笔.putImageData(new ImageData(new Uint8ClampedArray(图.数据), 图.宽, 图.高), 0, 0)
  const 结果 = await new Promise<Blob | null>(完成 => 画布.toBlob(完成, 类型, 质量))
  if (!结果) throw new Error('图片编码失败，请重试')
  return 读取字节(结果)
}
