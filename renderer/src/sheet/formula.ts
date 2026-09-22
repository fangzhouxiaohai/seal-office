// 公式引擎：支持四则运算、比较、单元格与区域引用，以及常用函数。
// 使用自建词法分析与递归下降解析，不使用 eval 或 Function 构造，避免代码注入风险。

import { 展开区域, 生成地址 } from './address'

export type 取值函数 = (地址: string) => number | string

export interface 求值结果 {
  值: number | string
  错误: boolean
}

type 单元值 = number | string | boolean
type 值 = 单元值 | 单元值[]

const 错误结果: 求值结果 = { 值: '#错误', 错误: true }

// ===== 词法分析 =====

type 词法单元 =
  | { 类型: '数字'; 值: number }
  | { 类型: '文本'; 值: string }
  | { 类型: '名称'; 值: string }
  | { 类型: '区域'; 值: string }
  | { 类型: '运算符'; 值: string }
  | { 类型: '比较'; 值: string }
  | { 类型: '左括号' }
  | { 类型: '右括号' }
  | { 类型: '逗号' }

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
      const 结束 = 输入.indexOf('"', 位置 + 1)
      if (结束 < 0) {
        return null
      }
      结果.push({ 类型: '文本', 值: 输入.slice(位置 + 1, 结束) })
      位置 = 结束 + 1
      continue
    }
    if (/[0-9.]/.test(字符)) {
      const 匹配 = /^[0-9]+(\.[0-9]+)?/.exec(输入.slice(位置))
      if (匹配 === null) {
        return null
      }
      结果.push({ 类型: '数字', 值: Number(匹配[0]) })
      位置 += 匹配[0].length
      continue
    }
    if (/[A-Za-z_]/.test(字符)) {
      const 匹配 = /^[A-Za-z_][A-Za-z0-9_]*/.exec(输入.slice(位置))
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
    if ('+-*/^'.includes(字符)) {
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
  const 单元 = 取首个(值)
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
      const 数值 = 转数值(单元)
      if (数值 !== null) {
        结果.push(数值)
      }
    })
  })
  return 结果
}

function 条件为真(值: 值): boolean {
  const 单元 = 取首个(值)
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
}

// ===== 递归下降解析 =====

class 解析器 {
  private 位置 = 0

  constructor(
    private readonly 单元列表: 词法单元[],
    private readonly 取值: 取值函数,
    private readonly 正在求值: Set<string>
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
    let 左 = this.解析加法()
    const 当前 = this.当前()
    if (当前 !== undefined && 当前.类型 === '比较') {
      this.位置 += 1
      const 右 = this.解析加法()
      左 = 比较运算(左, 右, 当前.值)
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
      左 = 算式运算(左, this.解析乘法(), 当前.值)
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
      左 = 算式运算(左, this.解析幂(), 当前.值)
    }
  }

  private 解析幂(): 值 {
    const 左 = this.解析一元()
    const 当前 = this.当前()
    if (当前 !== undefined && 当前.类型 === '运算符' && 当前.值 === '^') {
      this.位置 += 1
      return 算式运算(左, this.解析幂(), '^')
    }
    return 左
  }

  private 解析一元(): 值 {
    const 当前 = this.当前()
    if (当前 !== undefined && 当前.类型 === '运算符' && 当前.值 === '-') {
      this.位置 += 1
      const 数值 = 转数值(this.解析一元())
      if (数值 === null) {
        throw new Error('负号后的内容不是数值')
      }
      return -数值
    }
    return this.解析原子()
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
      return this.求区域(当前.值)
    }
    if (当前.类型 === '名称') {
      this.位置 += 1
      const 后继 = this.当前()
      if (后继 !== undefined && 后继.类型 === '左括号') {
        return this.求函数(当前.值)
      }
      return this.求引用(当前.值)
    }
    throw new Error('无法解析的内容')
  }

  private 求引用(名称: string): 值 {
    if (this.正在求值.has(名称)) {
      throw new Error('存在循环引用')
    }
    return this.取值(名称)
  }

  private 求区域(区域: string): 值 {
    const 位置列表 = 展开区域(区域)
    if (位置列表.length === 0) {
      throw new Error('区域引用无效')
    }
    return 位置列表.map((位置) => {
      const 地址 = 生成地址(位置.行, 位置.列)
      if (this.正在求值.has(地址)) {
        throw new Error('存在循环引用')
      }
      return this.取值(地址)
    })
  }

  private 求函数(名称: string): 值 {
    const 实现 = 函数表[名称.toUpperCase()]
    if (实现 === undefined) {
      throw new Error(`未知函数 ${名称}`)
    }
    this.位置 += 1
    const 参数列表: 值[] = []
    const 收尾 = this.当前()
    if (收尾 !== undefined && 收尾.类型 === '右括号') {
      this.位置 += 1
      return 实现(参数列表)
    }
    for (;;) {
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
    return 实现(参数列表)
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
  _当前地址: string = ''
): 求值结果 {
  const 文本 = 公式文本.trim()
  if (!文本.startsWith('=')) {
    return { 值: 文本, 错误: false }
  }
  const 表达式 = 文本.slice(1).trim()
  if (表达式.length === 0) {
    return 错误结果
  }
  const 单元列表 = 分词(表达式)
  if (单元列表 === null || 单元列表.length === 0) {
    return 错误结果
  }
  try {
    const 结果 = new 解析器(单元列表, 取值, 正在求值).解析()
    const 归一 = 取首个(结果)
    return { 值: typeof 归一 === 'boolean' ? (归一 ? 'TRUE' : 'FALSE') : 归一, 错误: false }
  } catch {
    return 错误结果
  }
}
