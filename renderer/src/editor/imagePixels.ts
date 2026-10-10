import { 单张最大字节 } from '../../../main/office/imageData'
import type { 图片变换 } from '../office/imageTransform'
export interface 图片裁剪 { 左: number; 上: number; 右: number; 下: number }
export function 检查裁剪(裁剪: 图片裁剪): void {
  if (!Object.values(裁剪).every(值 => Number.isFinite(值) && 值 >= 0 && 值 < 100) || 裁剪.左 + 裁剪.右 >= 100 || 裁剪.上 + 裁剪.下 >= 100) throw new Error('裁剪边距必须保留有效的图片区域')
}
/** 本地 Canvas 仅处理正文内嵌图片，裁剪结果为实际 PNG 像素，可跨端保存。 */
export async function 裁剪图片像素(来源: string, 裁剪: 图片裁剪): Promise<{ 数据: string; 宽比例: number; 高比例: number }> {
  检查裁剪(裁剪)
  const 图片 = await 加载图片(来源)
  const 宽比例 = 1 - (裁剪.左 + 裁剪.右) / 100, 高比例 = 1 - (裁剪.上 + 裁剪.下) / 100
  const 宽 = Math.max(1, Math.round(图片.naturalWidth * 宽比例)), 高 = Math.max(1, Math.round(图片.naturalHeight * 高比例))
  const { 画布, 画笔 } = 创建画布(宽, 高)
  画笔.drawImage(图片, 图片.naturalWidth * 裁剪.左 / 100, 图片.naturalHeight * 裁剪.上 / 100, 图片.naturalWidth * 宽比例, 图片.naturalHeight * 高比例, 0, 0, 宽, 高)
  return { 数据: 编码图片(画布), 宽比例, 高比例 }
}
export async function 识别用图片(来源: string, 变换: 图片变换): Promise<{ 数据: string; 类型: string }> {
  const 图片 = await 加载图片(来源), 比例 = Math.min(1, 2048 / Math.max(图片.naturalWidth, 图片.naturalHeight))
  const 宽 = 图片.naturalWidth * 比例, 高 = 图片.naturalHeight * 比例, 弧度 = 变换.旋转 * Math.PI / 180
  // 90° 等整角的三角函数有浮点余差，避免多出一列透明像素并使文字偏移半像素。
  const { 画布, 画笔 } = 创建画布(Math.ceil(Math.abs(宽 * Math.cos(弧度)) + Math.abs(高 * Math.sin(弧度)) - 1e-8), Math.ceil(Math.abs(宽 * Math.sin(弧度)) + Math.abs(高 * Math.cos(弧度)) - 1e-8))
  画笔.translate(画布.width / 2, 画布.height / 2); 画笔.rotate(弧度); 画笔.scale(变换.水平翻转 ? -1 : 1, 变换.垂直翻转 ? -1 : 1)
  画笔.drawImage(图片, -宽 / 2, -高 / 2, 宽, 高)
  return { 数据: 编码图片(画布).split(',')[1], 类型: 'image/png' }
}
async function 加载图片(来源: string): Promise<HTMLImageElement> {
  if (!/^data:image\/(?:png|jpe?g|gif|bmp);base64,/i.test(来源)) throw new Error('请先将图片嵌入正文')
  return new Promise((完成, 失败) => { const 图 = new Image(); 图.onload = () => 图.naturalWidth && 图.naturalHeight ? 完成(图) : 失败(new Error('图片尺寸无效')); 图.onerror = () => 失败(new Error('图片无法解码')); 图.src = 来源 })
}
function 创建画布(宽: number, 高: number) {
  if (宽 > 8192 || 高 > 8192 || 宽 * 高 > 16 * 1024 * 1024) throw new Error('处理后的图片分辨率过大，请先缩小原图后重试')
  const 画布 = document.createElement('canvas'); 画布.width = 宽; 画布.height = 高
  const 画笔 = 画布.getContext('2d'); if (!画笔) throw new Error('当前环境无法处理图片')
  return { 画布, 画笔 }
}
function 编码图片(画布: HTMLCanvasElement) {
  const 数据 = 画布.toDataURL('image/png')
  if (数据.length * 3 / 4 > 单张最大字节) throw new Error('处理后的图片超过 20 MB，请减小裁剪区域')
  return 数据
}
