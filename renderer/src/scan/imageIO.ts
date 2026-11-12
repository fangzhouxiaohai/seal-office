// 浏览器图片编解码：把用户选择的图片解码为像素数组（解码时即按最长边 ≤ 2400 缩放，控制内存），
// 处理完成后再编码为 JPEG。全部在本机完成，不上传。jsdom 没有画布，组件测试中由模拟替代。
import { 缩放尺寸, type 像素图 } from './imageProcessing'

const 可解码类型 = /^image\/(?:png|jpe?g|webp|bmp|gif)$/i

function 创建画布(宽: number, 高: number) {
  const 画布 = document.createElement('canvas'); 画布.width = 宽; 画布.height = 高
  const 画笔 = 画布.getContext('2d', { willReadFrequently: true })
  if (!画笔) throw new Error('当前环境无法处理图片')
  return { 画布, 画笔 }
}

export async function 解码图片(文件: Blob): Promise<像素图> {
  if (文件.type && !可解码类型.test(文件.type)) throw new Error('只支持 JPG、PNG、WebP、BMP 或 GIF 图片')
  if (文件.size > 40 * 1024 * 1024) throw new Error('单张图片不能超过 40 MB')
  let 来源: CanvasImageSource & { width: number; height: number }, 释放 = () => {}
  try {
    if (typeof createImageBitmap === 'function') {
      // 按 EXIF 方向解码，手机竖拍的照片不会横躺。
      const 位图 = await createImageBitmap(文件, { imageOrientation: 'from-image' } as ImageBitmapOptions)
      来源 = 位图; 释放 = () => 位图.close()
    } else {
      const 地址 = URL.createObjectURL(文件), 图 = new Image()
      await new Promise<void>((完成, 失败) => { 图.onload = () => 完成(); 图.onerror = () => 失败(new Error('decode')); 图.src = 地址 })
      来源 = Object.assign(图, { width: 图.naturalWidth, height: 图.naturalHeight }); 释放 = () => URL.revokeObjectURL(地址)
    }
  } catch { throw new Error('图片无法解码，请改用 JPG 或 PNG 图片') }
  try {
    if (!来源.width || !来源.height) throw new Error('图片尺寸无效')
    const 尺寸 = 缩放尺寸(来源.width, 来源.height)
    const { 画笔 } = 创建画布(尺寸.宽, 尺寸.高)
    画笔.drawImage(来源, 0, 0, 尺寸.宽, 尺寸.高)
    const 像素 = 画笔.getImageData(0, 0, 尺寸.宽, 尺寸.高)
    return { 宽: 尺寸.宽, 高: 尺寸.高, 数据: 像素.data }
  } finally { 释放() }
}

export async function 编码图片(图: 像素图, 类型: 'image/jpeg' | 'image/png' = 'image/jpeg', 质量 = 0.85): Promise<Uint8Array> {
  const { 画布, 画笔 } = 创建画布(图.宽, 图.高)
  画笔.putImageData(new ImageData(new Uint8ClampedArray(图.数据), 图.宽, 图.高), 0, 0)
  const 结果 = await new Promise<Blob | null>(完成 => 画布.toBlob(完成, 类型, 质量))
  if (!结果) throw new Error('图片编码失败，请重试')
  return new Uint8Array(await 结果.arrayBuffer())
}
