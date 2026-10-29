import { 解析地址, type 单元格位置 } from './address'
import type { CellFormat, Sheet } from './model'

export interface 合并边界 {
  起点: 单元格位置
  终点: 单元格位置
}

const 合并缓存 = new WeakMap<string[], 合并边界[]>()

/** 仅解析矩形两端，不为每个合并单元格创建位置对象。 */
export function 获取合并边界(区域列表: string[]): 合并边界[] {
  const 已有 = 合并缓存.get(区域列表)
  if (已有) return 已有
  const 结果: 合并边界[] = []
  for (const 区域 of 区域列表) {
    const [首, 尾 = 首] = 区域.split(':')
    const 甲 = 解析地址(首), 乙 = 解析地址(尾)
    if (!甲 || !乙) continue
    结果.push({
      起点: { 行: Math.min(甲.行, 乙.行), 列: Math.min(甲.列, 乙.列) },
      终点: { 行: Math.max(甲.行, 乙.行), 列: Math.max(甲.列, 乙.列) },
    })
  }
  合并缓存.set(区域列表, 结果)
  return 结果
}

/** 前缀坐标包含表头；二分定位允许筛选后的重复坐标。 */
export function 查找坐标索引(偏移: number[], 坐标: number): number {
  let 左 = 0, 右 = 偏移.length - 1
  while (左 < 右) {
    const 中 = Math.floor((左 + 右 + 1) / 2)
    if (偏移[中] <= 坐标) 左 = 中
    else 右 = 中 - 1
  }
  return Math.min(左, Math.max(0, 偏移.length - 2))
}

export function 可见轴索引(偏移: number[], 滚动: number, 大小: number, 冻结数: number): number[] {
  const 数量 = 偏移.length - 1
  const 起 = Math.max(0, 查找坐标索引(偏移, 滚动) - 2)
  const 终 = Math.min(数量 - 1, 查找坐标索引(偏移, 滚动 + 大小) + 2)
  const 索引 = new Set<number>()
  for (let 项 = 0; 项 < 冻结数; 项 += 1) 索引.add(项)
  for (let 项 = 起; 项 <= 终; 项 += 1) 索引.add(项)
  return [...索引].filter(项 => 偏移[项 + 1] > 偏移[项]).sort((甲, 乙) => 甲 - 乙)
}

type 边框条目 = { 位置: 单元格位置; 格式: CellFormat }
const 边框缓存 = new WeakMap<Sheet['单元格'], { 行: Map<number, 边框条目[]>; 列: Map<number, 边框条目[]> }>()

/** 合并格的外缘样式可能只存于外围子格；索引仅遍历已有单元格，避免展开整片合并。 */
export function 获取合并外缘格式(工作表: Sheet, 起点: 单元格位置, 跨度行: number, 跨度列: number, 原格式: CellFormat): CellFormat {
  let 索引 = 边框缓存.get(工作表.单元格)
  if (!索引) {
    索引 = { 行: new Map(), 列: new Map() }
    for (const [地址, 单元] of Object.entries(工作表.单元格)) {
      if (!单元.格式.边框) continue
      const 位置 = 解析地址(地址)
      if (!位置) continue
      const 条目 = { 位置, 格式: 单元.格式 }
      if (!索引.行.has(位置.行)) 索引.行.set(位置.行, [])
      if (!索引.列.has(位置.列)) 索引.列.set(位置.列, [])
      索引.行.get(位置.行)!.push(条目)
      索引.列.get(位置.列)!.push(条目)
    }
    边框缓存.set(工作表.单元格, 索引)
  }
  const 终行 = 起点.行 + 跨度行 - 1, 终列 = 起点.列 + 跨度列 - 1
  const 边框 = { ...原格式.边框 }, 边框颜色 = { ...原格式.边框颜色 }
  const 外缘: Array<['上' | '下' | '左' | '右', 边框条目[] | undefined]> = [
    ['上', 索引.行.get(起点.行)], ['下', 索引.行.get(终行)], ['左', 索引.列.get(起点.列)], ['右', 索引.列.get(终列)],
  ]
  for (const [边, 条目] of 外缘) {
    const 匹配 = 条目?.find(({ 位置, 格式 }) => 格式.边框?.[边] && 位置.行 >= 起点.行 && 位置.行 <= 终行 && 位置.列 >= 起点.列 && 位置.列 <= 终列)
    if (匹配) { 边框[边] = true; 边框颜色[边] = 匹配.格式.边框颜色?.[边] }
  }
  return { ...原格式, 边框, 边框颜色 }
}
