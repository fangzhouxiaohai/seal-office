// 表格筛选：兼容旧版单列单值 { 列, 值 } 与多列多条件模型，计算筛选隐藏行。
// 判定规则与主进程 main/office/xlsxFilter.js 保持一致，保证编辑器显示与保存后的隐藏行相同。
import { 列转字母, 字母转列, 生成地址 } from './address'
import { 读取单元格, type Sheet, type 工作表筛选, type 多列筛选, type 筛选列条件 } from './model'

/** 判断是否为多列筛选模型。 */
export function 是多列筛选(筛选: 工作表筛选 | undefined): 筛选 is 多列筛选 {
  return !!筛选 && Array.isArray((筛选 as 多列筛选).列条件)
}

/** 解析 A1:B10 或 $A$1:$B$10 形式的范围，返回 0 起始边界。 */
export function 解析筛选范围(范围: string): { 起行: number; 起列: number; 止行: number; 止列: number } | null {
  const 匹配 = 范围.trim().match(/^\$?([A-Z]{1,3})\$?([1-9]\d{0,6})(?::\$?([A-Z]{1,3})\$?([1-9]\d{0,6}))?$/i)
  if (!匹配) return null
  const 起列 = 字母转列(匹配[1].toUpperCase()), 起行 = Number(匹配[2]) - 1
  const 止列 = 匹配[3] ? 字母转列(匹配[3].toUpperCase()) : 起列, 止行 = 匹配[4] ? Number(匹配[4]) - 1 : 起行
  return 止列 < 起列 || 止行 < 起行 ? null : { 起行, 起列, 止行, 止列 }
}

/** 把旧版单值筛选规范为多列模型；范围从首行覆盖到工作表末行（与旧版保存行为一致）。 */
export function 规范工作表筛选(筛选: 工作表筛选 | undefined, 工作表: Pick<Sheet, '行数'>): 多列筛选 | undefined {
  if (!筛选) return undefined
  if (是多列筛选(筛选)) return 筛选
  const 条件: 筛选列条件 = 筛选.值 === '' ? { 列: 筛选.列, 空白: true } : { 列: 筛选.列, 值列表: [筛选.值] }
  return { 范围: `A1:${列转字母(筛选.列)}${Math.max(2, 工作表.行数)}`, 列条件: [条件] }
}

const 是数值 = (文本: string) => 文本.trim() !== '' && Number.isFinite(Number(文本.trim()))

/** Excel 通配符：* 任意多字符、? 单字符、~ 转义。 */
function 通配符正则(模式: string): RegExp {
  let 结果 = ''
  for (let 位置 = 0; 位置 < 模式.length; 位置 += 1) {
    const 字符 = 模式[位置]
    if (字符 === '~' && 位置 + 1 < 模式.length) { 结果 += 模式[++位置].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue }
    结果 += 字符 === '*' ? '[\\s\\S]*' : 字符 === '?' ? '[\\s\\S]' : 字符.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${结果}$`, 'i')
}

function 满足单条(文本: string, 运算符: string, 值: string): boolean {
  if (是数值(文本) && 是数值(值)) {
    const 左 = Number(文本), 右 = Number(值)
    return ({ equal: 左 === 右, notEqual: 左 !== 右, greaterThan: 左 > 右, greaterThanOrEqual: 左 >= 右, lessThan: 左 < 右, lessThanOrEqual: 左 <= 右 } as Record<string, boolean>)[运算符] ?? true
  }
  if (运算符 === 'equal' || 运算符 === 'notEqual') {
    const 相等 = /[*?~]/.test(值) ? 通配符正则(值).test(文本) : 文本.toLowerCase() === 值.toLowerCase()
    return 运算符 === 'equal' ? 相等 : !相等
  }
  if (文本 === '' || 是数值(值)) return false
  const 比较 = 文本.toLowerCase().localeCompare(值.toLowerCase())
  return ({ greaterThan: 比较 > 0, greaterThanOrEqual: 比较 >= 0, lessThan: 比较 < 0, lessThanOrEqual: 比较 <= 0 } as Record<string, boolean>)[运算符] ?? true
}

/** 单列条件判断；原样保留的条件本机无法解释，视为满足，不据此隐藏行。 */
export function 满足列条件(文本: string, 条件: 筛选列条件): boolean {
  if (条件.原始Xml) return true
  if (条件.自定义) {
    const 结果 = 条件.自定义.条件.map((项) => 满足单条(文本, 项.运算符, 项.值))
    return 条件.自定义.且 ? 结果.every(Boolean) : 结果.some(Boolean)
  }
  if (文本 === '') return 条件.空白 === true
  const 小写 = 文本.toLowerCase()
  return (条件.值列表 ?? []).some((项) => 项.toLowerCase() === 小写)
}

/** 计算筛选隐藏的数据行（0 起始，不含范围首行的表头）；各列条件按 AND 组合。 */
export function 计算筛选隐藏行(工作表: Sheet): Set<number> {
  const 隐藏 = new Set<number>()
  const 筛选 = 工作表.筛选
  if (!筛选) return 隐藏
  if (!是多列筛选(筛选)) {
    // 旧版单值筛选保持原有行为：首行为表头，其余逐行比较显示值。
    for (let 行 = 1; 行 < 工作表.行数; 行 += 1) {
      if (读取单元格(工作表, 生成地址(行, 筛选.列)).显示值 !== 筛选.值) 隐藏.add(行)
    }
    return 隐藏
  }
  const 范围 = 解析筛选范围(筛选.范围)
  if (!范围) return 隐藏
  for (let 行 = 范围.起行 + 1; 行 <= Math.min(范围.止行, 工作表.行数 - 1); 行 += 1) {
    if (!筛选.列条件.every((条件) => 满足列条件(读取单元格(工作表, 生成地址(行, 条件.列)).显示值, 条件))) 隐藏.add(行)
  }
  return 隐藏
}

/** 筛选栏的说明文字（用于界面显示，固定前缀便于翻译）。 */
export function 筛选说明(筛选: 工作表筛选): string {
  if (!是多列筛选(筛选)) return `第 ${筛选.列 + 1} 列筛选：${筛选.值 === '' ? '空白' : 筛选.值}`
  if (筛选.列条件.length === 1) {
    const 条件 = 筛选.列条件[0]
    if (!条件.自定义 && !条件.原始Xml && 条件.值列表?.length === 1 && !条件.空白) return `第 ${条件.列 + 1} 列筛选：${条件.值列表[0]}`
    if (!条件.自定义 && !条件.原始Xml && !条件.值列表?.length && 条件.空白) return `第 ${条件.列 + 1} 列筛选：空白`
  }
  return `多列筛选：${筛选.列条件.map((条件) => `${列转字母(条件.列)} 列`).join('、')}`
}

/** 筛选涉及的最大列号，用于导入时确定工作表列数。 */
export function 筛选最大列(筛选: 工作表筛选 | undefined): number {
  if (!筛选) return -1
  if (!是多列筛选(筛选)) return 筛选.列
  const 范围 = 解析筛选范围(筛选.范围)
  return Math.max(范围?.止列 ?? -1, ...筛选.列条件.map((条件) => 条件.列))
}
