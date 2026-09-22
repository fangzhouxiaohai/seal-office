// 演示文稿数据模型：幻灯片与文本框的增删改。
// 全部为纯函数，返回新对象，便于配合撤销重做使用。

export interface 文本框 {
  id: string
  x: number
  y: number
  width: number
  height: number
  text: string
  字号: number
  加粗: boolean
  斜体: boolean
  下划线: boolean
  颜色: string
  对齐: 'left' | 'center' | 'right'
}

export type 版式类型 = '标题幻灯片' | '标题和内容' | '空白'

export interface 幻灯片 {
  id: string
  title: string
  版式: 版式类型
  背景色: string
  文本框列表: 文本框[]
}

export interface 演示文稿 {
  id: string
  name: string
  幻灯片列表: 幻灯片[]
  当前索引: number
}

/** 画布基准尺寸，按 16:9 比例 */
export const 画布宽 = 960
export const 画布高 = 540

export const 默认背景色 = '#FFFFFF'

let 标识计数 = 0

function 生成标识(前缀: string): string {
  标识计数 += 1
  return `${前缀}-${Date.now()}-${标识计数}`
}

/** 创建文本框；未指定字号时按标题与正文区分 */
export function 创建文本框(
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  字号 = 24
): 文本框 {
  return {
    id: 生成标识('box'),
    x,
    y,
    width,
    height,
    text,
    字号,
    加粗: false,
    斜体: false,
    下划线: false,
    颜色: '#1A1D24',
    对齐: 'left',
  }
}

/** 按版式生成初始文本框 */
export function 版式初始文本框(版式: 版式类型): 文本框[] {
  if (版式 === '空白') {
    return []
  }
  const 标题框 = 创建文本框(80, 60, 800, 120, '单击此处添加标题', 40)
  标题框.加粗 = true
  标题框.对齐 = 'center'
  if (版式 === '标题幻灯片') {
    return [标题框]
  }
  return [标题框, 创建文本框(80, 220, 800, 240, '单击此处添加正文', 24)]
}

export function 创建幻灯片(版式: 版式类型 = '标题和内容', 标题 = '新建幻灯片'): 幻灯片 {
  return {
    id: 生成标识('slide'),
    title: 标题,
    版式,
    背景色: 默认背景色,
    文本框列表: 版式初始文本框(版式),
  }
}

export function 创建演示文稿(name = '未命名演示.pptx'): 演示文稿 {
  return {
    id: 生成标识('deck'),
    name,
    幻灯片列表: [创建幻灯片('标题幻灯片', '幻灯片 1')],
    当前索引: 0,
  }
}

/** 读取当前幻灯片；无幻灯片时返回 null */
export function 读取当前幻灯片(文稿: 演示文稿): 幻灯片 | null {
  if (文稿.幻灯片列表.length === 0) {
    return null
  }
  const 索引 = Math.min(Math.max(0, 文稿.当前索引), 文稿.幻灯片列表.length - 1)
  return 文稿.幻灯片列表[索引]
}

/** 在当前幻灯片之后插入新幻灯片并切换过去 */
export function 添加幻灯片(文稿: 演示文稿, 新幻灯片?: 幻灯片): 演示文稿 {
  const 插入位置 = 文稿.幻灯片列表.length === 0 ? 0 : 文稿.当前索引 + 1
  const 目标 = 新幻灯片 ?? 创建幻灯片('标题和内容', `幻灯片 ${文稿.幻灯片列表.length + 1}`)
  const 列表 = [...文稿.幻灯片列表]
  列表.splice(插入位置, 0, 目标)
  return { ...文稿, 幻灯片列表: 列表, 当前索引: 插入位置 }
}

/** 复制指定幻灯片并插入到其后 */
export function 复制幻灯片(文稿: 演示文稿, 标识: string): 演示文稿 {
  const 下标 = 文稿.幻灯片列表.findIndex((项) => 项.id === 标识)
  if (下标 < 0) {
    return 文稿
  }
  const 原幻灯片 = 文稿.幻灯片列表[下标]
  const 副本: 幻灯片 = {
    ...原幻灯片,
    id: 生成标识('slide'),
    title: `${原幻灯片.title} 副本`,
    文本框列表: 原幻灯片.文本框列表.map((框) => ({ ...框, id: 生成标识('box') })),
  }
  const 列表 = [...文稿.幻灯片列表]
  列表.splice(下标 + 1, 0, 副本)
  return { ...文稿, 幻灯片列表: 列表, 当前索引: 下标 + 1 }
}

/** 删除指定幻灯片；仅剩一张时保持不变并返回原对象 */
export function 删除幻灯片(文稿: 演示文稿, 标识: string): 演示文稿 {
  if (文稿.幻灯片列表.length <= 1) {
    return 文稿
  }
  const 下标 = 文稿.幻灯片列表.findIndex((项) => 项.id === 标识)
  if (下标 < 0) {
    return 文稿
  }
  const 列表 = 文稿.幻灯片列表.filter((项) => 项.id !== 标识)
  return { ...文稿, 幻灯片列表: 列表, 当前索引: Math.min(下标, 列表.length - 1) }
}

/** 切换当前幻灯片；索引越界时保持不变 */
export function 切换幻灯片(文稿: 演示文稿, 索引: number): 演示文稿 {
  if (索引 < 0 || 索引 >= 文稿.幻灯片列表.length) {
    return 文稿
  }
  return { ...文稿, 当前索引: 索引 }
}

/** 更新指定幻灯片的字段 */
export function 更新幻灯片(
  文稿: 演示文稿,
  标识: string,
  修改: Partial<幻灯片>
): 演示文稿 {
  return {
    ...文稿,
    幻灯片列表: 文稿.幻灯片列表.map((项) => (项.id === 标识 ? { ...项, ...修改 } : 项)),
  }
}

/** 应用版式：重置文本框为该版式的初始内容 */
export function 应用版式(文稿: 演示文稿, 标识: string, 版式: 版式类型): 演示文稿 {
  return 更新幻灯片(文稿, 标识, { 版式, 文本框列表: 版式初始文本框(版式) })
}

export function 添加文本框(幻灯片: 幻灯片, 文本框: 文本框): 幻灯片 {
  return { ...幻灯片, 文本框列表: [...幻灯片.文本框列表, 文本框] }
}

export function 更新文本框(
  幻灯片: 幻灯片,
  标识: string,
  修改: Partial<文本框>
): 幻灯片 {
  return {
    ...幻灯片,
    文本框列表: 幻灯片.文本框列表.map((项) => (项.id === 标识 ? { ...项, ...修改 } : 项)),
  }
}

export function 删除文本框(幻灯片: 幻灯片, 标识: string): 幻灯片 {
  return { ...幻灯片, 文本框列表: 幻灯片.文本框列表.filter((项) => 项.id !== 标识) }
}

/** 把文本框约束在画布范围内 */
export function 约束位置(
  x: number,
  y: number,
  width: number,
  height: number
): { x: number; y: number } {
  const 最大x = Math.max(0, 画布宽 - width)
  const 最大y = Math.max(0, 画布高 - height)
  return {
    x: Math.min(Math.max(0, x), 最大x),
    y: Math.min(Math.max(0, y), 最大y),
  }
}
