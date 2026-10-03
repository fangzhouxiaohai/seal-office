// 表格导出：CSV 与 HTML。
// 导出内容取自单元格的显示值，因此公式导出的是计算结果而非公式原文。

import { 生成地址, 解析地址 } from './address'
import { 读取单元格, 默认列宽, 默认行高, 默认页面设置, type CellFormat, type Sheet, type SheetImage, type 页面设置, type 单元格数据验证 } from './model'

/** 计算实际有内容的范围，避免导出整张空表 */
function 计算有效范围(工作表: Sheet): { 行数: number; 列数: number } {
  let 最大行 = -1
  let 最大列 = -1
  Object.keys(工作表.单元格).forEach((地址) => {
    const 单元 = 工作表.单元格[地址]
    if (单元.原始值.length === 0 && 单元.显示值.length === 0 && !单元.批注 && !单元.数据验证 && Object.keys(单元.格式).length === 0) {
      return
    }
    const 位置 = 解析地址(地址)
    if (位置 === null) {
      return
    }
    最大行 = Math.max(最大行, 位置.行)
    最大列 = Math.max(最大列, 位置.列)
  })
  return { 行数: 最大行 + 1, 列数: 最大列 + 1 }
}

/** CSV 字段转义：含逗号、引号或换行时用双引号包裹，内部引号双写 */
export function 转义Csv字段(文本: string): string {
  if (/[",\n\r]/.test(文本)) {
    return `"${文本.replace(/"/g, '""')}"`
  }
  return 文本
}

/** 导出为 CSV；无内容时返回空字符串 */
export function 导出为Csv(工作表: Sheet): string {
  const { 行数, 列数 } = 计算有效范围(工作表)
  if (行数 === 0 || 列数 === 0) {
    return ''
  }
  const 行列表: string[] = []
  for (let 行 = 0; 行 < 行数; 行 += 1) {
    const 单元格列表: string[] = []
    for (let 列 = 0; 列 < 列数; 列 += 1) {
      单元格列表.push(转义Csv字段(读取单元格(工作表, 生成地址(行, 列)).显示值))
    }
    行列表.push(单元格列表.join(','))
  }
  return 行列表.join('\n')
}

/** 转义 HTML 特殊字符，避免单元格内容破坏导出页结构 */
function 转义Html(文本: string): string {
  return 文本.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 导出为独立的 HTML 表格文档；无内容时返回空字符串 */
export function 导出为Html表格(工作表: Sheet, 标题: string): string {
  const { 行数, 列数 } = 计算有效范围(工作表)
  if (行数 === 0 || 列数 === 0) {
    return ''
  }
  const 行列表: string[] = []
  for (let 行 = 0; 行 < 行数; 行 += 1) {
    const 单元格列表: string[] = []
    for (let 列 = 0; 列 < 列数; 列 += 1) {
      const 文本 = 读取单元格(工作表, 生成地址(行, 列)).显示值
      单元格列表.push(`<td style="border:1px solid #E8EBF0;padding:6px 8px">${转义Html(文本)}</td>`)
    }
    行列表.push(`<tr>${单元格列表.join('')}</tr>`)
  }
  return (
    '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n' +
    `<title>${转义Html(标题)}</title>\n</head>\n<body>\n` +
    `<table style="border-collapse:collapse">${行列表.join('')}</table>\n</body>\n</html>\n`
  )
}

/**
 * 依据工作表名生成导出文件名。
 * 扩展名带点时为 xlsx 等二进制格式，不带点时沿用 csv/html 的拼接方式。
 */
export function 生成表格文件名(工作表名: string, 扩展名: string): string {
  const 基准 = 工作表名.trim().length > 0 ? 工作表名.trim() : '工作表'
  return 扩展名.startsWith('.') ? `${基准}${扩展名}` : `${基准}.${扩展名}`
}

/**
 * 导出为 xlsx 的写入模型，支持单表或整本多工作表。
 * 主进程写入 xlsx 读 { 工作表: [{ 名称, 数据: 二维数组 }] }。
 * 公式携带表达式与计算结果；普通单元格保留原始输入。
 * 全部工作表均无内容时返回 null。
 */
type Xlsx单元格 = string | { 公式: string; 结果: string | number; 批注?: string; 格式?: CellFormat; 数据验证?: 单元格数据验证 } | { 文字: Array<{ 文本: string }>; 批注?: string; 格式?: CellFormat; 类型?: '文本'; 数据验证?: 单元格数据验证 }
type Xlsx工作表 = {
  名称: string
  数据: Xlsx单元格[][]
  页面设置: 页面设置
  合并区域: string[]
  列宽: number[]
  行高: number[]
  冻结?: { 行: number; 列: number }
  筛选?: { 列: number; 值: string }
  保护?: boolean
  图片?: SheetImage[]
}

export function 导出为Xlsx(工作表或列表: Sheet | Sheet[]): { 工作表: Xlsx工作表[] } | null {
  const 列表 = Array.isArray(工作表或列表) ? 工作表或列表 : [工作表或列表]
  const 表定义列表 = 列表
    .map((工作表) => 构建单表模型(工作表))
    .filter((表): 表 is Xlsx工作表 => 表 !== null)
  if (表定义列表.length === 0) {
    return null
  }
  return { 工作表: 表定义列表 }
}

/** 构建单张工作表的写入模型；空表返回 null */
function 构建单表模型(工作表: Sheet): Xlsx工作表 | null {
  const { 行数, 列数 } = 计算有效范围(工作表)
  const 有布局 = 工作表.合并区域.length > 0 || 工作表.冻结 !== undefined || 工作表.筛选 !== undefined || 工作表.保护 !== undefined ||
    工作表.列宽.some((宽) => 宽 !== 默认列宽) || 工作表.行高.some((高) => 高 !== 默认行高) || (工作表.图片?.length ?? 0) > 0
  if ((行数 === 0 || 列数 === 0) && !有布局) {
    return null
  }
  const 数据: Xlsx单元格[][] = []
  for (let 行 = 0; 行 < Math.max(行数, 1); 行 += 1) {
    const 单元格列表: Xlsx单元格[] = []
    for (let 列 = 0; 列 < Math.max(列数, 1); 列 += 1) {
      const 单元 = 读取单元格(工作表, 生成地址(行, 列))
      const 格式 = Object.keys(单元.格式).length > 0 ? { 格式: 单元.格式 } : {}
      const 验证 = 单元.数据验证 ? { 数据验证: 单元.数据验证 } : {}
      if (单元.原始值.startsWith('=') && 单元.原始值.length > 1) {
        const 数值 = Number(单元.显示值)
        const 结果 = 单元.显示值.trim() !== '' && Number.isFinite(数值) ? 数值 : 单元.显示值
        单元格列表.push({ 公式: 单元.原始值.slice(1), 结果, ...(单元.批注 ? { 批注: 单元.批注 } : {}), ...格式, ...验证 })
      } else if (单元.批注 || Object.keys(格式).length > 0 || 单元.值类型 || 单元.数据验证) {
        单元格列表.push({ 文字: [{ 文本: 单元.原始值 }], ...(单元.批注 ? { 批注: 单元.批注 } : {}), ...(单元.值类型 ? { 类型: 单元.值类型 } : {}), ...格式, ...验证 })
      } else {
        单元格列表.push(单元.原始值)
      }
    }
    数据.push(单元格列表)
  }
  return {
    名称: 工作表.name, 数据, 页面设置: { ...默认页面设置, ...工作表.页面设置 },
    合并区域: [...工作表.合并区域], 列宽: [...工作表.列宽], 行高: [...工作表.行高],
    图片: [...(工作表.图片 ?? [])],
    ...(工作表.冻结 ? { 冻结: 工作表.冻结 } : {}),
    ...(工作表.筛选 ? { 筛选: 工作表.筛选 } : {}),
    ...(工作表.保护 ? { 保护: true } : {}),
  }
}
