// 文稿页面尺寸：读取、校验与单位换算。
// 画布以 72dpi 为基准，因此画布像素与 PDF 点一一对应（960px = 13.333in = 960pt）。
// 页面尺寸字段由主题/母版模块定义，这里复用同一套校验规则，避免编辑区与导出对合法尺寸判断不一致。
import { 校验页面尺寸 as 校验模型页面尺寸, 读取页面尺寸 as 读取模型页面尺寸, 默认页面尺寸 as 模型默认页面尺寸 } from './themes'

export interface 页面尺寸 {
  宽: number
  高: number
  /** 仅作为导入时的方向提示；文稿模型只保存宽高 */
  方向?: '横向' | '纵向'
}

export const 默认页面尺寸: 页面尺寸 = { ...模型默认页面尺寸 }

/** 校验与文稿模型使用同一范围（120 到 10000 的整数），方向提示单独校验 */
export function 校验页面尺寸(输入: unknown): asserts 输入 is 页面尺寸 {
  校验模型页面尺寸(输入)
  const 记录 = 输入 as unknown as Record<string, unknown>
  if (记录.方向 !== undefined && 记录.方向 !== '横向' && 记录.方向 !== '纵向') throw new Error('页面方向无效')
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
  const 模型尺寸 = 读取模型页面尺寸({ 页面尺寸: { 宽, 高 } } as never)
  return { 宽: 模型尺寸.宽, 高: 模型尺寸.高 }
}

/** 画布像素转 PDF 点（72dpi 基准，1:1） */
export function 像素转点(像素: number): number {
  return Math.round(像素 * 100) / 100
}

/** 画布像素转英寸，供图片型 PPTX 布局使用 */
export function 像素转英寸(像素: number): number {
  return Math.round((像素 / 72) * 10000) / 10000
}
