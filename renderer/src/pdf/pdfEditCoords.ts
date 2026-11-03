// PDF 编辑模式的坐标换算。
//
// 主进程 main/pdf/pdfTools.js 的「编辑页面」接受的坐标是：
//   以页面左上角为原点、x 向右、y 向下，单位为 PDF 点。
// 内部再换算成 PDF 用户空间（左下角原点）绘制。
//
// 这里把鼠标在页面元素内的像素偏移换成同一套「左上角原点」坐标，
// 保证界面点选的结果能直接填进编辑参数，不出现上下颠倒。

export interface 点选输入 {
  /** 鼠标在页面元素内的偏移（左上角为原点，单位像素） */
  偏移X: number
  偏移Y: number
  /** 页面元素当前显示尺寸（像素） */
  显示宽: number
  显示高: number
  /** 该页在 PDF 中的原始尺寸（pt） */
  页宽: number
  页高: number
}

export interface 点选结果 {
  /** 与编辑接口一致的坐标：左上角原点，y 向下 */
  x: number
  y: number
}

/**
 * 把页面内的鼠标偏移换算成编辑接口使用的坐标。
 * 越界会被夹到页内，避免生成落在页面外的内容。
 */
export function 换算PDF坐标(输入: 点选输入): 点选结果 {
  const { 偏移X, 偏移Y, 显示宽, 显示高, 页宽, 页高 } = 输入
  if (显示宽 <= 0 || 显示高 <= 0 || 页宽 <= 0 || 页高 <= 0) return { x: 0, y: 0 }
  const 比例X = 页宽 / 显示宽
  const 比例Y = 页高 / 显示高
  return {
    x: 取一位小数(钳制(偏移X * 比例X, 0, 页宽)),
    y: 取一位小数(钳制(偏移Y * 比例Y, 0, 页高)),
  }
}

/** 把像素尺寸换算成 PDF 尺寸 */
export function 换算PDF尺寸(输入: { 像素宽: number; 像素高: number; 显示宽: number; 显示高: number; 页宽: number; 页高: number }): { 宽: number; 高: number } {
  const { 像素宽, 像素高, 显示宽, 显示高, 页宽, 页高 } = 输入
  if (显示宽 <= 0 || 显示高 <= 0) return { 宽: 0, 高: 0 }
  return {
    宽: Math.max(1, 取一位小数(钳制(像素宽 * 页宽 / 显示宽, 1, 页宽))),
    高: Math.max(1, 取一位小数(钳制(像素高 * 页高 / 显示高, 1, 页高))),
  }
}

function 钳制(值: number, 最小: number, 最大: number): number {
  return Math.min(最大, Math.max(最小, 值))
}

/** 保留一位小数：编辑器输入框不接受过长小数 */
function 取一位小数(值: number): number {
  return Math.round(值 * 10) / 10
}
