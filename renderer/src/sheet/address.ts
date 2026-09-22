// 表格地址换算：列号与字母互转、地址与区域解析。
// 全部为纯函数，不依赖表格状态，便于独立测试。

export interface 单元格位置 {
  行: number
  列: number
}

/** 列序号转字母：0 → A，25 → Z，26 → AA */
export function 列转字母(列: number): string {
  if (!Number.isFinite(列) || 列 < 0) {
    return ''
  }
  let 结果 = ''
  let 余数 = Math.floor(列)
  while (余数 >= 0) {
    结果 = String.fromCharCode(65 + (余数 % 26)) + 结果
    余数 = Math.floor(余数 / 26) - 1
  }
  return 结果
}

/** 字母转列序号：A → 0，AA → 26；非法输入返回 -1 */
export function 字母转列(字母: string): number {
  const 大写 = 字母.trim().toUpperCase()
  if (!/^[A-Z]+$/.test(大写)) {
    return -1
  }
  let 结果 = 0
  for (const 字符 of 大写) {
    结果 = 结果 * 26 + (字符.charCodeAt(0) - 64)
  }
  return 结果 - 1
}

/** 行列转地址：0,0 → A1 */
export function 生成地址(行: number, 列: number): string {
  return `${列转字母(列)}${行 + 1}`
}

/** 地址转行列；非法地址返回 null */
export function 解析地址(地址: string): 单元格位置 | null {
  const 匹配 = /^([A-Za-z]+)(\d+)$/.exec(地址.trim())
  if (匹配 === null) {
    return null
  }
  const 列 = 字母转列(匹配[1])
  const 行号 = Number.parseInt(匹配[2], 10)
  if (列 < 0 || !Number.isFinite(行号) || 行号 < 1) {
    return null
  }
  return { 行: 行号 - 1, 列 }
}

/** 把两个位置规范化为左上与右下 */
export function 规范化区域(甲: 单元格位置, 乙: 单元格位置): { 起点: 单元格位置; 终点: 单元格位置 } {
  return {
    起点: { 行: Math.min(甲.行, 乙.行), 列: Math.min(甲.列, 乙.列) },
    终点: { 行: Math.max(甲.行, 乙.行), 列: Math.max(甲.列, 乙.列) },
  }
}

/** 生成区域地址；单格时退化为单地址 */
export function 生成区域地址(甲: 单元格位置, 乙: 单元格位置): string {
  const { 起点, 终点 } = 规范化区域(甲, 乙)
  const 起点地址 = 生成地址(起点.行, 起点.列)
  const 终点地址 = 生成地址(终点.行, 终点.列)
  return 起点地址 === 终点地址 ? 起点地址 : `${起点地址}:${终点地址}`
}

/** 展开区域为按行优先顺序排列的全部位置；非法输入返回空数组 */
export function 展开区域(区域: string): 单元格位置[] {
  const 文本 = 区域.trim()
  if (文本.length === 0) {
    return []
  }
  const 部分 = 文本.split(':')
  const 起始 = 解析地址(部分[0])
  if (起始 === null) {
    return []
  }
  const 结束 = 部分.length > 1 ? 解析地址(部分[1]) : 起始
  if (结束 === null) {
    return []
  }
  const { 起点, 终点 } = 规范化区域(起始, 结束)
  const 结果: 单元格位置[] = []
  for (let 行 = 起点.行; 行 <= 终点.行; 行 += 1) {
    for (let 列 = 起点.列; 列 <= 终点.列; 列 += 1) {
      结果.push({ 行, 列 })
    }
  }
  return 结果
}
