export interface 图片变换 { 旋转: number; 水平翻转: boolean; 垂直翻转: boolean }
export function 规范角度(角度: number): number {
  if (!Number.isFinite(角度)) throw new Error('图片旋转角度无效')
  return ((角度 % 360) + 360) % 360
}
/** 仅接收编辑器支持且能写回 DOCX 的旋转和镜像，不静默丢弃任意 CSS 变换。 */
export function 读取图片变换(样式: string): 图片变换 {
  if (!样式 || 样式 === 'none') return { 旋转: 0, 水平翻转: false, 垂直翻转: false }
  const 匹配 = 样式.trim().match(/^rotate\(\s*(-?\d+(?:\.\d+)?)deg\s*\)(?:\s+scale\(\s*(-?1)\s*,\s*(-?1)\s*\))?$/)
  if (!匹配) throw new Error('图片包含尚不能保存的变换')
  return { 旋转: 规范角度(Number(匹配[1])), 水平翻转: 匹配[2] === '-1', 垂直翻转: 匹配[3] === '-1' }
}
export function 图片变换样式(变换: 图片变换): string {
  return `rotate(${规范角度(变换.旋转)}deg) scale(${变换.水平翻转 ? -1 : 1}, ${变换.垂直翻转 ? -1 : 1})`
}
