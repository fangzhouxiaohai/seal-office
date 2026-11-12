// 扫描图像处理：全部在本机完成，不上传。纯像素数组实现，便于在测试中用合成图验证。
// 流程：缩放到最长边 ≤ 2400 → 四角检测（灰度 + 自适应阈值分割 + 最大连通区域 + 四边形拟合，
// 失败退回整图）→ 透视校正（单应矩阵 + 双线性采样）→ 增强（去阴影后按彩色 / 灰度 / 黑白输出）。

export interface 点 { x: number; y: number }
export interface 像素图 { 宽: number; 高: number; 数据: Uint8ClampedArray }
export type 增强模式 = '彩色' | '灰度' | '黑白'
export type 四角 = [点, 点, 点, 点]

/** 本机处理的最长边上限，兼顾识别清晰度与低端机内存 */
export const 最长边上限 = 2400
/** 四角检测在缩小图上进行，速度与精度的折中 */
const 检测长边 = 512

export function 缩放尺寸(宽: number, 高: number, 上限 = 最长边上限): { 宽: number; 高: number; 比例: number } {
  const 比例 = Math.min(1, 上限 / Math.max(宽, 高))
  return { 宽: Math.max(1, Math.round(宽 * 比例)), 高: Math.max(1, Math.round(高 * 比例)), 比例 }
}

export function 整图四角(宽: number, 高: number): 四角 {
  return [{ x: 0, y: 0 }, { x: 宽, y: 0 }, { x: 宽, y: 高 }, { x: 0, y: 高 }]
}

const 亮度 = (数据: Uint8ClampedArray, 偏移: number) => 0.299 * 数据[偏移] + 0.587 * 数据[偏移 + 1] + 0.114 * 数据[偏移 + 2]

function 灰度缩略(图: 像素图, 长边: number): { 宽: number; 高: number; 灰: Float32Array; 比例: number } {
  const 尺寸 = 缩放尺寸(图.宽, 图.高, 长边), 灰 = new Float32Array(尺寸.宽 * 尺寸.高)
  const 步长X = 图.宽 / 尺寸.宽, 步长Y = 图.高 / 尺寸.高
  for (let y = 0; y < 尺寸.高; y++) for (let x = 0; x < 尺寸.宽; x++) {
    // 区域平均缩小，相当于一次低通滤波，抑制纸面纹理和噪点。
    const x0 = Math.floor(x * 步长X), x1 = Math.max(x0 + 1, Math.floor((x + 1) * 步长X)), y0 = Math.floor(y * 步长Y), y1 = Math.max(y0 + 1, Math.floor((y + 1) * 步长Y))
    let 和 = 0, 数 = 0
    for (let 源y = y0; 源y < y1; 源y++) for (let 源x = x0; 源x < x1; 源x++) { 和 += 亮度(图.数据, (源y * 图.宽 + 源x) * 4); 数 += 1 }
    灰[y * 尺寸.宽 + x] = 和 / 数
  }
  return { 宽: 尺寸.宽, 高: 尺寸.高, 灰, 比例: 尺寸.宽 / 图.宽 }
}

/** 大津法：返回阈值与类间方差占总方差的比例（可分性） */
function 大津阈值(灰: Float32Array): { 阈值: number; 可分性: number; 两类差: number } {
  const 直方图 = new Array(256).fill(0)
  for (const 值 of 灰) 直方图[Math.min(255, Math.max(0, Math.round(值)))] += 1
  const 总数 = 灰.length
  let 总和 = 0; for (let 值 = 0; 值 < 256; 值++) 总和 += 值 * 直方图[值]
  const 均值 = 总和 / 总数
  let 总方差 = 0; for (let 值 = 0; 值 < 256; 值++) 总方差 += 直方图[值] * (值 - 均值) ** 2
  let 最佳 = 0, 阈值 = 0, 背景数 = 0, 背景和 = 0, 两类差 = 0
  for (let 值 = 0; 值 < 256; 值++) {
    背景数 += 直方图[值]; 背景和 += 值 * 直方图[值]
    const 前景数 = 总数 - 背景数
    if (!背景数 || !前景数) continue
    const 背景均值 = 背景和 / 背景数, 前景均值 = (总和 - 背景和) / 前景数
    const 类间 = 背景数 * 前景数 * (背景均值 - 前景均值) ** 2 / 总数
    if (类间 > 最佳) { 最佳 = 类间; 阈值 = 值; 两类差 = 前景均值 - 背景均值 }
  }
  return { 阈值, 可分性: 总方差 > 0 ? 最佳 / 总方差 : 0, 两类差 }
}

function 多边形面积(角: 点[]): number {
  let 面积 = 0
  for (let 序号 = 0; 序号 < 角.length; 序号++) { const 甲 = 角[序号], 乙 = 角[(序号 + 1) % 角.length]; 面积 += 甲.x * 乙.y - 乙.x * 甲.y }
  return Math.abs(面积) / 2
}

function 是凸四边形(角: 点[]): boolean {
  let 符号 = 0
  for (let 序号 = 0; 序号 < 4; 序号++) {
    const 甲 = 角[序号], 乙 = 角[(序号 + 1) % 4], 丙 = 角[(序号 + 2) % 4]
    const 叉积 = (乙.x - 甲.x) * (丙.y - 乙.y) - (乙.y - 甲.y) * (丙.x - 乙.x)
    if (Math.abs(叉积) < 1e-9) return false
    if (符号 && Math.sign(叉积) !== 符号) return false
    符号 = Math.sign(叉积)
  }
  return true
}

/**
 * 检测文档四角。纸面通常比背景亮：用大津阈值分出亮区，取最大连通区域，
 * 再用 x±y 的极值点得到左上、右上、右下、左下四角，并校验区域确实接近四边形。
 * 任何一步不满足时返回整图四角并标记未检测，由用户手动拖动四角。
 */
export function 检测文档四角(图: 像素图): { 四角: 四角; 已检测: boolean } {
  const 失败 = { 四角: 整图四角(图.宽, 图.高), 已检测: false }
  if (图.宽 < 16 || 图.高 < 16) return 失败
  const 缩略 = 灰度缩略(图, 检测长边), { 宽, 高, 灰 } = 缩略
  const 分割 = 大津阈值(灰)
  if (分割.可分性 < 0.5 || 分割.两类差 < 40) return 失败
  const 亮 = new Uint8Array(宽 * 高)
  for (let 序号 = 0; 序号 < 灰.length; 序号++) 亮[序号] = 灰[序号] > 分割.阈值 ? 1 : 0
  // 最大四连通亮区域
  const 标记 = new Int32Array(宽 * 高), 队列 = new Int32Array(宽 * 高)
  let 最大标签 = 0, 最大面积 = 0, 标签 = 0
  for (let 起点 = 0; 起点 < 亮.length; 起点++) {
    if (!亮[起点] || 标记[起点]) continue
    标签 += 1; let 头 = 0, 尾 = 0; 队列[尾++] = 起点; 标记[起点] = 标签
    while (头 < 尾) {
      const 当前 = 队列[头++], x = 当前 % 宽, y = (当前 - x) / 宽
      const 邻居 = [x > 0 ? 当前 - 1 : -1, x < 宽 - 1 ? 当前 + 1 : -1, y > 0 ? 当前 - 宽 : -1, y < 高 - 1 ? 当前 + 宽 : -1]
      for (const 下一个 of 邻居) if (下一个 >= 0 && 亮[下一个] && !标记[下一个]) { 标记[下一个] = 标签; 队列[尾++] = 下一个 }
    }
    if (尾 > 最大面积) { 最大面积 = 尾; 最大标签 = 标签 }
  }
  if (最大面积 < 宽 * 高 * 0.08 || 最大面积 > 宽 * 高 * 0.97) return 失败
  let 左上 = { x: 0, y: 0, 值: Infinity }, 右上 = { x: 0, y: 0, 值: -Infinity }, 右下 = { x: 0, y: 0, 值: -Infinity }, 左下 = { x: 0, y: 0, 值: -Infinity }
  for (let 序号 = 0; 序号 < 标记.length; 序号++) {
    if (标记[序号] !== 最大标签) continue
    const x = 序号 % 宽, y = (序号 - x) / 宽
    if (x + y < 左上.值) 左上 = { x, y, 值: x + y }
    if (x - y > 右上.值) 右上 = { x: x + 1, y, 值: x - y }
    if (x + y > 右下.值) 右下 = { x: x + 1, y: y + 1, 值: x + y }
    if (y - x > 左下.值) 左下 = { x, y: y + 1, 值: y - x }
  }
  const 缩略角 = [左上, 右上, 右下, 左下].map(({ x, y }) => ({ x, y }))
  const 四边形面积 = 多边形面积(缩略角)
  if (!是凸四边形(缩略角) || 四边形面积 < 最大面积 * 0.85 || 四边形面积 > 最大面积 * 1.15) return 失败
  const 比例 = 缩略.比例
  const 四角 = 缩略角.map(({ x, y }) => ({ x: Math.min(图.宽, Math.max(0, x / 比例)), y: Math.min(图.高, Math.max(0, y / 比例)) })) as 四角
  return { 四角, 已检测: true }
}

/** 解 8 元线性方程组，得到把 源点 映射到 目标点 的单应矩阵（h33 = 1） */
export function 求解单应矩阵(源: 点[], 目标: 点[]): number[] {
  const 矩阵: number[][] = []
  for (let 序号 = 0; 序号 < 4; 序号++) {
    const { x, y } = 源[序号], { x: u, y: v } = 目标[序号]
    矩阵.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    矩阵.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }
  for (let 列 = 0; 列 < 8; 列++) {
    let 主行 = 列
    for (let 行 = 列 + 1; 行 < 8; 行++) if (Math.abs(矩阵[行][列]) > Math.abs(矩阵[主行][列])) 主行 = 行
    if (Math.abs(矩阵[主行][列]) < 1e-12) throw new Error('四角位置无效，无法校正，请重新调整四角')
    ;[矩阵[列], 矩阵[主行]] = [矩阵[主行], 矩阵[列]]
    for (let 行 = 0; 行 < 8; 行++) {
      if (行 === 列) continue
      const 系数 = 矩阵[行][列] / 矩阵[列][列]
      for (let 序号 = 列; 序号 < 9; 序号++) 矩阵[行][序号] -= 系数 * 矩阵[列][序号]
    }
  }
  return [...矩阵.map((行, 序号) => 行[8] / 行[序号]), 1]
}

export function 应用单应(矩阵: number[], 点值: 点): 点 {
  const 分母 = 矩阵[6] * 点值.x + 矩阵[7] * 点值.y + 矩阵[8]
  return { x: (矩阵[0] * 点值.x + 矩阵[1] * 点值.y + 矩阵[2]) / 分母, y: (矩阵[3] * 点值.x + 矩阵[4] * 点值.y + 矩阵[5]) / 分母 }
}

const 距离 = (甲: 点, 乙: 点) => Math.hypot(甲.x - 乙.x, 甲.y - 乙.y)

export function 校正输出尺寸(角: 点[]): { 宽: number; 高: number } {
  const 宽 = Math.max(距离(角[0], 角[1]), 距离(角[3], 角[2])), 高 = Math.max(距离(角[0], 角[3]), 距离(角[1], 角[2]))
  if (宽 < 8 || 高 < 8) throw new Error('四角围成的区域太小，请重新调整四角')
  const 尺寸 = 缩放尺寸(宽, 高)
  return { 宽: 尺寸.宽, 高: 尺寸.高 }
}

/** 透视校正：把四角围成的区域拉平为矩形，双线性采样 */
export function 透视校正(图: 像素图, 角: 点[]): 像素图 {
  if (角.length !== 4 || !是凸四边形(角)) throw new Error('四角需围成凸四边形，请重新调整四角')
  const { 宽, 高 } = 校正输出尺寸(角)
  const 矩阵 = 求解单应矩阵([{ x: 0, y: 0 }, { x: 宽, y: 0 }, { x: 宽, y: 高 }, { x: 0, y: 高 }], 角)
  const 数据 = new Uint8ClampedArray(宽 * 高 * 4), 源 = 图.数据
  for (let y = 0; y < 高; y++) for (let x = 0; x < 宽; x++) {
    const 位置 = 应用单应(矩阵, { x: x + 0.5, y: y + 0.5 })
    const 源x = Math.min(图.宽 - 1, Math.max(0, 位置.x - 0.5)), 源y = Math.min(图.高 - 1, Math.max(0, 位置.y - 0.5))
    const x0 = Math.floor(源x), y0 = Math.floor(源y), x1 = Math.min(图.宽 - 1, x0 + 1), y1 = Math.min(图.高 - 1, y0 + 1), 横 = 源x - x0, 纵 = 源y - y0
    const 目标 = (y * 宽 + x) * 4
    for (let 通道 = 0; 通道 < 4; 通道++) {
      const 上 = 源[(y0 * 图.宽 + x0) * 4 + 通道] * (1 - 横) + 源[(y0 * 图.宽 + x1) * 4 + 通道] * 横
      const 下 = 源[(y1 * 图.宽 + x0) * 4 + 通道] * (1 - 横) + 源[(y1 * 图.宽 + x1) * 4 + 通道] * 横
      数据[目标 + 通道] = 上 * (1 - 纵) + 下 * 纵
    }
  }
  return { 宽, 高, 数据 }
}

/** 估计纸面光照：分块取亮度上分位，再做 3×3 最大值扩张与双线性插值，得到逐像素背景亮度 */
function 估计背景(图: 像素图): Float32Array {
  const 块 = Math.max(8, Math.round(Math.max(图.宽, 图.高) / 24))
  const 列数 = Math.ceil(图.宽 / 块), 行数 = Math.ceil(图.高 / 块), 块值 = new Float32Array(列数 * 行数)
  for (let 块y = 0; 块y < 行数; 块y++) for (let 块x = 0; 块x < 列数; 块x++) {
    const 值列表: number[] = []
    for (let y = 块y * 块; y < Math.min(图.高, (块y + 1) * 块); y += 2) for (let x = 块x * 块; x < Math.min(图.宽, (块x + 1) * 块); x += 2) 值列表.push(亮度(图.数据, (y * 图.宽 + x) * 4))
    值列表.sort((甲, 乙) => 甲 - 乙)
    块值[块y * 列数 + 块x] = 值列表[Math.floor((值列表.length - 1) * 0.9)] ?? 255
  }
  const 扩张 = new Float32Array(块值.length)
  for (let 块y = 0; 块y < 行数; 块y++) for (let 块x = 0; 块x < 列数; 块x++) {
    let 最大 = 0
    for (let 偏y = -1; 偏y <= 1; 偏y++) for (let 偏x = -1; 偏x <= 1; 偏x++) {
      const 邻x = 块x + 偏x, 邻y = 块y + 偏y
      if (邻x >= 0 && 邻y >= 0 && 邻x < 列数 && 邻y < 行数) 最大 = Math.max(最大, 块值[邻y * 列数 + 邻x])
    }
    扩张[块y * 列数 + 块x] = Math.max(24, 最大)
  }
  const 背景 = new Float32Array(图.宽 * 图.高)
  for (let y = 0; y < 图.高; y++) for (let x = 0; x < 图.宽; x++) {
    const 格x = Math.min(列数 - 1, Math.max(0, (x + 0.5) / 块 - 0.5)), 格y = Math.min(行数 - 1, Math.max(0, (y + 0.5) / 块 - 0.5))
    const x0 = Math.floor(格x), y0 = Math.floor(格y), x1 = Math.min(列数 - 1, x0 + 1), y1 = Math.min(行数 - 1, y0 + 1), 横 = 格x - x0, 纵 = 格y - y0
    背景[y * 图.宽 + x] = (扩张[y0 * 列数 + x0] * (1 - 横) + 扩张[y0 * 列数 + x1] * 横) * (1 - 纵) + (扩张[y1 * 列数 + x0] * (1 - 横) + 扩张[y1 * 列数 + x1] * 横) * 纵
  }
  return 背景
}

/** 增强三档：先按光照背景归一化去除阴影，再提升对比度；黑白档做二值化 */
export function 增强图像(图: 像素图, 模式: 增强模式): 像素图 {
  const 背景 = 估计背景(图), 数据 = new Uint8ClampedArray(图.数据.length), 黑点 = 30
  const 拉伸 = (值: number) => (值 - 黑点) * 255 / (255 - 黑点)
  for (let 序号 = 0; 序号 < 背景.length; 序号++) {
    const 偏移 = 序号 * 4, 系数 = 255 / 背景[序号]
    if (模式 === '彩色') {
      for (let 通道 = 0; 通道 < 3; 通道++) 数据[偏移 + 通道] = 拉伸(图.数据[偏移 + 通道] * 系数)
    } else {
      const 归一 = 亮度(图.数据, 偏移) * 系数
      const 值 = 模式 === '黑白' ? (归一 < 170 ? 0 : 255) : 拉伸(归一)
      数据[偏移] = 数据[偏移 + 1] = 数据[偏移 + 2] = 值
    }
    数据[偏移 + 3] = 255
  }
  return { 宽: 图.宽, 高: 图.高, 数据 }
}

/** 原图按 90° 整数倍旋转（拍摄方向不对时使用） */
export function 旋转九十度(图: 像素图, 次数: number): 像素图 {
  const 步数 = ((次数 % 4) + 4) % 4
  if (!步数) return 图
  const 交换 = 步数 % 2 === 1, 宽 = 交换 ? 图.高 : 图.宽, 高 = 交换 ? 图.宽 : 图.高, 数据 = new Uint8ClampedArray(图.数据.length)
  for (let y = 0; y < 图.高; y++) for (let x = 0; x < 图.宽; x++) {
    const [新x, 新y] = 步数 === 1 ? [图.高 - 1 - y, x] : 步数 === 2 ? [图.宽 - 1 - x, 图.高 - 1 - y] : [y, 图.宽 - 1 - x]
    数据.set(图.数据.subarray((y * 图.宽 + x) * 4, (y * 图.宽 + x) * 4 + 4), (新y * 宽 + 新x) * 4)
  }
  return { 宽, 高, 数据 }
}
