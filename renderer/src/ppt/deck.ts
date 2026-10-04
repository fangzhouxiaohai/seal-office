// 演示文稿数据模型：幻灯片与文本框的增删改。
// 全部为纯函数，返回新对象，便于配合撤销重做使用。
import type { 形状数据, 表格数据, 连接数据 } from './model/elements'

export interface 文本片段 {
  文本: string
  加粗?: boolean
  斜体?: boolean
  下划线?: boolean
  颜色?: string
}

export interface 文本框 {
  id: string
  x: number
  y: number
  width: number
  height: number
  text: string
  字号: number
  字体?: string
  加粗: boolean
  斜体: boolean
  下划线: boolean
  颜色: string
  对齐: 'left' | 'center' | 'right'
  /** 富文本片段列表，为空时退化为统一样式渲染 */
  片段列表?: 文本片段[]
}

export type 版式类型 = '标题幻灯片' | '标题和内容' | '空白'

export interface 幻灯片 {
  id: string
  title: string
  版式: 版式类型
  背景色: string
  /** 幻灯片切换过渡效果，如「淡入淡出」「推进」 */
  过渡效果?: string
  /** 文本框入场动画，如「出现」「淡出」 */
  动画?: string
  /** 当前页的演讲备注，随演示文稿保存 */
  备注?: string
  文本框列表: 文本框[]
  /** 扩展对象在完成 PPTX 往返能力前仍须接受校验并禁止有损保存。 */
  对象列表?: 演示对象[]
}

export type 演示对象 = {
  id: string
  类型: '图片' | '图形' | '表格' | '图表' | '媒体' | '组合'
  x: number
  y: number
  width: number
  height: number
  旋转?: number
  锁定?: boolean
  裁剪?: { 左: number; 上: number; 右: number; 下: number }
  资源标识?: string
  子对象标识?: string[]
  形状?: 形状数据
  表格?: 表格数据
  连接?: 连接数据
  语义类型?: '流程'|'层级'|'循环'|'脑图'
}

export interface 演示资源 {
  指纹: string
  类型: string
  字节数: number
}

export interface 演示文稿 {
  模型版本?: 2
  id: string
  name: string
  幻灯片列表: 幻灯片[]
  当前索引: number
  资源索引?: Record<string, 演示资源>
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
    模型版本: 2,
    id: 生成标识('deck'),
    name,
    幻灯片列表: [创建幻灯片('标题幻灯片', '幻灯片 1')],
    当前索引: 0,
    资源索引: {},
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
  const 对象标识映射 = new Map((原幻灯片.对象列表 ?? []).map((对象) => [对象.id, 生成标识('element')]))
  const 副本: 幻灯片 = {
    ...原幻灯片,
    id: 生成标识('slide'),
    title: `${原幻灯片.title} 副本`,
    文本框列表: 原幻灯片.文本框列表.map((框) => ({ ...框, id: 生成标识('box') })),
    对象列表: 原幻灯片.对象列表?.map((对象) => ({
      ...对象,
      id: 对象标识映射.get(对象.id)!,
      子对象标识: 对象.子对象标识?.map((子标识) => 对象标识映射.get(子标识) ?? 子标识),
      ...(对象.连接 ? { 连接: { ...对象.连接, 起点: { ...对象.连接.起点, 对象: 对象标识映射.get(对象.连接.起点.对象)! }, 终点: { ...对象.连接.终点, 对象: 对象标识映射.get(对象.连接.终点.对象)! } } } : {}),
    })),
  }
  const 列表 = [...文稿.幻灯片列表]
  列表.splice(下标 + 1, 0, 副本)
  return { ...文稿, 幻灯片列表: 列表, 当前索引: 下标 + 1 }
}

/** 上移或下移当前幻灯片；方向为 -1 上移、1 下移，越界时保持不变 */
export function 移动幻灯片(文稿: 演示文稿, 方向: -1 | 1): 演示文稿 {
  const 当前索引 = 文稿.当前索引
  const 目标索引 = 当前索引 + 方向
  if (目标索引 < 0 || 目标索引 >= 文稿.幻灯片列表.length) {
    return 文稿
  }
  const 列表 = [...文稿.幻灯片列表]
  const [项] = 列表.splice(当前索引, 1)
  列表.splice(目标索引, 0, 项)
  return { ...文稿, 幻灯片列表: 列表, 当前索引: 目标索引 }
}

/** 将一页移动到目标位置，同时保持当前正在查看的页面。 */
export function 重排幻灯片(文稿: 演示文稿, 来源索引: number, 目标索引: number): 演示文稿 {
  const 数量 = 文稿.幻灯片列表.length
  if (!Number.isInteger(来源索引) || !Number.isInteger(目标索引) ||
      来源索引 < 0 || 目标索引 < 0 || 来源索引 >= 数量 || 目标索引 >= 数量 || 来源索引 === 目标索引) {
    return 文稿
  }
  const 当前标识 = 文稿.幻灯片列表[文稿.当前索引]?.id
  const 列表 = [...文稿.幻灯片列表]
  const [移动项] = 列表.splice(来源索引, 1)
  列表.splice(目标索引, 0, 移动项)
  const 当前索引 = Math.max(0, 列表.findIndex((项) => 项.id === 当前标识))
  return { ...文稿, 幻灯片列表: 列表, 当前索引 }
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

// ==================== 文本片段富文本支持 ====================

/** 将纯文本转换为字符片段列表，每个字符一个片段，继承文本框的基础样式 */
export function 文本转片段(文本: string, _字号: number, 加粗: boolean, 斜体: boolean, 下划线: boolean, 颜色: string): 文本片段[] {
  if (!文本 || 文本.length === 0) return []
  return 文本.split('').map((字符) => ({
    文本: 字符,
    加粗,
    斜体,
    下划线,
    颜色,
  }))
}

/** 将片段列表合并为纯文本 */
export function 片段转文本(片段列表: 文本片段[]): string {
  return 片段列表.map((片段) => 片段.文本).join('')
}

/** 检测选区与哪些片段重叠，返回重叠索引范围 */
export function 检测选中片段(片段列表: 文本片段[], 选区起始: number | undefined, 选区结束: number | undefined): { 起始索引: number; 结束索引: number } | null {
  if (!片段列表 || 片段列表.length === 0) return null
  if (选区起始 == null || 选区结束 == null || 选区起始 === 选区结束) return null
  const 开始 = Math.min(选区起始, 选区结束)
  const 结束 = Math.max(选区起始, 选区结束)
  let 偏移量 = 0
  let 起始索引 = -1
  let 结束索引 = -1
  for (let i = 0; i < 片段列表.length; i++) {
    const 片段起始 = 偏移量
    const 片段结束 = 偏移量 + 片段列表[i].文本.length
    偏移量 = 片段结束
    if (片段起始 < 结束 && 片段结束 > 开始) {
      if (起始索引 < 0) 起始索引 = i
      结束索引 = i
    }
  }
  if (起始索引 < 0) return null
  return { 起始索引, 结束索引 }
}

/** 将格式应用到指定索引范围的片段，返回新文本框 */
export function 应用格式到选中片段(
  文本框: 文本框,
  选中起始索引: number,
  选中结束索引: number,
  格式: { 加粗?: boolean; 斜体?: boolean; 下划线?: boolean; 颜色?: string }
): 文本框 {
  const 片段列表 = 文本框.片段列表 || 文本转片段(文本框.text, 文本框.字号, 文本框.加粗, 文本框.斜体, 文本框.下划线, 文本框.颜色)
  const 新片段列表 = 片段列表.map((片段) => ({ ...片段 }))
  for (let i = 0; i < 新片段列表.length; i++) {
    if (i >= 选中起始索引 && i <= 选中结束索引) {
      if (格式.颜色 != null) 新片段列表[i].颜色 = 格式.颜色
      if (格式.加粗 != null) 新片段列表[i].加粗 = 格式.加粗
      if (格式.斜体 != null) 新片段列表[i].斜体 = 格式.斜体
      if (格式.下划线 != null) 新片段列表[i].下划线 = 格式.下划线
    }
  }
  return {
    ...文本框,
    片段列表: 新片段列表,
    text: 片段转文本(新片段列表),
  }
}
