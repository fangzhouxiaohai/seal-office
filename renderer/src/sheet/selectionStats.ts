// 选区统计：用于状态栏展示计数、求和、平均值与极值。

export interface 选区统计 {
  计数: number
  求和: number
  平均值: number
  最大: number
  最小: number
}

const 空统计: 选区统计 = { 计数: 0, 求和: 0, 平均值: 0, 最大: 0, 最小: 0 }

/** 统计选区内可解析为数值的单元格；无有效数值时各项为零，不产生 NaN */
export function 统计选区(数值列表: string[]): 选区统计 {
  const 有效数值 = 数值列表
    .map((项) => 项.trim())
    .filter((项) => 项.length > 0 && Number.isFinite(Number(项)))
    .map((项) => Number(项))

  if (有效数值.length === 0) {
    return { ...空统计 }
  }

  const 求和 = 有效数值.reduce((累计, 项) => 累计 + 项, 0)
  return {
    计数: 有效数值.length,
    求和,
    平均值: 求和 / 有效数值.length,
    最大: Math.max(...有效数值),
    最小: Math.min(...有效数值),
  }
}
