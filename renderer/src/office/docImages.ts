import { 解码图片数据, 单张最大字节 } from '../../../main/office/imageData'
import { 读取图片变换 } from './imageTransform'

export interface 文档图片 {
  数据: string
  格式: string
  宽: number
  高: number
  说明: string
  旋转?: number
  水平翻转?: boolean
  垂直翻转?: boolean
}

function 尺寸转像素(文本: string): number | undefined {
  const 匹配 = 文本.trim().match(/^(\d+(?:\.\d+)?)(px|pt|in|cm|mm)?$/i)
  if (!匹配) return undefined
  const 倍率: Record<string, number> = { px: 1, pt: 4 / 3, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 }
  return Number(匹配[1]) * 倍率[(匹配[2] || 'px').toLowerCase()]
}

/** 图片必须内嵌有效数据；不在保存过程中下载远程图片或读取任意本机路径。 */
export function 读取文档图片(元素: HTMLImageElement, 未覆盖: Set<string>): 文档图片 | undefined {
  try {
    const 匹配 = (元素.getAttribute('src') || '').match(/^data:image\/(png|jpe?g|gif|bmp);base64,([A-Za-z0-9+/=]+)$/i)
    if (!匹配) throw new Error('图片尚未嵌入或格式不支持')
    const 信息 = 解码图片数据(匹配[2])
    if (信息.格式 !== 匹配[1].toLowerCase().replace('jpg', 'jpeg')) throw new Error('图片类型与实际内容不一致')
    const 变换 = 读取图片变换(元素.style.transform)
    if (元素.style.float && 元素.style.float !== 'none' ||
        元素.style.position && 元素.style.position !== 'static' || 元素.style.objectFit && 元素.style.objectFit !== 'fill') throw new Error('图片裁剪或浮动布局尚不能保存')
    const 宽文本 = 元素.style.width && 元素.style.width !== 'auto' ? 元素.style.width : 元素.getAttribute('width') || ''
    const 高文本 = 元素.style.height && 元素.style.height !== 'auto' ? 元素.style.height : 元素.getAttribute('height') || ''
    const 指定宽 = 宽文本 ? 尺寸转像素(宽文本) : undefined
    const 指定高 = 高文本 ? 尺寸转像素(高文本) : undefined
    if (宽文本 && 指定宽 === undefined || 高文本 && 指定高 === undefined) throw new Error('图片尺寸单位尚不能保存')
    const 宽 = 指定宽 ?? (指定高 === undefined ? 信息.宽 : 指定高 * 信息.宽 / 信息.高)
    const 高 = 指定高 ?? (指定宽 === undefined ? 信息.高 : 指定宽 * 信息.高 / 信息.宽)
    if (![宽, 高].every((值) => Number.isFinite(值) && 值 > 0 && 值 <= 32768)) throw new Error('图片显示尺寸无效')
    return { 数据: 匹配[2], 格式: 信息.格式, 宽, 高, 说明: 元素.alt || '', ...(变换.旋转 ? { 旋转: 变换.旋转 } : {}), ...(变换.水平翻转 ? { 水平翻转: true } : {}), ...(变换.垂直翻转 ? { 垂直翻转: true } : {}) }
  } catch (错误) {
    未覆盖.add(错误 instanceof Error ? 错误.message : '图片数据无效')
    return undefined
  }
}

/** 旧版仅记录 max-width 的图片，保存前把实际显示尺寸固定到正文中。 */
export function 准备图片保存内容(根: HTMLElement): string {
  const 待更新: { 图片: HTMLImageElement; 宽: number; 高: number }[] = []
  for (const 图片 of 根.querySelectorAll('img')) {
    const 明确尺寸 = [图片.style.width, 图片.style.height, 图片.getAttribute('width'), 图片.getAttribute('height')]
      .some((值) => 值 && 值 !== 'auto')
    if (明确尺寸 || !图片.style.maxWidth || 图片.style.maxWidth === 'none') continue
    if (!图片.complete || 图片.naturalWidth <= 0 || 图片.naturalHeight <= 0) throw new Error('图片尚未加载完成，请等待显示后再保存')
    const 样式 = window.getComputedStyle(图片)
    const 宽 = 尺寸转像素(样式.width)
    const 高 = 尺寸转像素(样式.height)
    if (宽 === undefined || 高 === undefined || ![宽, 高].every((值) => Number.isFinite(值) && 值 > 0 && 值 <= 32768)) {
      throw new Error('未能获取图片显示尺寸，请返回正文后再保存')
    }
    待更新.push({ 图片, 宽, 高 })
  }
  // 所有图片均通过检查后才更新，避免失败时留下部分修改的正文。
  for (const { 图片, 宽, 高 } of 待更新) {
    图片.width = Math.round(宽)
    图片.height = Math.round(高)
    图片.style.width = `${宽}px`
    图片.style.height = `${高}px`
  }
  return 根.innerHTML
}

/** 本机插入时验证真实解码，按正文可用宽度等比缩小，记录明确的显示尺寸。 */
export async function 读取插入图片(文件: File, 最大宽: number): Promise<string> {
  if (文件.size > 单张最大字节) throw new Error('单张图片不能超过 20 MB')
  if (!Number.isFinite(最大宽) || 最大宽 <= 0) throw new Error('正文可用宽度无效，请返回文档后重新插入')
  const 文件数据 = await new Promise<string>((完成, 失败) => {
    const 读取器 = new FileReader()
    读取器.onload = () => typeof 读取器.result === 'string' ? 完成(读取器.result) : 失败(new Error('图片内容读取失败'))
    读取器.onerror = () => 失败(new Error('图片文件读取失败'))
    读取器.readAsDataURL(文件)
  })
  const 编码 = 文件数据.match(/^data:[^,]*;base64,([A-Za-z0-9+/=]+)$/i)?.[1]
  if (!编码) throw new Error('图片内容读取失败')
  const 图片 = 解码图片数据(编码)
  const 数据 = `data:image/${图片.格式};base64,${编码}`
  const 临时图片 = document.createElement('img')
  临时图片.src = 数据
  const 解码尺寸 = await new Promise<{ 宽: number; 高: number }>((完成, 失败) => {
    const 图像 = new Image()
    图像.onload = () => 图像.naturalWidth > 0 && 图像.naturalHeight > 0
      ? 完成({ 宽: 图像.naturalWidth, 高: 图像.naturalHeight }) : 失败(new Error('图片无法解码'))
    图像.onerror = () => 失败(new Error('图片无法解码，请检查文件内容'))
    图像.src = 数据
  })
  const 比例 = Math.min(1, 最大宽 / 解码尺寸.宽)
  临时图片.alt = 文件.name
  临时图片.width = Math.max(1, Math.round(解码尺寸.宽 * 比例))
  临时图片.height = Math.max(1, Math.round(解码尺寸.高 * 比例))
  临时图片.style.maxWidth = '100%'
  return 临时图片.outerHTML
}
