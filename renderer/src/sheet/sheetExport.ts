// 表格导出：CSV 与 HTML。
// 导出内容取自单元格的显示值，因此公式导出的是计算结果而非公式原文。

import { 生成地址, 解析地址 } from './address'
import { 读取单元格, 查询合并, 重算工作簿, 默认列宽, 默认行高, 默认页面设置, type CellFormat, type Sheet, type SheetImage, type 页面设置, type 单元格数据验证 } from './model'

/** 计算实际有内容的范围，避免导出整张空表 */
function 计算有效范围(工作表: Sheet): { 行数: number; 列数: number } {
  let 最大行 = -1
  let 最大列 = -1
  Object.keys(工作表.单元格).forEach((地址) => {
    const 单元 = 工作表.单元格[地址]
    if (单元.原始值.length === 0 && 单元.显示值.length === 0 && !单元.批注 && !单元.数据验证 && !单元.超链接 && Object.keys(单元.格式).length === 0) {
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

function 写入显示字体(element: HTMLElement, format: CellFormat): void {
  if (format.字体) element.style.fontFamily = format.字体
  if (format.字号) element.style.fontSize = `${format.字号}px`
  if (format.加粗 !== undefined) element.style.fontWeight = format.加粗 ? '600' : '400'
  if (format.斜体 !== undefined) element.style.fontStyle = format.斜体 ? 'italic' : 'normal'
  if (format.下划线 !== undefined) element.style.textDecoration = format.下划线 ? 'underline' : 'none'
  if (format.字体颜色) element.style.color = format.字体颜色
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
      const 合并 = 查询合并(工作表, {行,列})
      if (合并 && !合并.是左上角) continue
      const 单元 = 读取单元格(工作表, 生成地址(行, 列)), 格式 = 单元.格式
      const td = document.createElement('td')
      td.style.cssText = 'border:1px solid #E8EBF0;padding:6px 8px'
      写入显示字体(td, 格式)
      td.style.textAlign = 格式.水平对齐 ?? (格式.对齐元数据?.horizontal === 'general' && typeof 单元.计算值 === 'number' ? 'right' : 'left')
      td.style.verticalAlign = 格式.垂直对齐 ?? 'middle'
      td.style.whiteSpace = 格式.自动换行 ? 'pre-wrap' : 'nowrap'
      if (格式.填充颜色) td.style.backgroundColor = 格式.填充颜色
      if (合并) { td.colSpan = 合并.跨度列; td.rowSpan = 合并.跨度行 }
      if (单元.富文本 && 单元.富文本.map(段=>段.文本).join('') === 单元.显示值) {
        for (const 段 of 单元.富文本) { const span=document.createElement('span'); span.textContent=段.文本; 写入显示字体(span,段.格式??{}); td.append(span) }
      } else td.textContent = 单元.显示值
      单元格列表.push(td.outerHTML)
    }
    行列表.push(`<tr style="height:${工作表.行高[行] ?? 默认行高}px">${单元格列表.join('')}</tr>`)
  }
  const 页面 = { ...默认页面设置, ...工作表.页面设置 }, 自定义 = 页面.自定义页边距
  if (自定义 && !['top','right','bottom','left'].every(key => Number.isFinite(自定义[key as keyof typeof 自定义]) && 自定义[key as keyof typeof 自定义] >= 0 && 自定义[key as keyof typeof 自定义] <= 100)) throw new Error('自定义页边距无效')
  const 边距 = 自定义 ? `${自定义.top}in ${自定义.right}in ${自定义.bottom}in ${自定义.left}in` : ({常规:'.75in .7in',窄:'.75in .25in',适中:'1in .75in',宽:'1in'}[页面.页边距])
  const 纸张 = ['A4','A5','B5','Letter'].includes(页面.纸张大小) ? 页面.纸张大小 : 'auto'
  const 方向 = 页面.方向 === '横向' ? 'landscape' : 页面.方向 === '纵向' ? 'portrait' : ''
  const 列组 = Array.from({length:列数},(_,列)=>`<col style="width:${工作表.列宽[列] ?? 默认列宽}px">`).join('')
  return (
    '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n' +
    `<title>${转义Html(标题)}</title>\n<style>@page{size:${纸张} ${方向};margin:${边距}}</style></head>\n<body>\n` +
    `<table style="border-collapse:collapse;table-layout:fixed"><colgroup>${列组}</colgroup>${行列表.join('')}</table>\n</body>\n</html>\n`
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
 * 单张默认空表返回 null；多表工作簿保留空表的名称、顺序与引用目标。
 */
type Xlsx单元格 = string | { 值: string | number | boolean | { error: string }; 批注?: string; 格式?: CellFormat; 数据验证?: 单元格数据验证; 超链接?: string } | { 公式: string; 结果?: string | number | boolean | { error: string }; 数组范围?: string; 动态数组?: boolean; 保留公式拼写?: boolean; 批注?: string; 格式?: CellFormat; 数据验证?: 单元格数据验证; 超链接?: string } | { 文字: Array<{ 文本: string }>; 富文本?: Array<{ 文本: string; 格式?: CellFormat }>; 批注?: string; 格式?: CellFormat; 类型?: '文本'; 数据验证?: 单元格数据验证; 超链接?: string }
type Xlsx工作表 = {
  名称: string
  日期系统1904?: boolean
  公式兼容模式?: 'Excel' | 'WPS'
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

/** XML cannot represent isolated UTF-16 surrogates returned by legacy WPS text
 * indexing. Omit such a cache and retain its formula for recalculation rather
 * than silently replacing the calculated character with U+FFFD. */
function 可写公式缓存(value: unknown): boolean {
  if (typeof value !== 'string') return true
  for (let index=0;index<value.length;index++) {
    const code=value.charCodeAt(index)
    if (code>=0xd800&&code<=0xdbff) { const next=value.charCodeAt(++index);if (!(next>=0xdc00&&next<=0xdfff)) return false }
    else if (code>=0xdc00&&code<=0xdfff) return false
  }
  return true
}

export function 导出为Xlsx(工作表或列表: Sheet | Sheet[]): { 工作表: Xlsx工作表[]; 日期系统1904?: boolean; 公式兼容模式?: 'Excel' | 'WPS' } | null {
  const 列表 = Array.isArray(工作表或列表) ? 工作表或列表 : [工作表或列表]
  const 日期系统1904 = 列表[0]?.日期系统1904 === true
  if (列表.some(表 => (表.日期系统1904 === true) !== 日期系统1904)) throw new Error('工作表日期基准不一致，已阻止混合保存')
  const 公式兼容模式 = 列表[0]?.公式兼容模式
  if (列表.some(表 => (表.公式兼容模式 ?? 'Excel') !== (公式兼容模式 ?? 'Excel'))) throw new Error('工作表公式兼容模式不一致')
  const 表定义列表 = 重算工作簿(列表)
    .map((工作表) => 构建单表模型(工作表, 列表.length > 1))
    .filter((表): 表 is Xlsx工作表 => 表 !== null)
  if (表定义列表.length === 0) {
    return null
  }
  return { 工作表: 表定义列表, ...(日期系统1904 ? { 日期系统1904: true } : {}), ...(公式兼容模式 ? {公式兼容模式} : {}) }
}

/** 构建单张工作表的写入模型；空表返回 null */
function 构建单表模型(工作表: Sheet, 保留空表 = false): Xlsx工作表 | null {
  const { 行数, 列数 } = 计算有效范围(工作表)
  const 自定义页面 = !!工作表.页面设置?.自定义页边距 || Object.keys(默认页面设置).some(键 => (工作表.页面设置 ?? 默认页面设置)[键 as keyof typeof 默认页面设置] !== 默认页面设置[键 as keyof typeof 默认页面设置])
  const 有布局 = 工作表.合并区域.length > 0 || 工作表.冻结 !== undefined || 工作表.筛选 !== undefined || 工作表.保护 !== undefined || 自定义页面 ||
    工作表.日期系统1904 === true || 工作表.公式兼容模式 === 'WPS' ||
    工作表.列宽.some((宽) => 宽 !== 默认列宽) || 工作表.行高.some((高) => 高 !== 默认行高) || (工作表.图片?.length ?? 0) > 0
  if ((行数 === 0 || 列数 === 0) && !有布局 && !保留空表) {
    return null
  }
  const 数据: Xlsx单元格[][] = []
  for (let 行 = 0; 行 < Math.max(行数, 1); 行 += 1) {
    const 单元格列表: Xlsx单元格[] = []
    for (let 列 = 0; 列 < Math.max(列数, 1); 列 += 1) {
      const 单元 = 读取单元格(工作表, 生成地址(行, 列))
      const 格式 = Object.keys(单元.格式).length > 0 ? { 格式: 单元.格式 } : {}
      const 验证 = 单元.数据验证 ? { 数据验证: 单元.数据验证 } : {}
      const 链接 = 单元.超链接 ? { 超链接: 单元.超链接 } : {}
      if (单元.溢出锚点) {
        if (单元.公式状态 === '待计算') { 单元格列表.push({ 文字: [{ 文本: '' }], ...格式, ...验证 }); continue }
        const value = 单元.布尔结果 ?? 单元.计算值 ?? 单元.显示值
        if (!可写公式缓存(value)) { 单元格列表.push({文字:[{文本:''}],...格式,...验证}); continue }
        单元格列表.push({ 值: 单元.计算错误 && /^#(?:N\/A|SPILL!|CALC!|REF!|VALUE!|DIV\/0!|NUM!|NAME\?|NULL!)$/.test(String(value)) ? { error: String(value) } : value, ...(单元.批注 ? { 批注: 单元.批注 } : {}), ...格式, ...验证, ...链接 })
      } else if (单元.值类型 !== '文本' && 单元.原始值.startsWith('=') && 单元.原始值.length > 1) {
        const 来源 = 单元.公式来源?.原始值 === 单元.原始值 ? 单元.公式来源 : undefined
        let 结果 = 单元.公式状态 === '待计算' ? undefined : 单元.公式状态 === '来源缓存' && 来源 ? 来源.结果 : 单元.计算值 ?? 单元.显示值
        if (typeof 来源?.结果 === 'boolean' && ['TRUE', 'FALSE'].includes(String(结果))) 结果 = 结果 === 'TRUE'
        if (单元.布尔结果 !== undefined) 结果 = 单元.布尔结果
        if (!可写公式缓存(结果)) 结果 = undefined
        if (单元.计算错误 && /^#(?:N\/A|SPILL!|CALC!|REF!|VALUE!|DIV\/0!|NUM!|NAME\?|NULL!)$/.test(String(结果))) 结果 = { error: String(结果) }
        const 数组范围 = 单元.动态数组 ? 单元.溢出范围 ?? `${生成地址(行, 列)}:${生成地址(行, 列)}` : 来源?.数组范围
        单元格列表.push({ 公式: 单元.原始值.slice(1), ...(来源 ? { 保留公式拼写: true } : {}), ...(结果 !== undefined ? { 结果 } : {}), ...(数组范围 ? { 数组范围 } : {}), ...(单元.动态数组 || 来源?.动态数组 ? { 动态数组: true } : {}), ...(单元.批注 ? { 批注: 单元.批注 } : {}), ...格式, ...验证, ...链接 })
      } else if (单元.富文本 || 单元.批注 || Object.keys(格式).length > 0 || 单元.值类型 || 单元.数据验证 || 单元.超链接) {
        单元格列表.push({ 文字: [{ 文本: 单元.原始值 }], ...(单元.富文本 ? { 富文本: 单元.富文本 } : {}), ...(单元.批注 ? { 批注: 单元.批注 } : {}), ...(单元.值类型 ? { 类型: 单元.值类型 } : {}), ...格式, ...验证, ...链接 })
      } else {
        单元格列表.push(单元.原始值)
      }
    }
    数据.push(单元格列表)
  }
  return {
    名称: 工作表.name, 数据, ...(工作表.日期系统1904 ? { 日期系统1904: true } : {}), ...(工作表.公式兼容模式 ? {公式兼容模式:工作表.公式兼容模式} : {}), 页面设置: { ...默认页面设置, ...工作表.页面设置 },
    合并区域: [...工作表.合并区域], 列宽: [...工作表.列宽], 行高: [...工作表.行高],
    图片: [...(工作表.图片 ?? [])],
    ...(工作表.冻结 ? { 冻结: 工作表.冻结 } : {}),
    ...(工作表.筛选 ? { 筛选: 工作表.筛选 } : {}),
    ...(工作表.保护 ? { 保护: true } : {}),
  }
}
