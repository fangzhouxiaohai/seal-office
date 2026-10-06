// 生成候选落地：把 AI 返回的结构化内容转成可编辑文稿、页面与对象。
// 所有应用入口都要先核对原内容版本；任何结构不合法都在写入前拒绝。
import {
  创建文本框,
  创建幻灯片,
  读取当前幻灯片,
  type 版式类型,
  type 幻灯片,
  type 演示文稿,
} from '../deck'
import { 创建图形 } from './elements'

export type 生成版式 = '标题幻灯片' | '标题和内容' | '空白'
export interface 生成页面项 { 页标识: string; 标题: string; 正文: string; 版式?: 生成版式; 要点: string[] }
export interface 美化建议项 {
  页标识: string
  对齐: '左对齐' | '居中' | '右对齐'
  字号建议: number
  要点上限: number
  背景建议: '浅色' | '深色' | '保持不变'
  版式建议: 生成版式
  说明?: string
}
export interface 生成图形节点 { 标识: string; 文本: string }
export interface 生成图形连线 { 起点: string; 终点: string; 文本?: string }

const 版式白名单: 生成版式[] = ['标题幻灯片', '标题和内容', '空白']
const 浅色背景 = '#F5F7FA'
const 深色背景 = '#1F2430'
const 对齐映射: Record<美化建议项['对齐'], 文本框对齐> = { 左对齐: 'left', 居中: 'center', 右对齐: 'right' }
type 文本框对齐 = 'left' | 'center' | 'right'

/** 稳定内容指纹：用于应用候选前核对原内容版本。 */
function 内容指纹(值: unknown): string {
  const 规整 = (输入: unknown): unknown => {
    if (Array.isArray(输入)) return 输入.map(规整)
    if (typeof 输入 === 'object' && 输入 !== null) {
      return Object.fromEntries(Object.keys(输入 as Record<string, unknown>).sort().map((键) => [键, 规整((输入 as Record<string, unknown>)[键])]))
    }
    return 输入
  }
  const 文本 = JSON.stringify(规整(值))
  let 哈希 = 0x811c9dc5
  for (let i = 0; i < 文本.length; i += 1) {
    哈希 ^= 文本.charCodeAt(i)
    哈希 = Math.imul(哈希, 0x01000193) >>> 0
  }
  return 哈希.toString(16).padStart(8, '0')
}

/** 逐页版本表：页面内容变化即版本变化。 */
export function 页面版本表(文稿: 演示文稿): Record<string, string> {
  return Object.fromEntries(文稿.幻灯片列表.map((页) => [页.id, 内容指纹(页)]))
}

function 校验生成页面(项: 生成页面项): 生成页面项 {
  if (typeof 项?.标题 !== 'string' || !项.标题.trim()) throw new Error('生成页面的标题为空，已拒绝插入')
  if (项.版式 !== undefined && !版式白名单.includes(项.版式)) throw new Error(`生成页面的版式无效：${String(项.版式)}`)
  if (项.要点 !== undefined && !Array.isArray(项.要点)) throw new Error('生成页面的要点格式无效')
  return 项
}

/** 生成页面 → 可编辑幻灯片：标题、正文与要点各自成为独立文本框。 */
export function 生成页面转幻灯片(项: 生成页面项): 幻灯片 {
  校验生成页面(项)
  const 版式 = (项.版式 ?? '标题和内容') as 版式类型
  const 页 = 创建幻灯片(版式, 项.标题.trim())
  const 标题框 = 页.文本框列表[0]
  if (标题框) 标题框.text = 项.标题.trim()
  const 其余 = 页.文本框列表.slice(1)
  const 正文内容 = [项.正文?.trim(), ...(项.要点 ?? []).map((点) => `• ${点.trim()}`)].filter(Boolean).join('\n')
  if (版式 === '空白') {
    页.文本框列表 = []
    if (正文内容) 页.文本框列表.push(创建文本框(80, 120, 800, 300, 正文内容, 24))
    return 页
  }
  if (其余.length > 0) {
    其余[0].text = 正文内容
    if (!正文内容) 页.文本框列表 = 页.文本框列表.filter((框) => 框 !== 其余[0])
    return 页
  }
  if (正文内容) 页.文本框列表.push(创建文本框(80, 220, 800, 240, 正文内容, 24))
  return 页
}

function 校验插入位置(文稿: 演示文稿, 位置: number | undefined): number {
  if (位置 === undefined) return Math.min(文稿.当前索引 + 1, 文稿.幻灯片列表.length)
  if (!Number.isInteger(位置) || 位置 < 0 || 位置 > 文稿.幻灯片列表.length) throw new Error(`插入位置无效：应在 0 到 ${文稿.幻灯片列表.length} 之间`)
  return 位置
}

/** 按提纲生成结果插入多页，返回新文稿（原文稿不变，便于撤销）。 */
export function 应用提纲生成(文稿: 演示文稿, 页面列表: 生成页面项[], { 插入位置 }: { 插入位置?: number } = {}): 演示文稿 {
  if (!Array.isArray(页面列表) || 页面列表.length === 0) throw new Error('没有可插入的生成结果')
  const 位置 = 校验插入位置(文稿, 插入位置)
  const 新页 = 页面列表.map((项) => 生成页面转幻灯片(项))
  const 列表 = [...文稿.幻灯片列表]
  列表.splice(位置, 0, ...新页)
  return { ...文稿, 幻灯片列表: 列表, 当前索引: 位置 }
}

/** 单页生成插入到当前页之后；应用前核对原内容版本。 */
export function 应用单页生成(文稿: 演示文稿, 页面项: 生成页面项, { 版本表, 插入位置 }: { 版本表: Record<string, string>; 插入位置?: number } = { 版本表: {} }): 演示文稿 {
  const 当前 = 读取当前幻灯片(文稿)
  if (当前) {
    const 最新 = 页面版本表(文稿)
    if (版本表[当前.id] !== 最新[当前.id]) throw new Error('文稿已变化，请重新生成后再应用')
  }
  const 位置 = 校验插入位置(文稿, 插入位置)
  const 列表 = [...文稿.幻灯片列表]
  列表.splice(位置, 0, 生成页面转幻灯片(页面项))
  return { ...文稿, 幻灯片列表: 列表, 当前索引: 位置 }
}

/** 应用美化建议：按页面核对版本后设置对齐、字号、背景与版式。 */
export function 应用美化建议(文稿: 演示文稿, 建议列表: 美化建议项[], 版本表: Record<string, string>): 演示文稿 {
  if (!Array.isArray(建议列表) || 建议列表.length === 0) throw new Error('没有可应用的美化建议')
  const 最新 = 页面版本表(文稿)
  const 页表 = new Map(文稿.幻灯片列表.map((页) => [页.id, 页]))
  const 修改表 = new Map(建议列表.map((项) => [项.页标识, 项]))
  for (const 项 of 建议列表) {
    if (!页表.has(项.页标识)) throw new Error(`页面已不存在，已阻止写入：${项.页标识}`)
    if (版本表[项.页标识] !== 最新[项.页标识]) throw new Error(`页面 ${项.页标识} 的文稿已变化，已阻止写入`)
    if (!版式白名单.includes(项.版式建议)) throw new Error(`美化建议的版式无效：${项.版式建议}`)
    if (!Number.isInteger(项.字号建议) || 项.字号建议 < 8 || 项.字号建议 > 96) throw new Error('美化建议的字号超出范围')
    if (!Number.isInteger(项.要点上限) || 项.要点上限 < 1) throw new Error('美化建议的要点上限无效')
  }
  return {
    ...文稿,
    幻灯片列表: 文稿.幻灯片列表.map((页) => {
      const 项 = 修改表.get(页.id)
      if (!项) return 页
      const 对齐 = 对齐映射[项.对齐]
      return {
        ...页,
        背景色: 项.背景建议 === '浅色' ? 浅色背景 : 项.背景建议 === '深色' ? 深色背景 : 页.背景色,
        文本框列表: 页.文本框列表.map((框, 序号) => ({
          ...框,
          对齐,
          字号: 序号 === 0 ? Math.min(项.字号建议, 96) : Math.min(框.字号, 项.字号建议),
        })),
      }
    }),
  }
}

/** 结构化图形 → 可编辑对象：节点为图形，关系为连接线，整体为一个组合。 */
export function 构建生成图形(类型: '流程' | '层级' | '循环' | '脑图', 节点列表: 生成图形节点[], 连线列表: 生成图形连线[]) {
  if (!Array.isArray(节点列表) || 节点列表.length === 0) throw new Error('没有可插入的图形节点')
  if (节点列表.length > 24) throw new Error('图形节点过多：最多 24 个')
  const 标识集合 = new Set<string>()
  for (const 节点 of 节点列表) {
    if (typeof 节点?.标识 !== 'string' || !节点.标识.trim()) throw new Error('图形节点缺少有效标识')
    if (标识集合.has(节点.标识)) throw new Error(`图形节点存在重复标识：${节点.标识}`)
    标识集合.add(节点.标识)
    if (typeof 节点.文本 !== 'string' || !节点.文本.trim()) throw new Error(`节点 ${节点.标识} 的文本为空`)
  }
  const 列数 = 类型 === '层级' || 类型 === '脑图' ? Math.min(3, 节点列表.length) : Math.min(节点列表.length, 4)
  const 节点对象 = 节点列表.map((节点, 序号) => {
    const 行 = Math.floor(序号 / 列数), 列 = 序号 % 列数
    const 图形 = 创建图形(类型 === '流程' && 序号 === 1 ? '菱形' : '圆角矩形', 节点.文本.trim())
    图形.x = 80 + 列 * 200
    图形.y = 120 + 行 * 140
    return { 图形, 标识: 节点.标识 }
  })
  const 编号表 = new Map(节点对象.map((项, 序号) => [项.标识, 节点对象[序号].图形.id]))
  const 连线对象 = (连线列表 ?? []).map((线) => {
    const 起点 = 编号表.get(线?.起点)
    const 终点 = 编号表.get(线?.终点)
    if (!起点 || !终点) throw new Error(`连线引用了不存在的节点：${String(线?.起点)} → ${String(线?.终点)}`)
    const 连接线 = 创建图形('连接线', (线.文本 ?? '').trim())
    连接线.连接 = { 起点: { 对象: 起点, 边: '右' }, 终点: { 对象: 终点, 边: '左' }, 起点位置: { x: 0, y: 0 }, 终点位置: { x: 0, y: 0 } }
    return 连接线
  })
  const 成员 = [...节点对象.map((项) => 项.图形.id), ...连线对象.map((项) => 项.id)]
  const 组合 = {
    ...创建图形('圆角矩形'),
    类型: '组合' as const,
    x: 60, y: 100, width: 760, height: Math.max(200, Math.ceil(节点列表.length / 列数) * 140),
    子对象标识: 成员,
    语义类型: 类型,
  }
  组合.形状 = undefined
  return [...节点对象.map((项) => 项.图形), ...连线对象, 组合]
}

/** 把生成的对象插入指定页面（返回新页面对象）。 */
export function 插入生成对象(页: 幻灯片, 对象列表: ReturnType<typeof 构建生成图形>): 幻灯片 {
  if (!Array.isArray(对象列表) || 对象列表.length === 0) throw new Error('没有可插入的图形对象')
  return { ...页, 对象列表: [...(页.对象列表 ?? []), ...对象列表] }
}
