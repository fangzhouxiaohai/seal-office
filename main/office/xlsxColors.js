// 表格颜色解析：直接 ARGB、索引色（含样式表自定义调色板）、主题色及色调。
// 解析失败时按“保真风险”提示；边框颜色只影响观感，任何情况下都不提示。
const { 颜色告警 } = require('./warningLevels')

/** Excel 默认调色板：0-7 为旧版保留色，8-63 为标准 56 色。 */
const 默认索引色 = [
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080',
  '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
  '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF',
  '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696',
  '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333',
]
/** 索引 64 为系统前景（自动，通常为黑色），65 为系统背景（通常为白色）。 */
const 系统前景索引 = 64
const 系统背景索引 = 65

/** 文件缺少主题部件时 Excel 使用的默认 Office 主题，按 SpreadsheetML 主题索引顺序排列。 */
const 默认主题色 = ['FFFFFF', '000000', 'EEECE1', '1F497D', '4F81BD', 'C0504D', '9BBB59', '8064A2', '4BACC6', 'F79646', '0000FF', '800080']

/** 读取 styles.xml 中的自定义索引调色板；没有时返回 null。 */
async function 读取索引调色板(压缩包) {
  const 文件 = 压缩包.file('xl/styles.xml')
  if (!文件) return null
  const xml = await 文件.async('string')
  const 内容 = xml.match(/<(?:[\w.-]+:)?indexedColors\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?indexedColors>/)?.[1]
  if (!内容) return null
  const 列表 = [...内容.matchAll(/<(?:[\w.-]+:)?rgbColor\b[^>]*\brgb="([0-9a-fA-F]{6,8})"[^>]*\/?>/g)].map((匹配) => 匹配[1].slice(-6).toUpperCase())
  return 列表.length ? 列表 : null
}

/** RGB 转 HLS，三个分量均为 0-1 连续值。 */
function 转Hls(红, 绿, 蓝) {
  const [r, g, b] = [红 / 255, 绿 / 255, 蓝 / 255]
  const 最大 = Math.max(r, g, b)
  const 最小 = Math.min(r, g, b)
  const 亮度 = (最大 + 最小) / 2
  if (最大 === 最小) return [0, 亮度, 0]
  const 差 = 最大 - 最小
  const 饱和度 = 亮度 <= 0.5 ? 差 / (最大 + 最小) : 差 / (2 - 最大 - 最小)
  let 色相 = r === 最大 ? (g - b) / 差 : g === 最大 ? 2 + (b - r) / 差 : 4 + (r - g) / 差
  色相 = (色相 / 6) % 1
  if (色相 < 0) 色相 += 1
  return [色相, 亮度, 饱和度]
}

function 色相分量(m1, m2, 色相) {
  const h = ((色相 % 1) + 1) % 1
  if (h < 1 / 6) return m1 + (m2 - m1) * h * 6
  if (h < 0.5) return m2
  if (h < 2 / 3) return m1 + (m2 - m1) * (2 / 3 - h) * 6
  return m1
}

function 转Rgb(色相, 亮度, 饱和度) {
  if (饱和度 === 0) return [亮度, 亮度, 亮度]
  const m2 = 亮度 <= 0.5 ? 亮度 * (1 + 饱和度) : 亮度 + 饱和度 - 亮度 * 饱和度
  const m1 = 2 * 亮度 - m2
  return [色相分量(m1, m2, 色相 + 1 / 3), 色相分量(m1, m2, 色相), 色相分量(m1, m2, 色相 - 1 / 3)]
}

/**
 * 按 OOXML 规范对颜色应用色调：在 HLS 亮度通道上运算，亮度范围取 HLSMAX=255。
 * tint < 0：L' = L × (1 + tint)；tint > 0：L' = L × (1 − tint) + (HLSMAX − HLSMAX × (1 − tint))。
 * 中间值不取整、最终分量向下取整，与 Excel 主题色板逐色比对误差不超过 1。
 */
function 应用色调(十六进制, 色调) {
  if (!Number.isFinite(色调) || 色调 === 0) return 十六进制.toUpperCase()
  const t = Math.max(-1, Math.min(1, 色调))
  const 分量 = [0, 2, 4].map((位) => parseInt(十六进制.slice(位, 位 + 2), 16))
  const [色相, 亮度, 饱和度] = 转Hls(...分量)
  const HLSMAX = 255
  const 原亮度 = 亮度 * HLSMAX
  const 新亮度 = t < 0 ? 原亮度 * (1 + t) : 原亮度 * (1 - t) + (HLSMAX - HLSMAX * (1 - t))
  return 转Rgb(色相, Math.max(0, Math.min(HLSMAX, 新亮度)) / HLSMAX, 饱和度)
    .map((值) => Math.max(0, Math.min(255, Math.floor(值 * 255 + 1e-9))).toString(16).padStart(2, '0'))
    .join('').toUpperCase()
}

/**
 * 解析一个 ExcelJS 颜色对象，返回 #RRGGBB；返回 undefined 表示自动色或无法解析。
 * 上下文.用途：'字体' | '填充' | '边框'；边框颜色无法解析时不提示。
 * 带透明度的 ARGB 忽略透明通道、保留 RGB，与 Excel 界面显示一致（Excel 不渲染单元格颜色透明度）。
 */
function 解析颜色(颜色, 警告, 上下文 = {}) {
  if (!颜色 || typeof 颜色 !== 'object') return undefined
  const 用途 = 上下文.用途 ?? '字体'
  const 提示 = () => { if (用途 !== '边框') 警告.add(颜色告警) }
  const 色调 = Number.isFinite(颜色.tint) ? 颜色.tint : 0
  if (typeof 颜色.argb === 'string') {
    const 值 = 颜色.argb.trim()
    if (/^[0-9a-f]{8}$/i.test(值)) return `#${应用色调(值.slice(2), 色调)}`
    if (/^[0-9a-f]{6}$/i.test(值)) return `#${应用色调(值, 色调)}`
    提示()
    return undefined
  }
  if (颜色.theme !== undefined) {
    const 主题索引 = 颜色.theme
    const 文件主题 = 上下文.主题颜色
    const 色值 = Number.isInteger(主题索引) ? 文件主题?.[主题索引] : undefined
    if (色值) return `#${应用色调(色值, 色调)}`
    // 文件缺少主题部件时按默认 Office 主题近似显示，并如实提示。
    if (Number.isInteger(主题索引) && !文件主题?.length && 默认主题色[主题索引]) {
      提示()
      return `#${应用色调(默认主题色[主题索引], 色调)}`
    }
    提示()
    return undefined
  }
  if (颜色.indexed !== undefined) {
    const 索引 = 颜色.indexed
    if (索引 === 系统前景索引) return 用途 === '填充' ? '#000000' : undefined
    if (索引 === 系统背景索引) return 用途 === '填充' ? '#FFFFFF' : undefined
    const 调色板 = 上下文.索引调色板 ?? 默认索引色
    const 色值 = Number.isInteger(索引) && 索引 >= 0 ? 调色板[索引] ?? 默认索引色[索引] : undefined
    if (色值) return `#${应用色调(色值, 色调)}`
    提示()
    return undefined
  }
  // auto="1" 或空颜色元素：按单元格默认前景处理，不写显式颜色。
  if (颜色.auto !== undefined || Object.keys(颜色).length === 0) return undefined
  提示()
  return undefined
}

module.exports = { 解析颜色, 应用色调, 读取索引调色板, 默认索引色 }
