import { formulaNumber, formulaScalar, 未支持公式, type FormulaValue } from './formulaValues'

const DAY = 86400000, EPOCH = Date.UTC(1899, 11, 31), MAX = 2958465
type Parts = { year: number; month: number; day: number }
const utcSerial = (year: number, month: number, day: number) => {
  const utc = Date.UTC(year, month - 1, day)
  return (utc - EPOCH) / DAY + (utc >= Date.UTC(1900, 2, 1) ? 1 : 0)
}
function bounded(serial: number): number {
  if (!Number.isFinite(serial) || serial < 0 || serial >= MAX + 1) throw new Error('日期超出 1900 日期系统范围')
  return serial
}
/** 只读取本地日历分量再转 UTC，避免时区/DST 把 DATE 的结果偏移一天。 */
export function localDateToExcelSerial(value: Date, 日期系统1904 = false): number {
  if (!Number.isFinite(value.getTime())) throw new Error('无效日期')
  return bounded(utcSerial(value.getFullYear(), value.getMonth() + 1, value.getDate()) + (value.getHours() * 3600 + value.getMinutes() * 60 + value.getSeconds() + value.getMilliseconds() / 1000) / 86400) - (日期系统1904 ? 1462 : 0)
}
function serial(value: FormulaValue): number {
  if (typeof formulaScalar(value) === 'string' && !Number.isFinite(Number(formulaScalar(value)))) return parseDate(String(formulaScalar(value)))
  return bounded(formulaNumber(value))
}
function parts(value: FormulaValue): Parts {
  const n = Math.floor(serial(value))
  if (n === 60) return { year: 1900, month: 2, day: 29 }
  if (n === 0) return { year: 1900, month: 1, day: 0 }
  const date = new Date(EPOCH + (n > 60 ? n - 1 : n) * DAY)
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}
function date(year: number, month: number, day: number): number {
  year = Math.trunc(year); month = Math.trunc(month); day = Math.trunc(day)
  if (year < 0 || year > 9999) throw new Error('年份超出范围')
  if (year < 1900) year += 1900
  // 从规范化月份的第一天累计“Excel 天数”，保留虚构的 1900-02-29。
  const first = new Date(Date.UTC(year, month - 1, 1))
  return bounded(utcSerial(first.getUTCFullYear(), first.getUTCMonth() + 1, 1) + day - 1)
}
function monthLength(year: number, month: number): number {
  return year === 1900 && month === 2 ? 29 : new Date(Date.UTC(year, month, 0)).getUTCDate()
}
function parseDate(text: string): number {
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(text.trim())
  if (!match) throw new 未支持公式('日期文本仅支持明确的 yyyy-mm-dd 或 yyyy/mm/dd')
  const [y, m, d] = match.slice(1).map(Number)
  if (y < 1900 || y > 9999 || m < 1 || m > 12 || d < 1 || d > monthLength(y, m)) throw new Error('无效日期文本')
  return date(y, m, d)
}
function weekday(value: FormulaValue, type = 1): number {
  const sunday = (Math.floor(serial(value)) + 6) % 7 + 1
  if (type === 1) return sunday
  if (type === 2) return (sunday + 5) % 7 + 1
  if (type === 3) return (sunday + 5) % 7
  if (type >= 11 && type <= 17) return (sunday - (type === 17 ? 1 : type - 9) + 7) % 7 + 1
  throw new Error('WEEKDAY 的返回类型无效')
}
function isoWeek(value: FormulaValue): number {
  const n = Math.floor(serial(value)), y = parts(value).year
  const weekOne = (year: number) => { const fourth = utcSerial(year, 1, 4); return fourth - weekday(fourth, 2) + 1 }
  const start = weekOne(y)
  if (n < start) return Math.floor((n - weekOne(y - 1)) / 7) + 1
  if (y < 9999 && n >= weekOne(y + 1)) return 1
  return Math.floor((n - start) / 7) + 1
}
function shifted(value: FormulaValue, months: FormulaValue, end: boolean): number {
  const p = parts(value), offset = Math.trunc(formulaNumber(months))
  if (Math.abs(offset) > 120000) throw new Error('月份偏移超出范围')
  const first = new Date(Date.UTC(p.year, p.month - 1 + offset, 1)), y = first.getUTCFullYear(), m = first.getUTCMonth() + 1
  if (y < 1900 || y > 9999) throw new Error('日期超出范围')
  return date(y, m, end ? monthLength(y, m) : Math.min(Math.max(1, p.day), monthLength(y, m)))
}
function weekend(value: FormulaValue = 1): Set<number> {
  const scalar = formulaScalar(value)
  if (typeof scalar === 'string' && /^[01]{7}$/.test(scalar)) {
    if (scalar === '1111111') throw new Error('周末不能覆盖全部七天')
    return new Set(Array.from(scalar).flatMap((flag, i) => flag === '1' ? [i === 6 ? 1 : i + 2] : []))
  }
  const n = formulaNumber(value)
  if (n >= 1 && n <= 7 && Number.isInteger(n)) return new Set([n === 1 ? 7 : n - 1, n === 1 ? 1 : n])
  if (n >= 11 && n <= 17 && Number.isInteger(n)) return new Set([n === 11 ? 1 : n - 10])
  throw new Error('无效的周末设置')
}
function holidays(value: FormulaValue = []): Set<number> {
  return new Set((Array.isArray(value) ? value : [value]).filter(v => v !== '').map(v => Math.floor(serial(v))))
}
function networkDays(args: FormulaValue[], intl: boolean): number {
  let start = Math.floor(serial(args[0])), end = Math.floor(serial(args[1])), sign = 1
  if (start > end) { [start, end] = [end, start]; sign = -1 }
  if (end - start > 100000) throw new 未支持公式('工作日区域超过计算上限')
  const off = weekend(intl ? args[2] ?? 1 : 1), leave = holidays(args[intl ? 3 : 2])
  let result = 0
  for (let d = start; d <= end; d++) if (!off.has(weekday(d)) && !leave.has(d)) result++
  return result * sign
}
function workday(args: FormulaValue[], intl: boolean): number {
  let current = Math.floor(serial(args[0])), remaining = Math.abs(Math.trunc(formulaNumber(args[1])))
  const direction = formulaNumber(args[1]) < 0 ? -1 : 1, off = weekend(intl ? args[2] ?? 1 : 1), leave = holidays(args[intl ? 3 : 2])
  if (remaining > 100000) throw new 未支持公式('工作日偏移超过计算上限')
  while (remaining) { current = bounded(current + direction); if (!off.has(weekday(current)) && !leave.has(current)) remaining-- }
  return current
}
const requireArgs = (args: FormulaValue[], min: number, max = min) => { if (args.length < min || args.length > max) throw new Error('日期函数参数个数不正确') }
const seconds = (value: FormulaValue) => Math.floor((serial(value) % 1) * 86400 + 1e-5) % 86400

export const dateFunctions: Record<string, (args: FormulaValue[]) => FormulaValue> = {
  DATE: a => { requireArgs(a, 3); return date(...a.map(formulaNumber) as [number, number, number]) },
  DATEVALUE: a => { requireArgs(a, 1); return parseDate(String(formulaScalar(a[0]))) },
  YEAR: a => { requireArgs(a, 1); return parts(a[0]).year }, MONTH: a => { requireArgs(a, 1); return parts(a[0]).month }, DAY: a => { requireArgs(a, 1); return parts(a[0]).day },
  DAYS: a => { requireArgs(a, 2); return Math.floor(serial(a[0])) - Math.floor(serial(a[1])) },
  EDATE: a => { requireArgs(a, 2); return shifted(a[0], a[1], false) }, EOMONTH: a => { requireArgs(a, 2); return shifted(a[0], a[1], true) },
  TIME: a => { requireArgs(a, 3); const v = a.map(formulaNumber).map(Math.trunc); if (v.some(n => n < 0 || n > 32767)) throw new Error('时间参数超出范围'); return (v[0] * 3600 + v[1] * 60 + v[2]) % 86400 / 86400 },
  TIMEVALUE: a => { requireArgs(a, 1); const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i.exec(String(formulaScalar(a[0])).trim()); if (!match) throw new 未支持公式('时间文本格式尚未支持'); let h = Number(match[1]); const m = Number(match[2]), s = Number(match[3] ?? 0); if (m > 59 || s > 59 || h > 23 || (match[4] && (h < 1 || h > 12))) throw new Error('时间无效'); if (match[4]) h = h % 12 + (match[4].toUpperCase() === 'PM' ? 12 : 0); return (h * 3600 + m * 60 + s) / 86400 },
  HOUR: a => { requireArgs(a, 1); return Math.floor(seconds(a[0]) / 3600) }, MINUTE: a => { requireArgs(a, 1); return Math.floor(seconds(a[0]) / 60) % 60 }, SECOND: a => { requireArgs(a, 1); return seconds(a[0]) % 60 },
  WEEKDAY: a => { requireArgs(a, 1, 2); return weekday(a[0], a.length === 2 ? formulaNumber(a[1]) : 1) },
  ISOWEEKNUM: a => { requireArgs(a, 1); return isoWeek(a[0]) },
  WEEKNUM: a => { requireArgs(a, 1, 2); const type = a.length === 2 ? formulaNumber(a[1]) : 1; if (type === 21) return isoWeek(a[0]); if (type !== 1 && type !== 2 && !(type >= 11 && type <= 17)) throw new Error('WEEKNUM 返回类型无效'); const n = Math.floor(serial(a[0])), first = utcSerial(parts(a[0]).year, 1, 1); return Math.floor((n - first + weekday(first, type === 1 ? 1 : type === 2 ? 2 : type) - 1) / 7) + 1 },
  NETWORKDAYS: a => { requireArgs(a, 2, 3); return networkDays(a, false) }, 'NETWORKDAYS.INTL': a => { requireArgs(a, 2, 4); return networkDays(a, true) },
  WORKDAY: a => { requireArgs(a, 2, 3); return workday(a, false) }, 'WORKDAY.INTL': a => { requireArgs(a, 2, 4); return workday(a, true) },
}

/** 参数角色来自日期函数签名；只转换序列日期，年月/偏移/周末/时间分数保持原单位。 */
const serialDateArguments: Record<string, number[]> = {
  YEAR: [0], MONTH: [0], DAY: [0], DAYS: [0, 1], EDATE: [0], EOMONTH: [0],
  HOUR: [0], MINUTE: [0], SECOND: [0], WEEKDAY: [0], WEEKNUM: [0], ISOWEEKNUM: [0],
  NETWORKDAYS: [0, 1], 'NETWORKDAYS.INTL': [0, 1], WORKDAY: [0], 'WORKDAY.INTL': [0],
}
const serialDateReturns = new Set(['DATE', 'DATEVALUE', 'EDATE', 'EOMONTH', 'WORKDAY', 'WORKDAY.INTL'])
function shiftDateInput(value: FormulaValue, keepBlank = false): FormulaValue {
  if (Array.isArray(value)) return value.map(item => shiftDateInput(item, keepBlank) as number | string | boolean)
  if (keepBlank && value === '') return value
  // 日期文本由统一明确格式解析器处理；数值和可转换的数值文本才是序列日期。
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string' && Number.isFinite(Number(value))) return formulaNumber(value) + 1462
  return value
}
export const dateFunctions1904: Readonly<Record<string, (args: FormulaValue[]) => FormulaValue>> = Object.freeze(Object.fromEntries(Object.entries(dateFunctions).map(([name, implementation]) => [name, (args: FormulaValue[]) => {
  const mapped = args.map((value, index) => serialDateArguments[name]?.includes(index) ? shiftDateInput(value) : value)
  const holidayIndex = name === 'NETWORKDAYS' || name === 'WORKDAY' ? 2 : name === 'NETWORKDAYS.INTL' || name === 'WORKDAY.INTL' ? 3 : -1
  if (holidayIndex >= 0 && mapped[holidayIndex] !== undefined) mapped[holidayIndex] = shiftDateInput(mapped[holidayIndex], true)
  const result = implementation(mapped)
  return serialDateReturns.has(name) ? formulaNumber(result) - 1462 : result
}])))
