import type { 像素图, 点 } from './imageProcessing'

export interface 擦除笔画设置 { 半径: number; 路径: 点[] }

/** 只在书脊可能出现的中部取样。整列持续变暗才视为书缝，局部字符不会拉偏分割位置。 */
function 查找中缝(图: 像素图): number {
  const 中心 = Math.round(图.宽 / 2)
  if (图.宽 < 8) return 中心
  const 左 = Math.floor(图.宽 * 0.3), 右 = Math.ceil(图.宽 * 0.7)
  const 亮度: number[] = []
  for (let x = 左; x <= 右; x++) {
    const 列: number[] = []
    for (let y = Math.floor(图.高 * 0.12); y < 图.高 * 0.88; y += Math.max(1, Math.floor(图.高 / 80))) {
      const i = (y * 图.宽 + x) * 4
      列.push((图.数据[i] * 3 + 图.数据[i + 1] * 6 + 图.数据[i + 2]) / 10)
    }
    列.sort((a, b) => a - b)
    亮度.push(列[Math.floor(列.length * 0.65)])
  }
  const 背景 = [...亮度].sort((a, b) => a - b)[Math.floor(亮度.length / 2)]
  let 最低 = 背景 - 14, 中缝 = 中心
  for (let x = 左 + 1; x < 右; x++) {
    const i = x - 左
    const 分数 = (亮度[i - 1] + 亮度[i] * 2 + 亮度[i + 1]) / 4 + 8 * Math.abs(x - 中心) / (右 - 左)
    if (分数 < 最低) { 最低 = 分数; 中缝 = x }
  }
  return 中缝
}

export function 拆分书页(图: 像素图, 比例?: number): [像素图, 像素图] {
  if (图.宽 < 2 || !图.高) throw new Error('图片过窄，无法拆分成两页')
  const 中缝 = 比例 === undefined ? 查找中缝(图) : Math.max(1, Math.min(图.宽 - 1, Math.round(图.宽 * 比例)))
  const 切页 = (起: number, 宽: number): 像素图 => {
    const 数据 = new Uint8ClampedArray(宽 * 图.高 * 4)
    for (let y = 0; y < 图.高; y++) {
      const 行首 = (y * 图.宽 + 起) * 4
      数据.set(图.数据.subarray(行首, 行首 + 宽 * 4), y * 宽 * 4)
    }
    return { 宽, 高: 图.高, 数据 }
  }
  return [切页(0, 中缝), 切页(中缝, 图.宽 - 中缝)]
}

/** 使用八邻域较亮的中性纸色填充，保留纸面光照；扫描原图始终保留。 */
function 纸色(图: 像素图, x: number, y: number, 距离: number): number[] {
  const 采样: number[][] = []
  for (const dy of [-距离, 0, 距离]) for (const dx of [-距离, 0, 距离]) {
    if (!dx && !dy) continue
    const i = (Math.max(0, Math.min(图.高 - 1, y + dy)) * 图.宽 + Math.max(0, Math.min(图.宽 - 1, x + dx))) * 4
    const [r, g, b] = 图.数据.subarray(i, i + 3)
    if (Math.min(r, g, b) >= 145 && Math.max(r, g, b) - Math.min(r, g, b) < 50) 采样.push([r, g, b])
  }
  if (!采样.length) return [255, 255, 255]
  采样.sort((a, b) => a[1] - b[1])
  return 采样[Math.floor(采样.length * 0.65)]
}

export function 清除彩色笔迹(图: 像素图): 像素图 {
  const 数据 = new Uint8ClampedArray(图.数据)
  const 间距 = Math.max(3, Math.round(Math.min(图.宽, 图.高) / 180))
  const 区宽 = Math.max(8, 间距 * 2), 列数 = Math.ceil(图.宽 / 区宽)
  const 区域纸色 = new Map<number, number[]>()
  for (let i = 0; i < 数据.length; i += 4) {
    const r = 数据[i], g = 数据[i + 1], b = 数据[i + 2]
    const 红笔 = r - g > 27 && r - b > 22, 蓝笔 = b - r > 24 && b - g > 14
    if (!(红笔 || 蓝笔)) continue
    const x = i / 4 % 图.宽, y = Math.floor(i / 4 / 图.宽), 键 = Math.floor(y / 区宽) * 列数 + Math.floor(x / 区宽)
    let 颜色 = 区域纸色.get(键)
    if (!颜色) { 颜色 = 纸色(图, x, y, 间距); 区域纸色.set(键, 颜色) }
    数据.set(颜色, i)
  }
  return { ...图, 数据 }
}

export function 擦除笔画(图: 像素图, 笔画: 擦除笔画设置[]): 像素图 {
  const 数据 = new Uint8ClampedArray(图.数据)
  for (const 画线 of 笔画) {
    const 半径 = Math.max(1, Math.round(画线.半径 * Math.min(图.宽, 图.高)))
    const 涂点 = (x: number, y: number) => {
      const 背景 = 纸色(图, Math.round(x), Math.round(y), 半径 + 3)
      for (let 行 = Math.max(0, Math.floor(y - 半径)); 行 <= Math.min(图.高 - 1, y + 半径); 行++) {
        const 半宽 = Math.sqrt(Math.max(0, 半径 ** 2 - (行 - y) ** 2))
        for (let 列 = Math.max(0, Math.ceil(x - 半宽)); 列 <= Math.min(图.宽 - 1, x + 半宽); 列++) 数据.set(背景, (行 * 图.宽 + 列) * 4)
      }
    }
    let 前: 点 | undefined
    for (const 点 of 画线.路径) {
      const 当前 = { x: 点.x * (图.宽 - 1), y: 点.y * (图.高 - 1) }
      const 起点 = 前 ?? 当前
      const 步数 = Math.max(1, Math.ceil(Math.hypot(当前.x - 起点.x, 当前.y - 起点.y) / Math.max(1, 半径 / 2)))
      for (let n = 1; n <= 步数; n++) 涂点(起点.x + (当前.x - 起点.x) * n / 步数, 起点.y + (当前.y - 起点.y) * n / 步数)
      前 = 当前
    }
  }
  return { ...图, 数据 }
}
