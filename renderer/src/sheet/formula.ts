// 公式引擎：支持四则运算、比较、单元格与区域引用，以及常用函数。
// 使用自建词法分析与递归下降解析，不使用 eval 或 Function 构造，避免代码注入风险。

import { 展开区域, 生成地址, 解析地址 } from './address'
import { extraFormulaFunctions, auditedFormulaFunctionNames, scalarArrayFunctionNames, wpsTextFunctions } from './formulaFunctions'
import { arrayBroadcast, arrayCellError, formulaArray, formulaMatrix, formulaScalar, isFormulaErrorCode, markReferenceRange, spillMatrix, 未支持公式, 公式错误, type FormulaScalar } from './formulaValues'
import { dynamicArrayFunctions, liftedArrayFunctions } from './formulaArrays'
import { dateFunctions1904 } from './formulaDates'
export { 未支持公式 } from './formulaValues'

export type 取值函数 = (地址: string, 工作表?: string) => number | string | boolean

export interface 求值结果 {
  值: number | string
  错误: boolean
  /** 与除零等计算错误区分，导入端可保留来源文件的缓存结果。 */
  未支持?: boolean
  数组?: FormulaScalar[][]
  数组错误?: boolean[][]
}
export interface 公式上下文 { 日期系统1904?: boolean; 公式兼容模式?: 'Excel' | 'WPS'; 取溢出?: (地址: string, 工作表?: string) => FormulaScalar[][] }
const booleanResults = new WeakMap<求值结果, boolean>()
export const 读取公式布尔结果 = (result: 求值结果): boolean | undefined => booleanResults.get(result)

type 单元值 = number | string | boolean
type 值 = 单元值 | 单元值[]

const 错误结果: 求值结果 = { 值: '#错误', 错误: true }

// ===== 词法分析 =====

type 词法单元 =
  | { 类型: '数字'; 值: number }
  | { 类型: '文本'; 值: string }
  | { 类型: '名称'; 值: string }
  | { 类型: '引用'; 值: string; 工作表?: string }
  | { 类型: '区域'; 值: string; 工作表?: string }
  | { 类型: '运算符'; 值: string }
  | { 类型: '比较'; 值: string }
  | { 类型: '左括号' }
  | { 类型: '右括号' }
  | { 类型: '逗号' }
  | { 类型: '左数组' | '右数组' | '分号' | '溢出' }
  | { 类型: '错误'; 值: string }

function 分词(输入: string): 词法单元[] | null {
  const 结果: 词法单元[] = []
  let 位置 = 0
  while (位置 < 输入.length) {
    const 字符 = 输入[位置]
    if (/\s/.test(字符)) {
      位置 += 1
      continue
    }
    if (字符 === '"') {
      let 文本 = ''
      let 已结束 = false
      位置 += 1
      while (位置 < 输入.length) {
        if (输入[位置] === '"') {
          if (输入[位置 + 1] === '"') { 文本 += '"'; 位置 += 2; continue }
          位置 += 1; 已结束 = true; break
        }
        文本 += 输入[位置++]
      }
      if (!已结束) return null
      结果.push({ 类型: '文本', 值: 文本 })
      continue
    }
    const 错误 = /^#(?:REF!|SPILL!|CALC!|VALUE!|N\/A|DIV\/0!|NUM!|NAME\?|NULL!)/i.exec(输入.slice(位置))
    if (错误) { 结果.push({ 类型: '错误', 值: 错误[0].toUpperCase() }); 位置 += 错误[0].length; continue }
    const 特殊: Record<string, '左数组' | '右数组' | '分号' | '溢出'> = { '{': '左数组', '}': '右数组', ';': '分号', '#': '溢出' }
    if (特殊[字符]) { 结果.push({ 类型: 特殊[字符] }); 位置++; continue }
    // OOXML 使用 A1 引用；$ 只影响复制平移，不影响当前单元格的求值。
    const 跨表 = /^(?:'((?:[^']|'')+)'|([\p{L}_\\][\p{L}\p{N}_.\\]*))!(\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6})(?::(\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6}))?/u.exec(输入.slice(位置))
    const 引用 = 跨表 ? null : /^(\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6})(?::(\$?[A-Za-z]{1,3}\$?[1-9]\d{0,6}))?(?![A-Za-z0-9_.(])/u.exec(输入.slice(位置))
    if (跨表 || 引用) {
      const 首地址 = (跨表?.[3] ?? 引用![1]).replace(/\$/g, '').toUpperCase()
      const 尾地址 = (跨表?.[4] ?? 引用?.[2])?.replace(/\$/g, '').toUpperCase()
      const 表名 = 跨表 ? (跨表[1]?.replace(/''/g, "'") ?? 跨表[2]) : undefined
      结果.push({ 类型: 尾地址 ? '区域' : '引用', 值: 尾地址 ? `${首地址}:${尾地址}` : 首地址, ...(表名 ? { 工作表: 表名 } : {}) })
      位置 += (跨表 ?? 引用)![0].length
      continue
    }
    if (/[0-9.]/.test(字符)) {
      const 匹配 = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(输入.slice(位置))
      if (匹配 === null) {
        return null
      }
      结果.push({ 类型: '数字', 值: Number(匹配[0]) })
      位置 += 匹配[0].length
      continue
    }
    if (/[A-Za-z_]/.test(字符)) {
      const 匹配 = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(输入.slice(位置))
      if (匹配 === null) {
        return null
      }
      const 名称 = 匹配[0]
      位置 += 名称.length
      if (位置 < 输入.length && 输入[位置] === ':') {
        const 后继 = /^[A-Za-z_][A-Za-z0-9_]*/.exec(输入.slice(位置 + 1))
        if (后继 !== null) {
          结果.push({ 类型: '区域', 值: `${名称}:${后继[0]}` })
          位置 += 1 + 后继[0].length
          continue
        }
      }
      结果.push({ 类型: '名称', 值: 名称 })
      continue
    }
    if (字符 === '(') {
      结果.push({ 类型: '左括号' })
      位置 += 1
      continue
    }
    if (字符 === ')') {
      结果.push({ 类型: '右括号' })
      位置 += 1
      continue
    }
    if (字符 === ',') {
      结果.push({ 类型: '逗号' })
      位置 += 1
      continue
    }
    if ('+-*/^%&'.includes(字符)) {
      结果.push({ 类型: '运算符', 值: 字符 })
      位置 += 1
      continue
    }
    const 比较匹配 = /^(<=|>=|<>|=|<|>)/.exec(输入.slice(位置))
    if (比较匹配 !== null) {
      结果.push({ 类型: '比较', 值: 比较匹配[0] })
      位置 += 比较匹配[0].length
      continue
    }
    return null
  }
  return 结果
}

// ===== 值转换 =====

function 取首个(值: 值): 单元值 {
  return Array.isArray(值) ? (值.length > 0 ? 值[0] : '') : 值
}

function 转数值(值: 值): number | null {
  const 单元 = formulaScalar(值)
  if (typeof 单元 === 'number') {
    return Number.isFinite(单元) ? 单元 : null
  }
  if (typeof 单元 === 'boolean') {
    return 单元 ? 1 : 0
  }
  const 数值 = Number(单元)
  return Number.isFinite(数值) ? 数值 : null
}

function 转文本(值: 值): string {
  if (Array.isArray(值)) {
    return 值.map((项) => String(项)).join('')
  }
  return String(值)
}

function 展平(值: 值): 单元值[] {
  return Array.isArray(值) ? 值 : [值]
}

/** 收集参数中的全部数值，文本与空值忽略 */
function 数值列表(参数列表: 值[]): number[] {
  const 结果: number[] = []
  参数列表.forEach((项) => {
    展平(项).forEach((单元) => {
      if (isFormulaErrorCode(单元)) throw new 公式错误(String(单元))
      if (typeof 单元 === 'string' && 单元.trim() === '') return
      const 数值 = 转数值(单元)
      if (数值 !== null) {
        结果.push(数值)
      }
    })
  })
  return 结果
}

function 精确相等(左: 单元值, 右: 单元值): boolean {
  return String(左).toLocaleLowerCase() === String(右).toLocaleLowerCase()
}

function 条件为真(值: 值): boolean {
  const 单元 = formulaScalar(值)
  if (typeof 单元 === 'boolean') {
    return 单元
  }
  if (typeof 单元 === 'number') {
    return 单元 !== 0
  }
  return 单元.trim().length > 0
}

function 比较运算(左: 值, 右: 值, 运算符: string): boolean {
  const 左数 = 转数值(左)
  const 右数 = 转数值(右)
  if (左数 !== null && 右数 !== null) {
    switch (运算符) {
      case '>':
        return 左数 > 右数
      case '<':
        return 左数 < 右数
      case '>=':
        return 左数 >= 右数
      case '<=':
        return 左数 <= 右数
      case '=':
        return 左数 === 右数
      case '<>':
        return 左数 !== 右数
      default:
        throw new Error('未知比较运算符')
    }
  }
  const 左文 = 转文本(左)
  const 右文 = 转文本(右)
  switch (运算符) {
    case '=':
      return 左文 === 右文
    case '<>':
      return 左文 !== 右文
    case '>':
      return 左文 > 右文
    case '<':
      return 左文 < 右文
    case '>=':
      return 左文 >= 右文
    case '<=':
      return 左文 <= 右文
    default:
      throw new Error('未知比较运算符')
  }
}

function 算式运算(左: 值, 右: 值, 运算符: string): number {
  const 左数 = 转数值(左)
  const 右数 = 转数值(右)
  if (左数 === null || 右数 === null) {
    throw new Error('运算数不是有效数值')
  }
  switch (运算符) {
    case '+':
      return 左数 + 右数
    case '-':
      return 左数 - 右数
    case '*':
      return 左数 * 右数
    case '/':
      if (右数 === 0) {
        throw new Error('除数为零')
      }
      return 左数 / 右数
    case '^':
      return Math.pow(左数, 右数)
    default:
      throw new Error('未知运算符')
  }
}

// ===== 函数表 =====

type 函数实现 = (参数列表: 值[]) => 值

const 函数表: Record<string, 函数实现> = {
  SUM: (参数列表) => 数值列表(参数列表).reduce((累计, 项) => 累计 + 项, 0),
  AVERAGE: (参数列表) => {
    const 数值 = 数值列表(参数列表)
    if (数值.length === 0) {
      throw new Error('区域内没有可计算的数值')
    }
    return 数值.reduce((累计, 项) => 累计 + 项, 0) / 数值.length
  },
  MAX: (参数列表) => {
    const 数值 = 数值列表(参数列表)
    if (数值.length === 0) {
      throw new Error('区域内没有可计算的数值')
    }
    return Math.max(...数值)
  },
  MIN: (参数列表) => {
    const 数值 = 数值列表(参数列表)
    if (数值.length === 0) {
      throw new Error('区域内没有可计算的数值')
    }
    return Math.min(...数值)
  },
  COUNT: (参数列表) => 数值列表(参数列表).length,
  COUNTA: (参数列表) =>
    参数列表
      .flatMap((项) => 展平(项))
      .filter((项) => String(项).trim().length > 0).length,
  IF: (参数列表) => {
    if (参数列表.length !== 3) {
      throw new Error('IF 需要三个参数')
    }
    return 条件为真(参数列表[0]) ? 参数列表[1] : 参数列表[2]
  },
  ROUND: (参数列表) => {
    if (参数列表.length !== 2) {
      throw new Error('ROUND 需要两个参数')
    }
    const 数值 = 转数值(参数列表[0])
    const 小数位 = 转数值(参数列表[1])
    if (数值 === null || 小数位 === null) {
      throw new Error('ROUND 参数不是有效数值')
    }
    const 倍数 = Math.pow(10, 小数位)
    return Math.round(数值 * 倍数) / 倍数
  },
  ABS: (参数列表) => {
    if (参数列表.length !== 1) {
      throw new Error('ABS 需要一个参数')
    }
    const 数值 = 转数值(参数列表[0])
    if (数值 === null) {
      throw new Error('ABS 参数不是有效数值')
    }
    return Math.abs(数值)
  },
  CONCAT: (参数列表) => 参数列表.flatMap((项) => 展平(项)).map((项) => String(项)).join(''),
  MATCH: (参数列表) => {
    if (参数列表.length !== 3 || 转数值(参数列表[2]) !== 0) {
      throw new Error('MATCH 需要查找值、区域和精确匹配参数 0')
    }
    const 查找值 = 取首个(参数列表[0])
    const 位置 = 展平(参数列表[1]).findIndex((项) => 精确相等(项, 查找值))
    if (位置 < 0) throw new Error('未找到匹配值')
    return 位置 + 1
  },
  INDEX: (参数列表) => {
    if (参数列表.length !== 2) throw new Error('INDEX 需要一维区域和位置')
    const 位置 = 转数值(参数列表[1])
    const 区域 = 展平(参数列表[0])
    if (位置 === null || !Number.isInteger(位置) || 位置 < 1 || 位置 > 区域.length) {
      throw new Error('INDEX 位置超出区域')
    }
    return 区域[位置 - 1]
  },
  XLOOKUP: (参数列表) => {
    if (参数列表.length < 3 || 参数列表.length > 4) {
      throw new Error('XLOOKUP 需要查找值、查找区域和返回区域')
    }
    const 查找区域 = 展平(参数列表[1])
    const 返回区域 = 展平(参数列表[2])
    if (查找区域.length !== 返回区域.length || 查找区域.length === 0) {
      throw new Error('XLOOKUP 的两个区域长度必须相同')
    }
    const 查找值 = 取首个(参数列表[0])
    const 位置 = 查找区域.findIndex((项) => 精确相等(项, 查找值))
    if (位置 >= 0) return 返回区域[位置]
    if (参数列表.length === 4) return 取首个(参数列表[3])
    throw new Error('未找到匹配值')
  },
  PMT: (参数列表) => {
    if (参数列表.length !== 3) throw new Error('PMT 需要每期利率、期数和现值')
    const 利率 = 转数值(参数列表[0])
    const 期数 = 转数值(参数列表[1])
    const 现值 = 转数值(参数列表[2])
    if (利率 === null || 期数 === null || 现值 === null || 期数 <= 0 || 利率 <= -1) {
      throw new Error('PMT 参数无效')
    }
    if (利率 === 0) return -现值 / 期数
    const 增长 = Math.pow(1 + 利率, 期数)
    const 结果 = -现值 * 利率 * 增长 / (增长 - 1)
    if (!Number.isFinite(结果)) throw new Error('PMT 计算结果无效')
    return 结果
  },
}
Object.assign(函数表, extraFormulaFunctions)
export const 已支持公式函数 = Object.freeze([...new Set([...Object.keys(函数表), ...auditedFormulaFunctionNames, ...Object.keys(dynamicArrayFunctions), 'ANCHORARRAY', 'IFERROR', 'IFNA', 'ISERROR', 'ISERR', 'ISNA'])].sort())

// ===== 递归下降解析 =====

class 解析器 {
  private 位置 = 0

  constructor(
    private readonly 单元列表: 词法单元[],
    private readonly 取值: 取值函数,
    private readonly 正在求值: Set<string>,
    private readonly 上下文: 公式上下文 = {}
  ) {}

  private 当前(): 词法单元 | undefined {
    return this.单元列表[this.位置]
  }

  解析(): 值 {
    const 结果 = this.解析比较()
    if (this.位置 < this.单元列表.length) {
      throw new Error('表达式存在多余内容')
    }
    return 结果
  }

  private 解析比较(): 值 {
    let 左 = this.解析连接()
    const 当前 = this.当前()
    if (当前 !== undefined && 当前.类型 === '比较') {
      this.位置 += 1
      const 右 = this.解析连接()
      左 = arrayBroadcast([左, 右], cells => 比较运算(cells[0], cells[1], 当前.值))
    }
    return 左
  }

  private 解析连接(): 值 {
    let 左 = this.解析加法()
    while (this.当前()?.类型 === '运算符' && (this.当前() as { 值: string }).值 === '&') {
      this.位置 += 1
      左 = arrayBroadcast([左, this.解析加法()], cells => 转文本(cells[0]) + 转文本(cells[1]))
    }
    return 左
  }

  private 解析加法(): 值 {
    let 左 = this.解析乘法()
    for (;;) {
      const 当前 = this.当前()
      if (当前 === undefined || 当前.类型 !== '运算符' || !'+-'.includes(当前.值)) {
        return 左
      }
      this.位置 += 1
      左 = arrayBroadcast([左, this.解析乘法()], cells => 算式运算(cells[0], cells[1], 当前.值))
    }
  }

  private 解析乘法(): 值 {
    let 左 = this.解析幂()
    for (;;) {
      const 当前 = this.当前()
      if (当前 === undefined || 当前.类型 !== '运算符' || !'*/'.includes(当前.值)) {
        return 左
      }
      this.位置 += 1
      左 = arrayBroadcast([左, this.解析幂()], cells => 算式运算(cells[0], cells[1], 当前.值))
    }
  }

  private 解析幂(): 值 {
    const 左 = this.解析一元()
    const 当前 = this.当前()
    if (当前 !== undefined && 当前.类型 === '运算符' && 当前.值 === '^') {
      this.位置 += 1
      return arrayBroadcast([左, this.解析幂()], cells => 算式运算(cells[0], cells[1], '^'))
    }
    return 左
  }

  private 解析一元(): 值 {
    const 当前 = this.当前()
    if (当前 !== undefined && 当前.类型 === '运算符' && ['-', '+'].includes(当前.值)) {
      this.位置 += 1
      return arrayBroadcast([this.解析一元()], cells => {
        const 数值 = 转数值(cells[0]); if (数值 === null) throw new Error('负号后的内容不是数值')
        return 当前.值 === '-' ? -数值 : 数值
      })
    }
    let 结果 = this.解析原子()
    while (this.当前()?.类型 === '运算符' && (this.当前() as { 值: string }).值 === '%') {
      this.位置 += 1
      结果 = arrayBroadcast([结果], cells => { const 数值 = 转数值(cells[0]); if (数值 === null) throw new Error('百分比不是数值'); return 数值 / 100 })
    }
    return 结果
  }

  private 解析原子(): 值 {
    const 当前 = this.当前()
    if (当前 === undefined) {
      throw new Error('表达式意外结束')
    }
    if (当前.类型 === '数字') {
      this.位置 += 1
      return 当前.值
    }
    if (当前.类型 === '文本') {
      this.位置 += 1
      return 当前.值
    }
    if (当前.类型 === '错误') { this.位置++; throw new 公式错误(当前.值) }
    if (当前.类型 === '左数组') {
      this.位置++
      const rows: FormulaScalar[][] = [[]]
      for (;;) {
        const item = this.当前()
        let value: FormulaScalar
        if (item?.类型 === '数字' || item?.类型 === '文本') { value = item.值; this.位置++ }
        else if (item?.类型 === '名称' && /^(TRUE|FALSE)$/i.test(item.值)) { value = item.值.toUpperCase() === 'TRUE'; this.位置++ }
        else if (item?.类型 === '运算符' && ['+', '-'].includes(item.值) && this.单元列表[this.位置 + 1]?.类型 === '数字') {
          this.位置++; const number = this.当前() as { 类型: '数字'; 值: number }; value = item.值 === '-' ? -number.值 : number.值; this.位置++
        } else throw new 公式错误('#VALUE!')
        rows[rows.length - 1].push(value)
        const separator = this.当前(); this.位置++
        if (separator?.类型 === '右数组') break
        if (separator?.类型 === '分号') rows.push([])
        else if (separator?.类型 !== '逗号') throw new 公式错误('#VALUE!')
      }
      return formulaArray(rows)
    }
    if (当前.类型 === '左括号') {
      this.位置 += 1
      const 结果 = this.解析比较()
      const 收尾 = this.当前()
      if (收尾 === undefined || 收尾.类型 !== '右括号') {
        throw new Error('括号不匹配')
      }
      this.位置 += 1
      return 结果
    }
    if (当前.类型 === '区域') {
      this.位置 += 1
      return this.求区域(当前.值, 当前.工作表)
    }
    if (当前.类型 === '引用') {
      this.位置 += 1
      if (this.当前()?.类型 === '溢出') { this.位置++; return this.求溢出(当前.值, 当前.工作表) }
      return this.求引用(当前.值, 当前.工作表)
    }
    if (当前.类型 === '名称') {
      this.位置 += 1
      const 后继 = this.当前()
      if (后继 !== undefined && 后继.类型 === '左括号') {
        return this.求函数(当前.值)
      }
      if (当前.值.toUpperCase() === 'TRUE') return true
      if (当前.值.toUpperCase() === 'FALSE') return false
      throw new 未支持公式(`命名区域尚不能计算：${当前.值}`)
    }
    throw new Error('无法解析的内容')
  }

  private 求引用(名称: string, 工作表?: string): 单元值 {
    const 位置 = 解析地址(名称)
    if (!位置 || 位置.行 >= 1048576 || 位置.列 >= 16384) throw new Error('引用地址超出工作表')
    if (!工作表 && this.正在求值.has(名称)) {
      throw new Error('存在循环引用')
    }
    return this.取值(名称, 工作表)
  }

  private 求区域(区域: string, 工作表?: string): 值 {
    const [起点, 终点] = 区域.split(':').map(解析地址)
    if (!起点 || !终点 || 起点.行 >= 1048576 || 终点.行 >= 1048576 || 起点.列 >= 16384 || 终点.列 >= 16384 ||
      (Math.abs(终点.行 - 起点.行) + 1) * (Math.abs(终点.列 - 起点.列) + 1) > 100000) throw new 未支持公式('引用区域过大')
    const 位置列表 = 展开区域(区域)
    if (位置列表.length === 0) {
      throw new Error('区域引用无效')
    }
    const 值列表 = 位置列表.map((位置) => {
      const 地址 = 生成地址(位置.行, 位置.列)
      try { return this.求引用(地址, 工作表) }
      catch (error) { if (error instanceof 公式错误 && error.代码 !== '#待计算') return arrayCellError(error.代码); throw error }
    })
    return markReferenceRange(值列表, Math.abs(终点.列 - 起点.列) + 1, this.上下文.公式兼容模式 === 'WPS')
  }

  private 求溢出(地址: string, 工作表?: string): 值 {
    if (!this.上下文.取溢出) throw new 未支持公式('需要工作簿溢出上下文')
    return formulaArray(this.上下文.取溢出(地址, 工作表))
  }

  private 求函数(名称: string): 值 {
    // 保留原公式拼写，只在求值时去掉 Office 对新增函数使用的前缀。
    名称 = 名称.replace(/^_xlfn\.(?:_xlws\.)?/i, '').toUpperCase()
    if (名称 === 'ANCHORARRAY') {
      this.位置++
      const reference = this.当前()
      if (reference?.类型 !== '引用') throw new 未支持公式('ANCHORARRAY 需要单个锚点引用')
      this.位置++
      if (this.当前()?.类型 !== '右括号') throw new 未支持公式('ANCHORARRAY 需要单个锚点引用')
      this.位置++
      return this.求溢出(reference.值, reference.工作表)
    }
    if (dynamicArrayFunctions[名称]) {
      this.位置++
      const intervals = this.切分顶层参数()
      const args = intervals.length === 1 && intervals[0][0] === intervals[0][1] ? [] : intervals.map(interval => interval[0] === interval[1] ? undefined : this.求区间(interval))
      return dynamicArrayFunctions[名称](args)
    }
    if (名称.toUpperCase() === 'IF') {
      return this.求函数IF()
    }
    if (名称 === 'IFERROR') {
      this.位置 += 1
      const 参数 = this.切分顶层参数()
      if (参数.length !== 2) throw new Error('IFERROR 需要两个参数')
      try {
        const value = this.求区间(参数[0])
        if (!Array.isArray(value) && isFormulaErrorCode(value)) throw new 公式错误(String(value))
        if (!Array.isArray(value) || !value.some(isFormulaErrorCode)) return value
        const fallback = this.求区间(参数[1])
        return arrayBroadcast([value, fallback], cells => isFormulaErrorCode(cells[0]) ? cells[1] : cells[0], true)
      } catch (错误) {
        if (错误 instanceof 未支持公式) throw 错误
        return this.求区间(参数[1])
      }
    }
    if (['IFNA', 'ISERROR', 'ISERR', 'ISNA'].includes(名称)) {
      this.位置 += 1
      const 参数 = this.切分顶层参数()
      if (参数.length !== (名称 === 'IFNA' ? 2 : 1)) throw new Error('错误检查函数参数个数不正确')
      if (参数.some(([开始, 结束]) => 开始 === 结束)) throw new Error('错误检查函数缺少参数')
      try {
        const value = this.求区间(参数[0])
        if (!Array.isArray(value) && isFormulaErrorCode(value)) throw new 公式错误(String(value))
        if (Array.isArray(value)) {
          if (名称 === 'IFNA') {
            if (!value.some(cell => isFormulaErrorCode(cell) && String(cell) === '#N/A')) return value
            return arrayBroadcast([value, this.求区间(参数[1])], cells => isFormulaErrorCode(cells[0]) && String(cells[0]) === '#N/A' ? cells[1] : cells[0], true)
          }
          return arrayBroadcast([value], cells => 名称 === 'ISNA' ? isFormulaErrorCode(cells[0]) && String(cells[0]) === '#N/A' : 名称 === 'ISERR' ? isFormulaErrorCode(cells[0]) && String(cells[0]) !== '#N/A' : isFormulaErrorCode(cells[0]), true)
        }
        return 名称 === 'IFNA' ? value : false
      } catch (error) {
        if (error instanceof 未支持公式) throw error
        const na = error instanceof Error && error.message === '#N/A'
        if (名称 === 'IFNA') { if (na) return this.求区间(参数[1]); throw error }
        return 名称 === 'ISNA' ? na : 名称 === 'ISERR' ? !na : true
      }
    }
    const 实现 = (this.上下文.公式兼容模式 === 'WPS' ? wpsTextFunctions[名称] : undefined) ?? (this.上下文.日期系统1904 ? dateFunctions1904[名称] : undefined) ?? 函数表[名称]
    if (实现 === undefined) {
      throw new 未支持公式(`未知函数 ${名称}`)
    }
    this.位置 += 1
    const 参数列表: 值[] = []
    const 收尾 = this.当前()
    if (收尾 !== undefined && 收尾.类型 === '右括号') {
      this.位置 += 1
      return 实现(参数列表)
    }
    for (;;) {
      if (this.当前()?.类型 === '逗号' || this.当前()?.类型 === '右括号') throw new 未支持公式('省略中间参数的公式暂不能计算')
      参数列表.push(this.解析比较())
      const 分隔 = this.当前()
      if (分隔 !== undefined && 分隔.类型 === '逗号') {
        this.位置 += 1
        continue
      }
      if (分隔 !== undefined && 分隔.类型 === '右括号') {
        this.位置 += 1
        break
      }
      throw new Error('函数参数格式错误')
    }
    if ((liftedArrayFunctions.has(名称) || scalarArrayFunctionNames.has(名称)) && 参数列表.some(Array.isArray)) return arrayBroadcast(参数列表, cells => formulaScalar(实现(cells)))
    // Date/day/weekend arguments broadcast independently; the holiday argument
    // remains one complete range for each result, never an elementwise operand.
    if (['WORKDAY','WORKDAY.INTL','NETWORKDAYS','NETWORKDAYS.INTL'].includes(名称)) {
      const count=名称.endsWith('.INTL')?3:2, operands=参数列表.slice(0,count)
      if (operands.some(Array.isArray)) return arrayBroadcast(operands,cells=>formulaScalar(实现([...cells,...参数列表.slice(count)])))
    }
    if (['VLOOKUP', 'HLOOKUP', 'MATCH'].includes(名称) && Array.isArray(参数列表[0])) return arrayBroadcast([参数列表[0]], cells => formulaScalar(实现([cells[0], ...参数列表.slice(1)])))
    return 实现(参数列表)
  }

  /**
   * 惰性求值 IF：三个参数按顶层逗号切分为 token 区间，条件立即求值，
   * 仅对条件选中的分支求值，避免未选分支中的错误影响整体结果。
   */
  private 求函数IF(): 值 {
    this.位置 += 1 // 跳过左括号
    const 参数区间 = this.切分顶层参数()
    if (参数区间.length !== 3) {
      throw new Error('IF 需要三个参数')
    }
    const 条件 = this.求区间(参数区间[0])
    if (Array.isArray(条件)) {
      const flags = formulaMatrix(条件).flat().map(value => 条件为真(value))
      const yes = flags.some(Boolean) ? this.求区间(参数区间[1]) : 0
      const no = flags.some(value => !value) ? this.求区间(参数区间[2]) : 0
      return arrayBroadcast([条件, yes, no], cells => isFormulaErrorCode(cells[0]) ? cells[0] : 条件为真(cells[0]) ? cells[1] : cells[2], true)
    }
    return 条件为真(条件) ? this.求区间(参数区间[1]) : this.求区间(参数区间[2])
  }

  /** 求函数时按当前 位置 起扫描，返回以顶层逗号分隔的各参数 token 区间。 */
  private 切分顶层参数(): Array<[number, number]> {
    const 结果: Array<[number, number]> = []
    const 列表 = this.单元列表
    const 长度 = 列表.length
    let 深度 = 0
    let 开始 = this.位置
    for (; this.位置 < 长度; this.位置 += 1) {
      const 当前 = 列表[this.位置]
      if (当前.类型 === '左括号' || 当前.类型 === '左数组') {
        深度 += 1
        continue
      }
      if (当前.类型 === '右数组') { 深度--; continue }
      if (当前.类型 === '右括号') {
        if (深度 === 0) {
          结果.push([开始, this.位置])
          this.位置 += 1
          return 结果
        }
        深度 -= 1
        continue
      }
      if (当前.类型 === '逗号' && 深度 === 0) {
        结果.push([开始, this.位置])
        开始 = this.位置 + 1
      }
    }
    throw new Error('函数参数格式错误')
  }

  /** 在独立的子解析器上求值一段 token 区间，保持惰性分支彼此隔离。 */
  private 求区间(区间: [number, number]): 值 {
    const [开始, 结束] = 区间
    const 子解析器 = new 解析器(this.单元列表.slice(开始, 结束), this.取值, this.正在求值, this.上下文)
    return 子解析器.解析()
  }
}

/**
 * 求值一个公式。
 * 传入正在求值的地址集合可在递归求值中检出循环引用。
 */
export function 求值公式(
  公式文本: string,
  取值: 取值函数,
  正在求值: Set<string> = new Set(),
  _当前地址: string = '',
  上下文: 公式上下文 = {}
): 求值结果 {
  const 文本 = 公式文本.trim()
  if (!文本.startsWith('=')) {
    return { 值: 文本, 错误: false }
  }
  const 表达式 = 文本.slice(1).trim()
  if (表达式.length > 32767) return { ...错误结果, 未支持: true }
  if (表达式.length === 0) {
    return 错误结果
  }
  const 单元列表 = 分词(表达式)
  if (单元列表 === null || 单元列表.length === 0) {
    return { ...错误结果, 未支持: true }
  }
  try {
    const 结果 = new 解析器(单元列表, 取值, 正在求值, 上下文).解析()
    const 归一 = 取首个(结果)
    if (typeof 归一 === 'number' && !Number.isFinite(归一)) return 错误结果
    const matrix = Array.isArray(结果) ? spillMatrix(结果) : undefined, errors = matrix?.map(row => row.map(isFormulaErrorCode))
    const returned: 求值结果 = { 值: isFormulaErrorCode(归一) ? String(归一) : typeof 归一 === 'boolean' ? (归一 ? 'TRUE' : 'FALSE') : 归一, 错误: !matrix && isFormulaErrorCode(归一), ...(matrix ? { 数组: matrix.map(row => row.map(cell => isFormulaErrorCode(cell) ? String(cell) : cell)), ...(errors?.some(row => row.some(Boolean)) ? { 数组错误: errors } : {}) } : {}) }
    if (typeof 归一 === 'boolean') booleanResults.set(returned, 归一)
    return returned
  } catch (错误) {
    return 错误 instanceof 未支持公式 ? { ...错误结果, 未支持: true } : 错误 instanceof 公式错误 ? { 值: 错误.代码, 错误: true } : 错误结果
  }
}
