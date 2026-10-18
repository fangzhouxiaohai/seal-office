import * as F from '@formulajs/formulajs'
import { dateFunctions, localDateToExcelSerial } from './formulaDates'
import { formulaMatrix, formulaNumber, formulaScalar, isFormulaErrorCode, 未支持公式, type FormulaScalar, type FormulaValue } from './formulaValues'

type Implementation = (args: FormulaValue[]) => FormulaValue
type Spec = { min: number; max: number; ranges: 'all' | number[] }
const library = F as unknown as Record<string, unknown>
const registry: Record<string, Implementation> = Object.create(null)
/** Registration declarations, rather than arbitrary library exports, identify scalar-only functions. */
export const scalarArrayFunctionNames = new Set<string>()
function resolve(name: string): (...args: unknown[]) => unknown {
  let target: unknown = library
  for (const part of name.split('.')) {
    if (!target || !Object.prototype.hasOwnProperty.call(target, part)) throw new Error(`审核过的函数不存在：${name}`)
    target = (target as Record<string, unknown>)[part]
  }
  if (typeof target !== 'function') throw new Error(`审核过的函数无法执行：${name}`)
  return target as (...args: unknown[]) => unknown
}
function normalize(value: unknown): FormulaScalar {
  if (value instanceof Error) throw value
  if (value instanceof Date) return localDateToExcelSerial(value)
  if (Array.isArray(value)) throw new 未支持公式('数组返回值尚不能溢出到多个单元格')
  if (typeof value === 'number' && Number.isFinite(value) || typeof value === 'string' || typeof value === 'boolean') return value as FormulaScalar
  throw new Error('函数没有返回有效的标量结果')
}
function arity(args: FormulaValue[], min: number, max = min): void { if (args.length < min || args.length > max) throw new Error('函数参数个数不正确') }
/** 每项显式指定参数数量及可接收区域的位置，绝不按库的导出对象批量注册。 */
function register(names: string, min: number, max = min, ranges: Spec['ranges'] = []): void {
  for (const name of names.split(' ')) {
    if (Array.isArray(ranges) && ranges.length === 0 && name !== 'TYPE') scalarArrayFunctionNames.add(name)
    const fn = resolve(name)
    registry[name] = args => {
      arity(args, min, max)
      const boundedArguments: Record<string, number[]> = { DB: [3], DDB: [3], CUMIPMT: [4], CUMPRINC: [4], 'POISSON.DIST': [0], 'BINOM.DIST': [1], 'BINOM.INV': [0], 'HYPGEOM.DIST': [0, 1, 2, 3], 'NEGBINOM.DIST': [0, 1] }
      if (boundedArguments[name]?.some(index => Math.abs(formulaNumber(args[index])) > 100000)) throw new 未支持公式('函数参数超过本机有界计算上限')
      const input = args.map((value, i) => Array.isArray(value) && (ranges === 'all' || ranges.includes(i)) ? value.map(cell => isFormulaErrorCode(cell) ? new Error(String(cell)) : cell) : formulaScalar(value))
      return normalize(fn(...input))
    }
  }
}

register('ACOS ACOSH ACOT ACOTH ASIN ASINH ATAN ATANH COS COSH COT COTH CSC CSCH DEGREES EVEN EXP FACT FACTDOUBLE INT LN LOG10 ODD RADIANS SEC SECH SIGN SIN SINH SQRT SQRTPI TAN TANH', 1)
register('ATAN2 COMBIN COMBINA MOD POWER QUOTIENT', 2)
register('LOG', 1, 2)
register('PI TRUE FALSE', 0)
register('CEILING FLOOR', 2)
register('CEILING.MATH FLOOR.MATH', 1, 3)
register('CEILING.PRECISE FLOOR.PRECISE', 1, 2)
register('GCD LCM PRODUCT SUMSQ', 1, 255, 'all')
register('AND OR XOR', 1, 255, 'all')
register('NOT ISBLANK ISLOGICAL ISNONTEXT ISNUMBER ISTEXT N TYPE', 1)

register('AVEDEV AVERAGEA DEVSQ GEOMEAN HARMEAN KURT MAXA MEDIAN MINA MODE.SNGL SKEW SKEW.P STDEV.S STDEV.P STDEVA STDEVPA VAR.S VAR.P VARA VARPA', 1, 255, 'all')
register('COUNTBLANK', 1, 1, [0])
register('LARGE SMALL PERCENTILE.INC PERCENTILE.EXC QUARTILE.INC QUARTILE.EXC', 2, 2, [0])
register('PERCENTRANK.INC PERCENTRANK.EXC', 2, 3, [0])
register('RANK.EQ RANK.AVG', 2, 3, [1])
register('CORREL PEARSON RSQ SLOPE INTERCEPT STEYX COVARIANCE.P COVARIANCE.S', 2, 2, [0, 1])
register('STANDARDIZE', 3)
register('FISHER FISHERINV GAMMA GAMMALN GAUSS PHI', 1)
register('NORM.DIST', 4)
register('NORM.INV LOGNORM.INV', 3)
register('NORM.S.DIST', 2)
register('NORM.S.INV', 1)
register('LOGNORM.DIST BINOM.DIST WEIBULL.DIST', 4)
register('BINOM.INV POISSON.DIST EXPON.DIST CONFIDENCE.NORM CONFIDENCE.T', 3)
register('BETA.DIST', 4, 6)
register('BETA.INV', 3, 5)
register('CHISQ.DIST', 3)
register('CHISQ.DIST.RT CHISQ.INV CHISQ.INV.RT T.DIST.RT T.DIST.2T T.INV T.INV.2T', 2)
register('T.DIST F.DIST.RT F.INV F.INV.RT', 3)
register('F.DIST', 4)
register('HYPGEOM.DIST', 5)
register('NEGBINOM.DIST', 4)
register('PERMUT PERMUTATIONA', 2)
register('PROB', 3, 4, [0, 1])
register('TRIMMEAN', 2, 2, [0])

register('FV PV PMT', 3, 5)
register('NPER', 3, 5)
register('RATE', 3, 6)
register('IPMT PPMT', 4, 6)
register('NPV', 2, 255, Array.from({ length: 254 }, (_, i) => i + 1))
register('IRR', 1, 2, [0])
register('MIRR', 3, 3, [0])
register('RRI PDURATION SLN', 3)
register('EFFECT NOMINAL', 2)
register('SYD', 4)
register('DB', 4, 5)
register('DDB', 4, 5)
register('CUMIPMT CUMPRINC', 6)
register('ISPMT', 4)
register('FVSCHEDULE', 2, 2, [1])

register('CLEAN CODE CHAR UNICHAR UNICODE TRIM LOWER UPPER PROPER VALUE', 1)
register('EXACT REPT', 2)
register('SUBSTITUTE', 3, 4)
register('NUMBERVALUE', 1, 3)
register('CONCATENATE', 1, 255, 'all')
register('TEXTJOIN', 3, 255, 'all')

const text = (value: FormulaValue) => String(formulaScalar(value))
const positiveCount = (value: FormulaValue) => { const n = Math.trunc(formulaNumber(value)); if (n < 0) throw new Error('字符个数不能为负'); return n }
registry.LEN = args => { arity(args, 1); return Array.from(text(args[0])).length }
registry.LEFT = args => { arity(args, 1, 2); return Array.from(text(args[0])).slice(0, args.length > 1 ? positiveCount(args[1]) : 1).join('') }
registry.RIGHT = args => { arity(args, 1, 2); const n = args.length > 1 ? positiveCount(args[1]) : 1; return n ? Array.from(text(args[0])).slice(-n).join('') : '' }
registry.MID = args => { arity(args, 3); const start = Math.trunc(formulaNumber(args[1])); if (start < 1) throw new Error('MID 起点须大于零'); return Array.from(text(args[0])).slice(start - 1, start - 1 + positiveCount(args[2])).join('') }
registry.REPLACE = args => { arity(args, 4); const chars = Array.from(text(args[0])), start = Math.trunc(formulaNumber(args[1])); if (start < 1) throw new Error('REPLACE 起点须大于零'); chars.splice(start - 1, positiveCount(args[2]), text(args[3])); return chars.join('') }
registry.REPT = args => { arity(args, 2); const value = text(args[0]), times = positiveCount(args[1]); if (value.length * times > 32767) throw new Error('REPT 结果超过单元格文本上限'); return value.repeat(times) }
registry.SUBSTITUTE = args => {
  arity(args, 3, 4)
  const original = text(args[0]), old = text(args[1]), replacement = text(args[2]), instance = args.length === 4 ? Math.trunc(formulaNumber(args[3])) : undefined
  if (instance !== undefined && instance < 1) throw new Error('替换次数必须大于零')
  if (!old) return original
  if (instance === undefined) return original.split(old).join(replacement)
  let position = 0
  for (let found = 1; found <= instance; found++) {
    const index = original.indexOf(old, position)
    if (index < 0) return original
    if (found === instance) return original.slice(0, index) + replacement + original.slice(index + old.length)
    position = index + old.length
  }
  return original
}
/** 上游 4.6.1 的 T.DIST 错用了旧 TDIST 的 tails 参数；按 beta 恒等式计算 CDF/PDF。 */
function studentCdf(x: number, degrees: number): number {
  if (degrees < 1) throw new Error('自由度须大于零')
  if (x === 0) return 0.5
  if (degrees === 1) return 0.5 + Math.atan(x) / Math.PI
  const beta = normalize(F.BETA.DIST(degrees / (degrees + x * x), degrees / 2, 0.5, true)) as number
  return x > 0 ? 1 - beta / 2 : beta / 2
}
registry['T.DIST'] = args => { arity(args, 3); const x = formulaNumber(args[0]), df = Math.trunc(formulaNumber(args[1])); if (df < 1) throw new Error('自由度须大于零'); if (formulaNumber(args[2])) return studentCdf(x, df); return Math.exp((normalize(F.GAMMALN((df + 1) / 2)) as number) - (normalize(F.GAMMALN(df / 2)) as number) - Math.log(df * Math.PI) / 2 - (df + 1) * Math.log1p(x * x / df) / 2) }
registry['T.DIST.RT'] = args => { arity(args, 2); return 1 - studentCdf(formulaNumber(args[0]), Math.trunc(formulaNumber(args[1]))) }
registry['T.DIST.2T'] = args => { arity(args, 2); const x = formulaNumber(args[0]); if (x < 0) throw new Error('双尾 x 不能为负'); return 2 * (1 - studentCdf(x, Math.trunc(formulaNumber(args[1])))) }
/** 有界动态规划匹配通配符，避免把用户模式变成会指数回溯的正则。返回码点起点。 */
function wildcard(pattern: string, value: string, search = false, codeUnits = false): number {
  const needle = pattern.toLocaleLowerCase(), haystack = value.toLocaleLowerCase()
  if (!/[*?~]/.test(needle)) {
    const index = search ? haystack.indexOf(needle) : haystack === needle ? 0 : -1
    return index < 0 ? -1 : codeUnits ? index : Array.from(haystack.slice(0, index)).length
  }
  const source = codeUnits ? needle.split('') : Array.from(needle), chars = codeUnits ? haystack.split('') : Array.from(haystack), tokens: Array<{ kind: 'star' | 'any' | 'char'; char?: string }> = []
  if (source.length > 256) throw new 未支持公式('通配符模式超过计算上限')
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    tokens.push(char === '~' && i + 1 < source.length ? { kind: 'char', char: source[++i] } : char === '*' ? { kind: 'star' } : char === '?' ? { kind: 'any' } : { kind: 'char', char })
  }
  if (tokens.length * chars.length > 2000000) throw new 未支持公式('通配符文本超过计算上限')
  let previous = Array<number>(tokens.length + 1).fill(Infinity); previous[0] = 0
  for (let j = 1; j <= tokens.length && tokens[j - 1].kind === 'star'; j++) previous[j] = 0
  let best = previous[tokens.length]
  for (let i = 0; i < chars.length; i++) {
    const next = Array<number>(tokens.length + 1).fill(Infinity); next[0] = search ? i + 1 : Infinity
    for (let j = 1; j <= tokens.length; j++) {
      const token = tokens[j - 1]
      next[j] = token.kind === 'star' ? Math.min(next[j - 1], previous[j]) : token.kind === 'any' || token.char === chars[i] ? previous[j - 1] : Infinity
    }
    previous = next
    best = Math.min(best, next[tokens.length])
  }
  const result = search ? best : previous[tokens.length]
  return Number.isFinite(result) ? result : -1
}
registry.FIND = args => { arity(args, 2, 3); const needle = text(args[0]), chars = Array.from(text(args[1])), start = args.length > 2 ? Math.trunc(formulaNumber(args[2])) : 1; if (start < 1 || start > chars.length + 1) throw new Error('FIND 起点无效'); const index = chars.slice(start - 1).join('').indexOf(needle); if (index < 0) throw new Error('未找到文本'); return start + Array.from(chars.slice(start - 1).join('').slice(0, index)).length }
registry.SEARCH = args => { arity(args, 2, 3); const chars = Array.from(text(args[1])), start = args.length > 2 ? Math.trunc(formulaNumber(args[2])) : 1; if (start < 1 || start > chars.length + 1) throw new Error('SEARCH 起点无效'); const index = wildcard(text(args[0]), chars.slice(start - 1).join(''), true); if (index < 0) throw new Error('未找到文本'); return start + index }
/** Installed WPS 12.1 CalculationRule=0 black-box evidence uses UTF-16 units.
 * Keep this choice per workbook; the default Unicode-code-point mode is intact. */
export const wpsTextFunctions: Readonly<Record<string, Implementation>> = Object.freeze({
  LEN: args => { arity(args,1); return text(args[0]).length },
  LEFT: args => { arity(args,1,2); return text(args[0]).slice(0,args.length>1?positiveCount(args[1]):1) },
  RIGHT: args => { arity(args,1,2); const count=args.length>1?positiveCount(args[1]):1;return count?text(args[0]).slice(-count):'' },
  MID: args => { arity(args,3);const start=Math.trunc(formulaNumber(args[1]));if(start<1)throw new Error('MID 起点须大于零');return text(args[0]).slice(start-1,start-1+positiveCount(args[2])) },
  REPLACE: args => { arity(args,4);const value=text(args[0]),start=Math.trunc(formulaNumber(args[1]));if(start<1)throw new Error('REPLACE 起点须大于零');return value.slice(0,start-1)+text(args[3])+value.slice(start-1+positiveCount(args[2])) },
  FIND: args => { arity(args,2,3);const value=text(args[1]),start=args.length>2?Math.trunc(formulaNumber(args[2])):1;if(start<1||start>value.length+1)throw new Error('FIND 起点无效');const index=value.indexOf(text(args[0]),start-1);if(index<0)throw new Error('未找到文本');return index+1 },
  SEARCH: args => { arity(args,2,3);const value=text(args[1]),start=args.length>2?Math.trunc(formulaNumber(args[2])):1;if(start<1||start>value.length+1)throw new Error('SEARCH 起点无效');const index=wildcard(text(args[0]),value.slice(start-1),true,true);if(index<0)throw new Error('未找到文本');return start+index },
})
function round(args: FormulaValue[], mode: 'nearest' | 'up' | 'down'): number {
  arity(args, 1, 2)
  const n = formulaNumber(args[0]), digits = args.length > 1 ? Math.trunc(formulaNumber(args[1])) : 0
  if (digits > 308) return n
  if (digits < -308) return 0
  const shift = (value: number, exponent: number) => { const [mantissa, e = '0'] = String(value).split('e'); return Number(`${mantissa}e${Number(e) + exponent}`) }
  const shifted = shift(Math.abs(n), digits)
  if (!Number.isFinite(shifted)) return n
  const rounded = mode === 'nearest' ? Math.round(shifted) : mode === 'up' ? Math.ceil(shifted) : Math.floor(shifted)
  return shift(rounded, -digits) * Math.sign(n) || 0
}
registry.ROUND = args => { arity(args, 2); return round(args, 'nearest') }
registry.ROUNDUP = args => { arity(args, 2); return round(args, 'up') }
registry.ROUNDDOWN = args => { arity(args, 2); return round(args, 'down') }
registry.TRUNC = args => round(args, 'down')
registry.MROUND = args => { arity(args, 2); const n = formulaNumber(args[0]), step = formulaNumber(args[1]); if (n * step < 0) throw new Error('MROUND 参数必须同号'); return step === 0 ? 0 : Math.sign(n) * Math.round(Math.abs(n / step)) * Math.abs(step) }
for (const name of ['FACT', 'FACTDOUBLE']) registry[name] = args => { arity(args, 1); const n = Math.trunc(formulaNumber(args[0])); if (n < 0 || n > (name === 'FACT' ? 170 : 300)) throw new Error('阶乘超出有限数值范围'); let value = 1; for (let i = n; i > 1; i -= name === 'FACT' ? 1 : 2) value *= i; return value }
function combinations(n: number, k: number): number {
  if (n < 0 || k < 0 || k > n) throw new Error('组合参数无效')
  k = Math.min(k, n - k)
  if (k > 100000) throw new 未支持公式('组合计算超过本机有界计算上限')
  let result = 1
  for (let i = 1; i <= k; i++) { result *= (n - k + i) / i; if (!Number.isFinite(result)) throw new Error('组合结果超出数值范围') }
  return Math.round(result)
}
registry.COMBIN = args => { arity(args, 2); return combinations(Math.trunc(formulaNumber(args[0])), Math.trunc(formulaNumber(args[1]))) }
registry.COMBINA = args => { arity(args, 2); const n = Math.trunc(formulaNumber(args[0])), k = Math.trunc(formulaNumber(args[1])); if (n < 0 || k < 0) throw new Error('组合参数无效'); return k === 0 ? 1 : combinations(n + k - 1, k) }
const gcd = (a: number, b: number): number => { while (b) { [a, b] = [b, a % b] }; return a }
for (const name of ['GCD', 'LCM']) registry[name] = args => { arity(args, 1, 255); const values = args.flatMap(v => Array.isArray(v) ? v : [v]).map(v => { const n = Math.trunc(formulaNumber(v)); if (n < 0 || n >= 2 ** 53) throw new Error('整数超出精确范围'); return n }); return values.reduce((a, b) => { const n = name === 'GCD' ? gcd(a, b) : !a || !b ? 0 : a / gcd(a, b) * b; if (n >= 2 ** 53) throw new Error('结果超出精确范围'); return n }, name === 'GCD' ? 0 : 1) }

function vector(value: FormulaValue): FormulaScalar[] {
  const matrix = formulaMatrix(value)
  if (matrix.length > 1 && matrix[0].length > 1) throw new 未支持公式('查找向量必须是一行或一列')
  return matrix.flat()
}
const equal = (a: FormulaScalar, b: FormulaScalar) => typeof a === 'string' && typeof b === 'string' ? wildcard(a, b) >= 0 : a === b
function find(value: FormulaScalar, values: FormulaScalar[], mode: number, wildcards = true): number {
  if (mode === 0) return values.findIndex(candidate => wildcards ? equal(value, candidate) : typeof value === 'string' && typeof candidate === 'string' ? value.toLocaleLowerCase() === candidate.toLocaleLowerCase() : value === candidate)
  if (typeof value === 'boolean') throw new 未支持公式('逻辑值的近似匹配尚未支持')
  const comparable = (v: FormulaScalar) => typeof v === 'string' ? v.toLocaleLowerCase() : v as number
  const ordered = values.filter(candidate => typeof candidate === typeof value).map(comparable)
  if (ordered.some((current, i) => i > 0 && (mode === 1 ? current < ordered[i - 1] : current > ordered[i - 1]))) throw new 未支持公式('近似匹配需要按指定方向排序')
  let found = -1
  for (let i = 0; i < values.length; i++) {
    const candidate = values[i]
    if (typeof candidate !== typeof value || typeof candidate === 'boolean') continue
    if (mode === 1 ? comparable(candidate) <= comparable(value) : comparable(candidate) >= comparable(value)) found = i
    else break
  }
  return found
}
registry.MATCH = args => { arity(args, 2, 3); const mode = args.length === 3 ? formulaNumber(args[2]) : 1; if (![0, 1, -1].includes(mode)) throw new Error('MATCH 匹配类型无效'); const index = find(formulaScalar(args[0]), vector(args[1]), mode); if (index < 0) throw new Error('#N/A'); return index + 1 }
registry.INDEX = args => {
  arity(args, 2, 3)
  const matrix = formulaMatrix(args[0]); let row = Math.trunc(formulaNumber(args[1])), column = args.length === 3 ? Math.trunc(formulaNumber(args[2])) : 1
  if (args.length === 2 && matrix.length === 1) { column = row; row = 1 }
  else if (args.length === 2 && matrix[0].length > 1) throw new 未支持公式('INDEX 返回整行的数组结果尚未支持')
  if (!row || !column) throw new 未支持公式('INDEX 数组返回值尚不能展开')
  if (row < 1 || column < 1 || row > matrix.length || column > matrix[0].length) throw new Error('#REF!')
  return matrix[row - 1][column - 1]
}
function lookup(args: FormulaValue[], horizontal: boolean): FormulaValue {
  arity(args, 3, 4)
  const source = formulaMatrix(args[1]), matrix = horizontal ? source[0].map((_, c) => source.map(row => row[c])) : source
  const column = Math.trunc(formulaNumber(args[2]))
  if (column < 1 || column > matrix[0].length) throw new Error('#REF!')
  const approximate = args.length < 4 || Boolean(formulaNumber(args[3])), i = find(formulaScalar(args[0]), matrix.map(row => row[0]), approximate ? 1 : 0)
  if (i < 0) throw new Error('#N/A')
  return matrix[i][column - 1]
}
registry.VLOOKUP = args => lookup(args, false)
registry.HLOOKUP = args => lookup(args, true)
registry.XLOOKUP = args => { arity(args, 3, 4); const search = vector(args[1]), results = vector(args[2]); if (search.length !== results.length) throw new Error('查找和返回区域长度不一致'); const i = find(formulaScalar(args[0]), search, 0, false); if (i >= 0) return results[i]; if (args.length === 4) return formulaScalar(args[3]); throw new Error('#N/A') }
registry.ROWS = args => { arity(args, 1); return formulaMatrix(args[0]).length }
registry.COLUMNS = args => { arity(args, 1); return formulaMatrix(args[0])[0].length }
registry.NA = args => { arity(args, 0); throw new Error('#N/A') }

const dimensions = (value: FormulaValue) => { const m = formulaMatrix(value); return `${m.length}:${m[0].length}` }
for (const name of ['SUMIF', 'AVERAGEIF', 'COUNTIF', 'SUMIFS', 'AVERAGEIFS', 'COUNTIFS', 'MINIFS', 'MAXIFS']) {
  const fn = resolve(name)
  registry[name] = args => {
    const plural = name.endsWith('IFS'), count = name.startsWith('COUNT')
    if (!plural) arity(args, 2, count ? 2 : 3)
    else if (args.length < (count ? 2 : 3) || args.length % 2 !== (count ? 0 : 1)) throw new Error('条件函数的区域和条件不成对')
    const rangeIndices = plural ? Array.from({ length: count ? args.length / 2 : (args.length - 1) / 2 }, (_, i) => (count ? 0 : 1) + i * 2) : [0]
    if (!count && (plural || args.length === 3)) rangeIndices.push(plural ? 0 : 2)
    if (rangeIndices.some(i => dimensions(args[i]) !== dimensions(args[rangeIndices[0]]))) {
      if (!plural) throw new 未支持公式('SUMIF/AVERAGEIF 扩展求和区域的语义尚未支持')
      throw new Error('条件区域形状必须一致')
    }
    return normalize(fn(...args.map((value, i) => rangeIndices.includes(i) ? Array.isArray(value) ? [...value] : [value] : formulaScalar(value))))
  }
}
registry.SUMPRODUCT = args => {
  arity(args, 1, 255)
  if (args.some(value => dimensions(value) !== dimensions(args[0]))) throw new Error('SUMPRODUCT 区域形状必须一致')
  const arrays = args.map(value => Array.isArray(value) ? value : [value])
  return arrays[0].reduce<number>((sum, _, i) => sum + arrays.reduce((product, values) => product * (typeof values[i] === 'number' ? values[i] as number : 0), 1), 0)
}
Object.assign(registry, dateFunctions)
export const extraFormulaFunctions: Readonly<Record<string, Implementation>> = Object.freeze(registry)
export const auditedFormulaFunctionNames = Object.freeze(Object.keys(registry).sort())
