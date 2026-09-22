// 表格数据模型：单元格、格式与工作表的读写与重算。
// 全部为纯函数，返回新的工作表对象，便于配合撤销重做使用。

import { 求值公式 } from './formula'
import { 展开区域, 生成地址, 生成区域地址, type 单元格位置 } from './address'
import { 格式化数字, type 数字格式 } from './numberFormat'

export interface CellFormat {
  字体?: string
  字号?: number
  加粗?: boolean
  斜体?: boolean
  下划线?: boolean
  字体颜色?: string
  填充颜色?: string
  水平对齐?: 'left' | 'center' | 'right'
  垂直对齐?: 'top' | 'middle' | 'bottom'
  自动换行?: boolean
  数字格式?: 数字格式
  小数位?: number
  边框?: { 上?: boolean; 下?: boolean; 左?: boolean; 右?: boolean }
}

export interface SheetCell {
  /** 用户输入的原始值，公式以 = 开头 */
  原始值: string
  /** 计算或格式化后的展示值 */
  显示值: string
  格式: CellFormat
}

export interface Sheet {
  id: string
  name: string
  /** 键为地址，例如 A1；未出现的地址视为空单元格 */
  单元格: Record<string, SheetCell>
  行数: number
  列数: number
  列宽: number[]
  行高: number[]
  /** 已合并的区域地址列表 */
  合并区域: string[]
}

export const 默认行数 = 100
export const 默认列数 = 26
export const 默认列宽 = 88
export const 默认行高 = 24

const 空单元格: SheetCell = { 原始值: '', 显示值: '', 格式: {} }

/** 读取单元格；不存在时返回空单元格，不写入工作表 */
export function 读取单元格(工作表: Sheet, 地址: string): SheetCell {
  return 工作表.单元格[地址] ?? 空单元格
}

/** 把原始值按格式渲染为展示值 */
function 渲染原始值(原始值: string, 格式: CellFormat): string {
  if (原始值.length === 0) {
    return ''
  }
  const 数值 = Number(原始值)
  if (!Number.isFinite(数值)) {
    return 原始值
  }
  const 数字格式 = 格式.数字格式 ?? '常规'
  if (数字格式 === '常规') {
    return 原始值
  }
  return 格式化数字(数值, 数字格式, 格式.小数位 ?? 2)
}

/**
 * 重算工作表：按依赖递归求值，公式引用另一公式时也能取到正确结果。
 * 求值过程中维护正在求值的地址集合，用于检出循环引用。
 */
export function 重算工作表(工作表: Sheet): Sheet {
  const 缓存 = new Map<string, string>()

  const 求显示值 = (地址: string, 正在求值: Set<string>): string => {
    const 已缓存 = 缓存.get(地址)
    if (已缓存 !== undefined) {
      return 已缓存
    }
    const 单元 = 工作表.单元格[地址]
    if (单元 === undefined) {
      return ''
    }
    if (正在求值.has(地址)) {
      return '#错误'
    }
    const 原始值 = 单元.原始值
    if (!原始值.startsWith('=')) {
      const 结果 = 渲染原始值(原始值, 单元.格式)
      缓存.set(地址, 结果)
      return 结果
    }
    正在求值.add(地址)
    const 求值结果 = 求值公式(
      原始值,
      (引用地址) => 求显示值(引用地址, 正在求值),
      正在求值,
      地址
    )
    正在求值.delete(地址)
    const 文本 = String(求值结果.值)
    缓存.set(地址, 文本)
    return 文本
  }

  const 新单元格: Record<string, SheetCell> = {}
  Object.keys(工作表.单元格).forEach((地址) => {
    const 单元 = 工作表.单元格[地址]
    新单元格[地址] = { ...单元, 显示值: 求显示值(地址, new Set<string>()) }
  })

  return { ...工作表, 单元格: 新单元格 }
}

/** 创建空白工作表 */
export function 创建工作表(名称: string, 行数 = 默认行数, 列数 = 默认列数): Sheet {
  const 工作表: Sheet = {
    id: `sheet-${Date.now()}`,
    name: 名称,
    单元格: {},
    行数,
    列数,
    列宽: Array.from({ length: 列数 }, () => 默认列宽),
    行高: Array.from({ length: 行数 }, () => 默认行高),
    合并区域: [],
  }
  return 工作表
}

/** 写入单元格原始值并重算 */
export function 写入单元格(工作表: Sheet, 地址: string, 原始值: string): Sheet {
  const 原单元 = 读取单元格(工作表, 地址)
  const 新单元格 = { ...工作表.单元格 }
  if (原始值.length === 0 && Object.keys(原单元.格式).length === 0) {
    delete 新单元格[地址]
  } else {
    新单元格[地址] = { ...原单元, 原始值, 显示值: 原始值 }
  }
  return 重算工作表({ ...工作表, 单元格: 新单元格 })
}

/** 批量清空单元格内容，保留格式 */
export function 清空单元格(工作表: Sheet, 地址列表: string[]): Sheet {
  const 新单元格 = { ...工作表.单元格 }
  地址列表.forEach((地址) => {
    const 单元 = 新单元格[地址]
    if (单元 === undefined) {
      return
    }
    if (Object.keys(单元.格式).length === 0) {
      delete 新单元格[地址]
    } else {
      新单元格[地址] = { ...单元, 原始值: '', 显示值: '' }
    }
  })
  return 重算工作表({ ...工作表, 单元格: 新单元格 })
}

/** 对区域内的单元格批量设置格式 */
export function 设置格式(工作表: Sheet, 区域: string, 格式: Partial<CellFormat>): Sheet {
  const 位置列表 = 展开区域(区域)
  if (位置列表.length === 0) {
    return 工作表
  }
  const 新单元格 = { ...工作表.单元格 }
  位置列表.forEach((位置) => {
    const 地址 = 生成地址(位置.行, 位置.列)
    const 单元 = 新单元格[地址] ?? { ...空单元格 }
    新单元格[地址] = { ...单元, 格式: { ...单元.格式, ...格式 } }
  })
  return 重算工作表({ ...工作表, 单元格: 新单元格 })
}

export interface 合并信息 {
  是左上角: boolean
  跨度行: number
  跨度列: number
}

/**
 * 查询位置所在的合并区域。
 * 返回 null 表示该位置不属于任何合并区域。
 */
export function 查询合并(工作表: Sheet, 位置: 单元格位置): 合并信息 | null {
  const 地址 = 生成地址(位置.行, 位置.列)
  for (const 区域 of 工作表.合并区域) {
    const 位置列表 = 展开区域(区域)
    if (!位置列表.some((项) => 项.行 === 位置.行 && 项.列 === 位置.列)) {
      continue
    }
    const 起点 = 位置列表[0]
    const 行集合 = 位置列表.map((项) => 项.行)
    const 列集合 = 位置列表.map((项) => 项.列)
    return {
      是左上角: 起点.行 === 位置.行 && 起点.列 === 位置.列,
      跨度行: Math.max(...行集合) - Math.min(...行集合) + 1,
      跨度列: Math.max(...列集合) - Math.min(...列集合) + 1,
    }
  }
  void 地址
  return null
}

/**
 * 切换区域的合并状态。
 * 对已合并的区域再次调用即取消合并；与既有合并区域重叠时会先移除重叠项。
 */
export function 切换合并(工作表: Sheet, 区域: string): Sheet {
  const 位置列表 = 展开区域(区域)
  if (位置列表.length <= 1) {
    return 工作表
  }
  const 规范区域 = 生成区域地址(
    { 行: Math.min(...位置列表.map((项) => 项.行)), 列: Math.min(...位置列表.map((项) => 项.列)) },
    { 行: Math.max(...位置列表.map((项) => 项.行)), 列: Math.max(...位置列表.map((项) => 项.列)) }
  )
  if (工作表.合并区域.includes(规范区域)) {
    return { ...工作表, 合并区域: 工作表.合并区域.filter((项) => 项 !== 规范区域) }
  }
  const 目标集合 = new Set(位置列表.map((项) => `${项.行}-${项.列}`))
  const 保留 = 工作表.合并区域.filter((项) =>
    展开区域(项).every((位置) => !目标集合.has(`${位置.行}-${位置.列}`))
  )
  return { ...工作表, 合并区域: [...保留, 规范区域] }
}
