// 文稿页面尺寸：读取、校验与单位换算。
// 画布以 72dpi 为基准，因此画布像素与 PDF 点一一对应（960px = 13.333in = 960pt）。
// 页面尺寸字段由主题/母版任务引入，此处只读取并在缺失时回退，不实现设置本身。
export interface 页面尺寸 {
  宽: number
  高: number
  方向?: '横向' | '纵向'
}

export const 默认页面尺寸: 页面尺寸 = { 宽: 960, 高: 540 }

/** 支持范围：1 到 10000 画布像素，覆盖 4:3、16:9 与常见自定义尺寸 */
const 最小边 = 1
const 最大边 = 10000

export function 校验页面尺寸(输入: unknown): asserts 输入 is 页面尺寸 {
  if (typeof 输入 !== 'object' || 输入 === null) throw new Error('页面尺寸无效：不是对象')
  const 记录 = 输入 as Record<string, unknown>
  if (typeof 记录.宽 !== 'number' || !Number.isFinite(记录.宽) || 记录.宽 < 最小边) throw new Error('页面宽度无效')
  if (typeof 记录.高 !== 'number' || !Number.isFinite(记录.高) || 记录.高 < 最小边) throw new Error('页面高度无效')
  if (记录.方向 !== undefined && 记录.方向 !== '横向' && 记录.方向 !== '纵向') throw new Error('页面方向无效')
  if (记录.宽 > 最大边 || 记录.高 > 最大边) throw new Error('页面尺寸超出支持范围')
}

/** 读取文稿页面尺寸；字段缺失时回退 960×540，非法值给出真实原因 */
export function 读取页面尺寸(文稿: unknown): 页面尺寸 {
  const 记录 = typeof 文稿 === 'object' && 文稿 !== null ? (文稿 as Record<string, unknown>) : {}
  const 原始 = 记录.页面尺寸
  if (原始 === undefined || 原始 === null) return { ...默认页面尺寸 }
  校验页面尺寸(原始)
  const 尺寸 = 原始 as 页面尺寸
  const 宽 = Math.round(尺寸.宽)
  const 高 = Math.round(尺寸.高)
  if (尺寸.方向 === '横向') return { 宽: Math.max(宽, 高), 高: Math.min(宽, 高), 方向: '横向' }
  if (尺寸.方向 === '纵向') return { 宽: Math.min(宽, 高), 高: Math.max(宽, 高), 方向: '纵向' }
  return { 宽, 高 }
}

/** 画布像素转 PDF 点（72dpi 基准，1:1） */
export function 像素转点(像素: number): number {
  return Math.round(像素 * 100) / 100
}

/** 画布像素转英寸，供图片型 PPTX 布局使用 */
export function 像素转英寸(像素: number): number {
  return Math.round((像素 / 72) * 10000) / 10000
}
