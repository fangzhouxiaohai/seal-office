// 扫描页处理流水线：解码（最长边 ≤ 2400）→ 旋转 → 四角（自动检测或手动）→ 透视校正 → 增强 → JPEG。
// 全部在本机完成；界面层通过本模块调用，组件测试中可整体替换（jsdom 没有画布）。
import { 检测文档四角, 透视校正, 增强图像, 旋转九十度, type 四角, type 增强模式, type 像素图 } from './imageProcessing'
import { 解码图片, 编码图片 } from './imageIO'

export interface 页面设置 { 四角: 四角 | null; 模式: 增强模式; 旋转: number }
export interface 处理结果 { 图片: Uint8Array; 类型: 'image/jpeg'; 宽: number; 高: number; 四角: 四角; 已检测: boolean }

const 是整图 = (角: 四角, 图: 像素图) => 角[0].x <= 0 && 角[0].y <= 0 && 角[2].x >= 图.宽 && 角[2].y >= 图.高 && 角[1].x >= 图.宽 && 角[3].y >= 图.高

export async function 处理扫描页(原图: Blob, 设置: 页面设置): Promise<处理结果> {
  const 图 = 旋转九十度(await 解码图片(原图), 设置.旋转)
  const 检测 = 设置.四角 ? { 四角: 设置.四角, 已检测: false } : 检测文档四角(图)
  const 校正 = 是整图(检测.四角, 图) ? 图 : 透视校正(图, 检测.四角)
  const 增强 = 增强图像(校正, 设置.模式)
  return { 图片: await 编码图片(增强), 类型: 'image/jpeg', 宽: 增强.宽, 高: 增强.高, 四角: 检测.四角, 已检测: 检测.已检测 }
}

/** 手动调整四角用的原图预览：坐标系与处理时一致（缩放并旋转后的像素） */
export async function 生成原图预览(原图: Blob, 旋转: number): Promise<{ 地址: string; 宽: number; 高: number; 自动四角: 四角; 已检测: boolean }> {
  const 图 = 旋转九十度(await 解码图片(原图), 旋转)
  const 检测 = 检测文档四角(图)
  const 字节 = await 编码图片(图, 'image/jpeg', 0.8)
  return { 地址: URL.createObjectURL(new Blob([字节 as BlobPart], { type: 'image/jpeg' })), 宽: 图.宽, 高: 图.高, 自动四角: 检测.四角, 已检测: 检测.已检测 }
}

/** 入库保存的原图：统一缩放到最长边 ≤ 2400 并转为 JPEG，避免把相机原片整份存进本机库 */
export async function 压缩原图(原图: Blob): Promise<Uint8Array> {
  return 编码图片(await 解码图片(原图), 'image/jpeg', 0.85)
}
