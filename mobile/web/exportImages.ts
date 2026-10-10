import { 读取图片变换 } from '../../renderer/src/office/imageTransform'
import { 读取文档图片 } from '../../renderer/src/office/docImages'
import { 识别用图片 } from '../../renderer/src/editor/imagePixels'

/** html-to-pdfmake 不处理 CSS transform，在独立导出副本中固化图片效果。 */
export async function preparePdfImages(body: HTMLElement): Promise<void> {
  for (const image of Array.from(body.querySelectorAll('img'))) {
    if (!image.style.transform || image.style.transform === 'none') continue
    const transform = 读取图片变换(image.style.transform)
    if (!transform.旋转 && !transform.水平翻转 && !transform.垂直翻转) { image.style.removeProperty('transform'); continue }
    const warnings = new Set<string>(), info = 读取文档图片(image, warnings)
    if (!info) throw new Error('图片无法导出：' + [...warnings].join('；'))
    const rendered = await 识别用图片(image.src, transform)
    const angle = transform.旋转 * Math.PI / 180
    const width = Math.abs(info.宽 * Math.cos(angle)) + Math.abs(info.高 * Math.sin(angle))
    const height = Math.abs(info.宽 * Math.sin(angle)) + Math.abs(info.高 * Math.cos(angle))
    image.src = 'data:image/png;base64,' + rendered.数据
    image.style.removeProperty('transform')
    image.style.width = `${width}px`; image.style.height = `${height}px`
    image.width = Math.round(width); image.height = Math.round(height)
  }
}
