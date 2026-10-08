// 表格数据模型：单元格、格式与工作表的读写与重算。
// 全部为纯函数，返回新的工作表对象，便于配合撤销重做使用。

import { 求值公式 } from './formula'
import {
  展开区域,
  生成地址,
  生成区域地址,
  解析地址,
  type 单元格位置,
} from './address'
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
  边框颜色?: { 上?: string; 下?: string; 左?: string; 右?: string }
}

export type 单元格数据验证 =
  | { 类型: '列表'; 选项: string[]; 允许空白: boolean }
  | { 类型: '整数' | '小数'; 最小值: number; 最大值: number; 允许空白: boolean }

export interface SheetCell {
  /** 用户输入的原始值，公式以 = 开头 */
  原始值: string
  /** 计算或格式化后的展示值 */
  显示值: string
  /** 未经显示格式转换的公式结果，用于引用和 XLSX 数值缓存。 */
  计算值?: number | string
  格式: CellFormat
  /** 从表格文件导入的文本单元格类型，未编辑时保持原始类型 */
  值类型?: '文本'
  /** 输入约束，附着于单元格以便行列移动时同步迁移 */
  数据验证?: 单元格数据验证
  /** 本地批注；空白单元格也可以附带批注 */
  批注?: string
}

export interface SheetImage {
  id: string
  格式: 'png' | 'jpeg'
  /** 不含数据网址前缀的 Base64 图片字节。 */
  数据: string
  行: number
  列: number
  宽: number
  高: number
}

export interface 页面设置 {
  页边距: '常规' | '窄' | '适中' | '宽'
  方向: '纵向' | '横向'
  纸张大小: 'A4' | 'A5' | 'B5' | 'Letter' | '跟随打印机'
}

export const 默认页面设置: 页面设置 = { 页边距: '常规', 方向: '纵向', 纸张大小: 'A4' }

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
  /** 图片以左上角单元格为锚点，旧版工作表可能缺少该字段。 */
  图片?: SheetImage[]
  页面设置: 页面设置
  冻结?: { 行: number; 列: number }
  筛选?: { 列: number; 值: string }
  /** 本机保护可直接解除；外部复杂保护只读且需在来源软件解除 */
  保护?: '本机' | '外部'
}

export const 默认行数 = 100
export const 默认列数 = 26
export const 默认列宽 = 88
export const 默认行高 = 24
/** 列宽与行高的下限，避免拖到不可见 */
export const 最小列宽 = 40
export const 最小行高 = 18

const 空单元格: SheetCell = { 原始值: '', 显示值: '', 格式: {} }

/** 读取单元格；不存在时返回空单元格，不写入工作表 */
export function 读取单元格(工作表: Sheet, 地址: string): SheetCell {
  return 工作表.单元格[地址] ?? 空单元格
}

/** 在指定区域设置或清除可写回表格文件的验证规则。 */
export function 设置数据验证(工作表: Sheet, 区域: string, 规则: 单元格数据验证 | null): Sheet {
  const 位置列表 = 展开区域(区域)
  if (位置列表.length === 0 || 位置列表.length > 10000 || 位置列表.some((位置) => 位置.行 >= 工作表.行数 || 位置.列 >= 工作表.列数)) {
    throw new Error('数据验证区域无效或过大')
  }
  if (规则?.类型 === '列表' && (规则.选项.length === 0 || 规则.选项.some((值) => !值.trim() || 值.includes(',')) || `"${规则.选项.join(',')}"`.length > 255)) {
    throw new Error('列表选项不能为空、包含逗号或超过表格文件限制')
  }
  if (规则 && 规则.类型 !== '列表' && (!Number.isFinite(规则.最小值) || !Number.isFinite(规则.最大值) || 规则.最小值 > 规则.最大值 || (规则.类型 === '整数' && (!Number.isInteger(规则.最小值) || !Number.isInteger(规则.最大值))))) {
    throw new Error('数据验证数值范围无效')
  }
  const 单元格 = { ...工作表.单元格 }
  位置列表.forEach((位置) => {
    const 地址 = 生成地址(位置.行, 位置.列)
    const 原单元 = 读取单元格(工作表, 地址)
    if (规则) 单元格[地址] = { ...原单元, 数据验证: 规则 }
    else if (单元格[地址]) {
      const { 数据验证: _已清除, ...剩余 } = 单元格[地址]
      if (!剩余.原始值 && !剩余.批注 && Object.keys(剩余.格式).length === 0) delete 单元格[地址]
      else 单元格[地址] = 剩余
    }
  })
  return { ...工作表, 单元格 }
}

function 验证输入(值: string, 规则: 单元格数据验证): boolean {
  if (值 === '') return 规则.允许空白
  if (规则.类型 === '列表') return 规则.选项.includes(值)
  if (!/^-?\d+(?:\.\d+)?$/.test(值)) return false
  const 数值 = Number(值)
  return Number.isFinite(数值) && (规则.类型 !== '整数' || Number.isInteger(数值)) && 数值 >= 规则.最小值 && 数值 <= 规则.最大值
}

/** 提交前统一检查，覆盖功能区、公式栏、网格、剪贴板和批量命令。 */
export function 检查工作表更新(原表: Sheet, 新表: Sheet, 允许解除保护 = false): string | null {
  if (原表.保护 === '外部' && 新表 !== 原表) return '原文件的工作表保护不能在此解除或修改'
  if (原表.保护 === '本机' && 新表 !== 原表) {
    if (!(允许解除保护 && 新表.保护 === undefined)) return '工作表已保护，请先解除保护'
  }
  for (const 地址 of new Set([...Object.keys(原表.单元格), ...Object.keys(新表.单元格)])) {
    const 原值 = 原表.单元格[地址]?.原始值 ?? ''
    const 新值 = 新表.单元格[地址]?.原始值 ?? ''
    if (原值 === 新值) continue
    const 规则 = 新表.单元格[地址]?.数据验证 ?? 原表.单元格[地址]?.数据验证
    const 待验证值 = 新值.startsWith('=') ? String(新表.单元格[地址]?.计算值 ?? 新表.单元格[地址]?.显示值 ?? '') : 新值
    if (规则 && !验证输入(待验证值, 规则)) return `${地址} 不符合数据验证规则`
  }
  return null
}

/** 检查整个工作簿的更新，避免外部入口绕过保护或单元格验证。 */
export function 检查工作簿更新(原值: readonly Sheet[], 新值: readonly Sheet[]): string | null {
  if (!Array.isArray(新值) || 新值.length === 0) return '工作表数据无效'
  if (new Set(新值.map((表) => 表?.id)).size !== 新值.length) return '工作表标识重复，无法应用修改'
  for (const 原表 of 原值) {
    const 新表 = 新值.find((项) => 项?.id === 原表.id)
    if (!新表) {
      if (原表.保护) return `工作表“${原表.name}”已保护，不能删除`
      continue
    }
    if (原表.保护 === '外部') {
      if (新表 !== 原表) return '原文件的工作表保护不能在此解除或修改'
      continue
    }
    if (原表.保护 === '本机' && 新表 !== 原表) {
      const { 保护: _原保护, ...原内容 } = 原表
      const { 保护: _新保护, ...新内容 } = 新表
      if (新表.保护 !== undefined || JSON.stringify(原内容) !== JSON.stringify(新内容)) {
        return '工作表已保护，请先解除保护'
      }
      continue
    }
    const 错误 = 检查工作表更新(原表, 新表)
    if (错误) return 错误
  }
  return null
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
 * 正在求值集合在所有单元格求值过程中共享，确保跨单元格循环引用可被检测。
 */
export function 重算工作表(工作表: Sheet): Sheet {
  const 缓存 = new Map<string, number | string>()
  const 正在求值 = new Set<string>()

  const 求计算值 = (地址: string): number | string => {
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
    if (单元.值类型 === '文本' || !原始值.startsWith('=')) {
      const 数值 = Number(原始值)
      const 结果 = 单元.值类型 !== '文本' && 原始值.trim() !== '' && Number.isFinite(数值) ? 数值 : 原始值
      缓存.set(地址, 结果)
      return 结果
    }
    正在求值.add(地址)
    const 求值结果 = 求值公式(
      原始值,
      (引用地址) => 求计算值(引用地址),
      正在求值,
      地址
    )
    正在求值.delete(地址)
    缓存.set(地址, 求值结果.值)
    return 求值结果.值
  }

  const 新单元格: Record<string, SheetCell> = {}
  Object.keys(工作表.单元格).forEach((地址) => {
    const 单元 = 工作表.单元格[地址]
    const 计算值 = 求计算值(地址)
    const 是公式 = 单元.值类型 !== '文本' && 单元.原始值.startsWith('=')
    const { 计算值: _旧计算值, ...原单元 } = 单元
    新单元格[地址] = {
      ...原单元,
      ...(是公式 ? { 计算值 } : {}),
      显示值: 单元.值类型 === '文本' ? 单元.原始值 : 渲染原始值(是公式 ? String(计算值) : 单元.原始值, 单元.格式),
    }
  })

  return { ...工作表, 单元格: 新单元格 }
}

let 工作表标识序号 = 0

/** 创建空白工作表 */
export function 创建工作表(名称: string, 行数 = 默认行数, 列数 = 默认列数): Sheet {
  工作表标识序号 += 1
  const 工作表: Sheet = {
    id: `sheet-${Date.now()}-${工作表标识序号}`,
    name: 名称,
    单元格: {},
    行数,
    列数,
    列宽: Array.from({ length: 列数 }, () => 默认列宽),
    行高: Array.from({ length: 行数 }, () => 默认行高),
    合并区域: [],
    图片: [],
    页面设置: { ...默认页面设置 },
  }
  return 工作表
}

/** 图片字节和锚点需在进入工作表模型前校验，防止备份与导出膨胀。 */
export function 添加图片(工作表: Sheet, 图片: SheetImage): Sheet {
  const 已有 = 工作表.图片 ?? []
  const 字节数 = (数据: string): number => Math.floor(数据.length * 3 / 4) - (数据.endsWith('==') ? 2 : 数据.endsWith('=') ? 1 : 0)
  if (!图片.id || 已有.some((项) => 项.id === 图片.id) || !['png', 'jpeg'].includes(图片.格式) ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(图片.数据) || 图片.数据.length % 4 !== 0 ||
    字节数(图片.数据) > 5 * 1024 * 1024 ||
    !Number.isInteger(图片.行) || 图片.行 < 0 || 图片.行 >= 工作表.行数 || 图片.行 >= 500 ||
    !Number.isInteger(图片.列) || 图片.列 < 0 || 图片.列 >= 工作表.列数 || 图片.列 >= 50 ||
    !Number.isInteger(图片.宽) || 图片.宽 < 1 || 图片.宽 > 4096 ||
    !Number.isInteger(图片.高) || 图片.高 < 1 || 图片.高 > 4096) {
    throw new Error('图片格式、大小或位置无效')
  }
  if (已有.reduce((总数, 项) => 总数 + 字节数(项.数据), 字节数(图片.数据)) > 20 * 1024 * 1024) {
    throw new Error('当前工作表图片总大小不能超过 20 MB')
  }
  return { ...工作表, 图片: [...已有, 图片] }
}

export function 删除图片(工作表: Sheet, 标识: string): Sheet {
  const 已有 = 工作表.图片 ?? []
  return 已有.some((项) => 项.id === 标识)
    ? { ...工作表, 图片: 已有.filter((项) => 项.id !== 标识) }
    : 工作表
}

/** 更新工作表页面设置，兼容旧版文件中没有页面设置的模型。 */
export function 设置页面设置(工作表: Sheet, 更新: Partial<页面设置>): Sheet {
  return { ...工作表, 页面设置: { ...默认页面设置, ...工作表.页面设置, ...更新 } }
}

/** 写入单元格原始值并重算 */
export function 写入单元格(工作表: Sheet, 地址: string, 原始值: string): Sheet {
  const 原单元 = 读取单元格(工作表, 地址)
  const { 值类型: _导入值类型, ...更新前单元 } = 原单元
  const 新单元格 = { ...工作表.单元格 }
  if (原始值.length === 0 && Object.keys(原单元.格式).length === 0 && !原单元.批注 && !原单元.数据验证) {
    delete 新单元格[地址]
  } else {
    新单元格[地址] = { ...更新前单元, 原始值, 显示值: 原始值 }
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
    if (Object.keys(单元.格式).length === 0 && !单元.批注 && !单元.数据验证) {
      delete 新单元格[地址]
    } else {
      const { 值类型: _导入值类型, ...保留属性 } = 单元
      新单元格[地址] = { ...保留属性, 原始值: '', 显示值: '' }
    }
  })
  return 重算工作表({ ...工作表, 单元格: 新单元格 })
}

/** 新增、更新或删除单元格批注；删除后空白单元格不残留。 */
export function 设置批注(工作表: Sheet, 地址: string, 批注: string): Sheet {
  const 位置 = 解析地址(地址)
  if (位置 === null || 位置.行 >= 工作表.行数 || 位置.列 >= 工作表.列数) {
    throw new Error('批注单元格地址无效')
  }
  const 文本 = 批注.trim()
  const 原单元 = 读取单元格(工作表, 地址)
  const 新单元格 = { ...工作表.单元格 }
  if (文本 === '') {
    if (原单元.原始值 === '' && Object.keys(原单元.格式).length === 0 && !原单元.数据验证) {
      delete 新单元格[地址]
    } else {
      const { 批注: _已删除, ...余下 } = 原单元
      新单元格[地址] = 余下
    }
  } else {
    新单元格[地址] = { ...原单元, 批注: 文本 }
  }
  return { ...工作表, 单元格: 新单元格 }
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

/**
 * 调整列宽；低于下限时取下限，越界列返回原工作表。
 */
export function 设置列宽(工作表: Sheet, 列: number, 宽: number): Sheet {
  if (!Number.isFinite(列) || 列 < 0 || 列 >= 工作表.列数) {
    return 工作表
  }
  if (!Number.isFinite(宽)) {
    return 工作表
  }
  const 新列宽 = [...工作表.列宽]
  新列宽[列] = Math.max(最小列宽, Math.round(宽))
  return { ...工作表, 列宽: 新列宽 }
}

/**
 * 调整行高；低于下限时取下限，越界行返回原工作表。
 */
export function 设置行高(工作表: Sheet, 行: number, 高: number): Sheet {
  if (!Number.isFinite(行) || 行 < 0 || 行 >= 工作表.行数) {
    return 工作表
  }
  if (!Number.isFinite(高)) {
    return 工作表
  }
  const 新行高 = [...工作表.行高]
  新行高[行] = Math.max(最小行高, Math.round(高))
  return { ...工作表, 行高: 新行高 }
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

/**
 * 在指定行上方插入一行。
 * 该行之后的单元格行号加一，列宽不变，行高新增一项，行数加一。
 * 合并区域若位于插入点之下方则同步下移。
 */
export function 插入行(工作表: Sheet, 行: number): Sheet {
  const 有效行 = Math.max(0, Math.min(行, 工作表.行数))
  if ((工作表.图片 ?? []).some((图片) => 图片.行 >= 有效行 && 图片.行 >= 499)) {
    throw new Error('图片已位于可编辑区域边缘，无法在其上方插入行')
  }
  const 新单元格: Record<string, SheetCell> = {}
  Object.keys(工作表.单元格).forEach((地址) => {
    const 位置 = 解析地址(地址)
    if (位置 === null) {
      return
    }
    const 目标行 = 位置.行 >= 有效行 ? 位置.行 + 1 : 位置.行
    新单元格[生成地址(目标行, 位置.列)] = 工作表.单元格[地址]
  })
  const 新行高 = [...工作表.行高]
  新行高.splice(有效行, 0, 默认行高)
  const 新合并区域: string[] = []
  for (const 区域 of 工作表.合并区域) {
    const 位置列表 = 展开区域(区域)
    if (位置列表.length === 0) {
      continue
    }
    const 起始 = {
      行: Math.min(...位置列表.map((项) => 项.行)),
      列: Math.min(...位置列表.map((项) => 项.列)),
    }
    const 终点 = {
      行: Math.max(...位置列表.map((项) => 项.行)),
      列: Math.max(...位置列表.map((项) => 项.列)),
    }
    const 行偏移 = 起始.行 >= 有效行 ? 1 : 0
    新合并区域.push(
      生成区域地址(
        { 行: 起始.行 + 行偏移, 列: 起始.列 },
        { 行: 终点.行 + 行偏移, 列: 终点.列 }
      )
    )
  }
  return {
    ...工作表,
    单元格: 新单元格,
    行数: 工作表.行数 + 1,
    行高: 新行高,
    合并区域: 新合并区域,
    图片: (工作表.图片 ?? []).map((图片) => 图片.行 >= 有效行 ? { ...图片, 行: 图片.行 + 1 } : 图片),
  }
}

/**
 * 在指定列左侧插入一列。
 * 该列之后的单元格列号加一，行高不变，列宽新增一项，列数加一。
 * 合并区域若位于插入点之右侧则同步右移。
 */
export function 插入列(工作表: Sheet, 列: number): Sheet {
  const 有效列 = Math.max(0, Math.min(列, 工作表.列数))
  if ((工作表.图片 ?? []).some((图片) => 图片.列 >= 有效列 && 图片.列 >= 49)) {
    throw new Error('图片已位于可编辑区域边缘，无法在其左侧插入列')
  }
  const 新单元格: Record<string, SheetCell> = {}
  Object.keys(工作表.单元格).forEach((地址) => {
    const 位置 = 解析地址(地址)
    if (位置 === null) {
      return
    }
    const 目标列 = 位置.列 >= 有效列 ? 位置.列 + 1 : 位置.列
    新单元格[生成地址(位置.行, 目标列)] = 工作表.单元格[地址]
  })
  const 新列宽 = [...工作表.列宽]
  新列宽.splice(有效列, 0, 默认列宽)
  const 新合并区域: string[] = []
  for (const 区域 of 工作表.合并区域) {
    const 位置列表 = 展开区域(区域)
    if (位置列表.length === 0) {
      continue
    }
    const 起始行 = Math.min(...位置列表.map((项) => 项.行))
    const 终点行 = Math.max(...位置列表.map((项) => 项.行))
    const 起始列 = Math.min(...位置列表.map((项) => 项.列))
    const 终点列 = Math.max(...位置列表.map((项) => 项.列))
    const 列偏移 = 起始列 >= 有效列 ? 1 : 0
    新合并区域.push(
      生成区域地址(
        { 行: 起始行, 列: 起始列 + 列偏移 },
        { 行: 终点行, 列: 终点列 + 列偏移 }
      )
    )
  }
  return {
    ...工作表,
    单元格: 新单元格,
    列数: 工作表.列数 + 1,
    列宽: 新列宽,
    合并区域: 新合并区域,
    图片: (工作表.图片 ?? []).map((图片) => 图片.列 >= 有效列 ? { ...图片, 列: 图片.列 + 1 } : 图片),
  }
}

/**
 * 删除指定行。
 * 该行删除，其下单元格行号减一，行高移除一项，行数减一。
 * 合并区域相应处理：删除行上的合并区域整体移除，横跨删除行的合并区域缩短。
 * 行数不足两行或行号越界时返回原工作表。
 */
export function 删除行(工作表: Sheet, 行: number): Sheet {
  if (!Number.isFinite(行) || 行 < 0 || 行 >= 工作表.行数 || 工作表.行数 <= 1) {
    return 工作表
  }
  const 新单元格: Record<string, SheetCell> = {}
  Object.keys(工作表.单元格).forEach((地址) => {
    const 位置 = 解析地址(地址)
    if (位置 === null) {
      return
    }
    if (位置.行 === 行) {
      return
    }
    const 目标行 = 位置.行 > 行 ? 位置.行 - 1 : 位置.行
    新单元格[生成地址(目标行, 位置.列)] = 工作表.单元格[地址]
  })
  const 新行高 = [...工作表.行高]
  新行高.splice(行, 1)
  const 新合并区域: string[] = []
  for (const 区域 of 工作表.合并区域) {
    const 位置列表 = 展开区域(区域)
    if (位置列表.length === 0) {
      continue
    }
    const 起始行 = Math.min(...位置列表.map((项) => 项.行))
    const 终点行 = Math.max(...位置列表.map((项) => 项.行))
    const 起始列 = Math.min(...位置列表.map((项) => 项.列))
    const 终点列 = Math.max(...位置列表.map((项) => 项.列))
    if (终点行 < 行) {
      新合并区域.push(区域)
      continue
    }
    if (起始行 > 行) {
      新合并区域.push(
        生成区域地址(
          { 行: 起始行 - 1, 列: 起始列 },
          { 行: 终点行 - 1, 列: 终点列 }
        )
      )
      continue
    }
    // 删除行上的合并区域整体移除
    if (起始行 === 行) {
      continue
    }
    // 横跨删除行的合并区域缩短一行
    const 新终点行 = 终点行 - 1
    if (新终点行 >= 起始行) {
      新合并区域.push(
        生成区域地址(
          { 行: 起始行, 列: 起始列 },
          { 行: 新终点行, 列: 终点列 }
        )
      )
    }
  }
  return {
    ...工作表,
    单元格: 新单元格,
    行数: 工作表.行数 - 1,
    行高: 新行高,
    合并区域: 新合并区域,
    图片: (工作表.图片 ?? []).filter((图片) => 图片.行 !== 行).map((图片) => 图片.行 > 行 ? { ...图片, 行: 图片.行 - 1 } : 图片),
  }
}

/**
 * 删除指定列。
 * 该列删除，其右单元格列号减一，列宽移除一项，列数减一。
 * 合并区域相应处理：删除列上的合并区域整体移除，横跨删除列的合并区域缩短。
 * 列数不足两列或列号越界时返回原工作表。
 */
export function 删除列(工作表: Sheet, 列: number): Sheet {
  if (!Number.isFinite(列) || 列 < 0 || 列 >= 工作表.列数 || 工作表.列数 <= 1) {
    return 工作表
  }
  const 新单元格: Record<string, SheetCell> = {}
  Object.keys(工作表.单元格).forEach((地址) => {
    const 位置 = 解析地址(地址)
    if (位置 === null) {
      return
    }
    if (位置.列 === 列) {
      return
    }
    const 目标列 = 位置.列 > 列 ? 位置.列 - 1 : 位置.列
    新单元格[生成地址(位置.行, 目标列)] = 工作表.单元格[地址]
  })
  const 新列宽 = [...工作表.列宽]
  新列宽.splice(列, 1)
  const 新合并区域: string[] = []
  for (const 区域 of 工作表.合并区域) {
    const 位置列表 = 展开区域(区域)
    if (位置列表.length === 0) {
      continue
    }
    const 起始行 = Math.min(...位置列表.map((项) => 项.行))
    const 终点行 = Math.max(...位置列表.map((项) => 项.行))
    const 起始列 = Math.min(...位置列表.map((项) => 项.列))
    const 终点列 = Math.max(...位置列表.map((项) => 项.列))
    if (终点列 < 列) {
      新合并区域.push(区域)
      continue
    }
    if (起始列 > 列) {
      新合并区域.push(
        生成区域地址(
          { 行: 起始行, 列: 起始列 - 1 },
          { 行: 终点行, 列: 终点列 - 1 }
        )
      )
      continue
    }
    // 删除列上的合并区域整体移除
    if (起始列 === 列) {
      continue
    }
    // 横跨删除列的合并区域缩短一列
    const 新终点列 = 终点列 - 1
    if (新终点列 >= 起始列) {
      新合并区域.push(
        生成区域地址(
          { 行: 起始行, 列: 起始列 },
          { 行: 终点行, 列: 新终点列 }
        )
      )
    }
  }
  return {
    ...工作表,
    单元格: 新单元格,
    列数: 工作表.列数 - 1,
    列宽: 新列宽,
    合并区域: 新合并区域,
    图片: (工作表.图片 ?? []).filter((图片) => 图片.列 !== 列).map((图片) => 图片.列 > 列 ? { ...图片, 列: 图片.列 - 1 } : 图片),
  }
}
