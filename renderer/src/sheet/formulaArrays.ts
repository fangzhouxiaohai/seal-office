import { arrayCellError, formulaArray, formulaMatrix, formulaNumber, formulaScalar, spillMatrix, isFormulaErrorCode, 最大数组单元格, 未支持公式, 公式错误, type FormulaScalar, type FormulaValue } from './formulaValues'

type Argument = FormulaValue | undefined
type Implementation = (args: Argument[]) => FormulaValue
const fail = (code = '#VALUE!'): never => { throw new 公式错误(code) }
const integer = (value: Argument, fallback?: number): number => {
  if (value === undefined) { if (fallback !== undefined) return fallback; return fail() }
  const result = formulaNumber(value)
  if (!Number.isFinite(result)) return fail()
  return Math.trunc(result)
}
const bool = (value: Argument, fallback = false): boolean => {
  if (value === undefined) return fallback
  const scalar = formulaScalar(value)
  if (isFormulaErrorCode(scalar)) throw new 公式错误(String(scalar))
  if (typeof scalar === 'boolean') return scalar
  if (typeof scalar === 'number') return scalar !== 0
  if (/^(true|false)$/i.test(scalar)) return scalar.toLowerCase() === 'true'
  if (scalar === '') return false
  return fail()
}
const required = (value: Argument): FormulaValue => value === undefined ? fail() : value
const arity = (args: Argument[], min: number, max = min): void => { if (args.length < min || args.length > max) fail() }
const transpose = (matrix: FormulaScalar[][]) => matrix[0].map((_, column) => matrix.map(row => row[column]))
const equal = (a: FormulaScalar, b: FormulaScalar) => typeof a === typeof b && (typeof a === 'string' ? a.toLocaleLowerCase() === String(b).toLocaleLowerCase() : a === b)
const compare = (a: FormulaScalar, b: FormulaScalar): number => {
  if (equal(a, b)) return 0
  if (a === '') return 1
  if (b === '') return -1
  const rank = (value: FormulaScalar) => typeof value === 'number' ? 0 : typeof value === 'string' ? 1 : 2
  if (rank(a) !== rank(b)) return rank(a) - rank(b)
  if (typeof a === 'string' && typeof b === 'string') return a.toLocaleLowerCase() < b.toLocaleLowerCase() ? -1 : 1
  return a < b ? -1 : 1
}
const sortRows = (rows: FormulaScalar[][], keys: Array<{ values: FormulaScalar[]; order: number }>) => rows.map((row, index) => ({ row, index })).sort((a, b) => {
  for (const key of keys) { const result = compare(key.values[a.index], key.values[b.index]); if (result) return result * key.order }
  return a.index - b.index
}).map(item => item.row)

/** Explicit, bounded implementations. No environment, volatile functions, code evaluation or arbitrary library exports. */
export const dynamicArrayFunctions: Record<string, Implementation> = {
  INDEX(args) {
    arity(args, 2, 3)
    const source = spillMatrix(required(args[0])), row = integer(args[1]), column = args[2] === undefined ? undefined : integer(args[2])
    if (row < 0 || column !== undefined && column < 0) return fail('#VALUE!')
    if (args[2] === undefined && source.length === 1) { if (!row || !source[0][row - 1] && source[0][row - 1] !== 0 && source[0][row - 1] !== false && source[0][row - 1] !== '') return fail('#REF!'); return source[0][row - 1] }
    if (row > source.length || column !== undefined && column > source[0].length) return fail('#REF!')
    if (row === 0) return formulaArray(column === undefined || column === 0 ? source : source.map(values => [values[column - 1]]))
    if (column === 0 || column === undefined && source[0].length > 1) return formulaArray([source[row - 1]])
    return source[row - 1][(column ?? 1) - 1]
  },
  XLOOKUP(args) {
    arity(args, 3, 6)
    const lookup = formulaScalar(required(args[0])), keys = formulaMatrix(required(args[1])), source = spillMatrix(required(args[2]))
    const vertical = keys[0].length === 1, mode = integer(args[4], 0), search = integer(args[5], 1)
    if (!vertical && keys.length !== 1) return fail()
    if (![0, 1, -1].includes(mode) || ![1, -1].includes(search)) throw new 未支持公式('XLOOKUP 通配符/二分搜索尚不能计算')
    const vector = vertical ? keys.map(row => row[0]) : keys[0]
    if (vertical ? source.length !== vector.length : source[0].length !== vector.length) return fail()
    const indexes = vector.map((_, index) => index); if (search === -1) indexes.reverse()
    let index = indexes.find(index => equal(vector[index], lookup))
    if (index === undefined && mode) {
      for (const candidate of indexes) {
        const order = compare(vector[candidate], lookup)
        if (mode === -1 ? order <= 0 : order >= 0) {
          if (index === undefined || (mode === -1 ? compare(vector[candidate], vector[index]) > 0 : compare(vector[candidate], vector[index]) < 0)) index = candidate
        }
      }
    }
    if (index === undefined) return args[3] === undefined ? fail('#N/A') : args[3]
    const result = vertical ? [source[index]] : source.map(row => [row[index!]])
    return result.length === 1 && result[0].length === 1 ? result[0][0] : formulaArray(result)
  },
  SEQUENCE(args) {
    arity(args, 1, 4)
    const rows = integer(args[0], 1), columns = integer(args[1], 1), start = args[2] === undefined ? 1 : formulaNumber(args[2]), step = args[3] === undefined ? 1 : formulaNumber(args[3])
    if (rows < 1 || columns < 1) return fail('#CALC!')
    if (rows * columns > 最大数组单元格) throw new 未支持公式('SEQUENCE 超过安全计算上限')
    const last = start + (rows * columns - 1) * step
    if (!Number.isFinite(last)) return fail('#NUM!')
    return formulaArray(Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => start + (row * columns + column) * step)))
  },
  FILTER(args) {
    arity(args, 2, 3)
    const source = spillMatrix(required(args[0])), include = formulaMatrix(required(args[1]))
    const vertical = include.length === source.length && include[0].length === 1
    const horizontal = include.length === 1 && include[0].length === source[0].length
    if (!vertical && !horizontal) return fail()
    const sourceRows = vertical ? source : transpose(source), mask = vertical ? include.map(row => row[0]) : include[0]
    const result = sourceRows.filter((_, index) => bool(mask[index]))
    if (!result.length) return args[2] === undefined ? fail('#CALC!') : formulaArray(spillMatrix(args[2]))
    return formulaArray(vertical ? result : transpose(result))
  },
  SORT(args) {
    arity(args, 1, 4)
    const source = spillMatrix(required(args[0])), byColumn = bool(args[3]), matrix = byColumn ? transpose(source) : source
    const sortIndex = integer(args[1], 1), order = integer(args[2], 1)
    if (sortIndex < 1 || sortIndex > matrix[0].length || ![1, -1].includes(order)) return fail()
    const sorted = sortRows(matrix, [{ values: matrix.map(row => row[sortIndex - 1]), order }])
    return formulaArray(byColumn ? transpose(sorted) : sorted)
  },
  SORTBY(args) {
    if (args.length < 2 || args.length > 33) return fail()
    const source = spillMatrix(required(args[0])), first = formulaMatrix(required(args[1]))
    const vertical = first.length === source.length && first[0].length === 1
    const horizontal = first.length === 1 && first[0].length === source[0].length
    if (!vertical && !horizontal) return fail()
    const matrix = vertical ? source : transpose(source), keys = []
    for (let index = 1; index < args.length; index += 2) {
      const key = formulaMatrix(required(args[index])), order = integer(args[index + 1], 1)
      if (![1, -1].includes(order) || (vertical ? key.length !== matrix.length || key[0].length !== 1 : key.length !== 1 || key[0].length !== matrix.length)) return fail()
      keys.push({ values: vertical ? key.map(row => row[0]) : key[0], order })
    }
    const sorted = sortRows(matrix, keys)
    return formulaArray(vertical ? sorted : transpose(sorted))
  },
  UNIQUE(args) {
    arity(args, 1, 3)
    const source = spillMatrix(required(args[0])), byColumn = bool(args[1]), exactlyOnce = bool(args[2]), matrix = byColumn ? transpose(source) : source
    const groups = new Map<string, { row: FormulaScalar[]; count: number }>()
    for (const row of matrix) {
      const key = JSON.stringify(row.map(cell => [typeof cell, typeof cell === 'string' ? cell.toLocaleLowerCase() : cell]))
      const current = groups.get(key)
      if (current) current.count++
      else groups.set(key, { row, count: 1 })
    }
    const result = [...groups.values()].filter(group => !exactlyOnce || group.count === 1).map(group => group.row)
    if (!result.length) return fail('#CALC!')
    return formulaArray(byColumn ? transpose(result) : result)
  },
  TRANSPOSE(args) { arity(args, 1); return formulaArray(transpose(spillMatrix(required(args[0])))) },
  TAKE(args) { return takeDrop(args, false) },
  DROP(args) { return takeDrop(args, true) },
  CHOOSECOLS(args) { return choose(args, false) },
  CHOOSEROWS(args) { return choose(args, true) },
  HSTACK(args) { return stack(args, false) },
  VSTACK(args) { return stack(args, true) },
  TOCOL(args) { return toVector(args, false) },
  TOROW(args) { return toVector(args, true) },
  EXPAND(args) {
    arity(args, 2, 4)
    const source = spillMatrix(required(args[0])), rows = integer(args[1], source.length), columns = integer(args[2], source[0].length)
    if (rows < source.length || columns < source[0].length) return fail()
    if (rows * columns > 最大数组单元格) throw new 未支持公式('EXPAND 超过安全计算上限')
    const padding = args[3] === undefined ? arrayCellError('#N/A') : formulaScalar(args[3])
    return formulaArray(Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => source[row]?.[column] ?? padding)))
  },
  WRAPROWS(args) { return wrap(args, false) },
  WRAPCOLS(args) { return wrap(args, true) },
}
function takeDrop(args: Argument[], drop: boolean): FormulaValue {
  arity(args, 2, 3)
  const source = spillMatrix(required(args[0])), rows = integer(args[1], source.length), columns = integer(args[2], source[0].length)
  if (rows === 0 || columns === 0) return fail('#CALC!')
  const select = <T,>(values: T[], count: number) => drop ? count > 0 ? values.slice(count) : values.slice(0, count) : count > 0 ? values.slice(0, count) : values.slice(Math.max(0, values.length + count))
  return formulaArray(select(source, rows).map(row => args[2] === undefined ? row : select(row, columns)))
}
function choose(args: Argument[], rows: boolean): FormulaValue {
  if (args.length < 2 || args.length > 256) return fail()
  const source = spillMatrix(required(args[0])), matrix = rows ? source : transpose(source)
  const indexes = args.slice(1).flatMap(argument => formulaMatrix(required(argument)).flat()).map(value => integer(value))
  return formulaArray((rows ? (value: FormulaScalar[][]) => value : transpose)(indexes.map(index => { const row = matrix[index > 0 ? index - 1 : matrix.length + index]; if (!index || !row) return fail(); return row })))
}
function stack(args: Argument[], vertical: boolean): FormulaValue {
  if (!args.length || args.length > 256) return fail()
  const matrices = args.map(argument => spillMatrix(required(argument))).map(matrix => vertical ? matrix : transpose(matrix))
  const width = Math.max(...matrices.map(matrix => matrix[0].length)), height = matrices.reduce((sum, matrix) => sum + matrix.length, 0)
  if (width * height > 最大数组单元格) throw new 未支持公式('堆叠数组超过安全计算上限')
  const result = matrices.flatMap(matrix => matrix.map(row => Array.from({ length: width }, (_, column) => row[column] ?? arrayCellError('#N/A'))))
  return formulaArray(vertical ? result : transpose(result))
}
function toVector(args: Argument[], horizontal: boolean): FormulaValue {
  arity(args, 1, 3)
  const ignore = integer(args[1], 0), source = ignore === 1 || ignore === 3 ? formulaMatrix(required(args[0])) : spillMatrix(required(args[0])), byColumn = bool(args[2])
  if (ignore < 0 || ignore > 3) return fail()
  const values = (byColumn ? transpose(source) : source).flat().filter(value => (!(ignore & 1) || value !== '') && (!(ignore & 2) || !isFormulaErrorCode(value)))
  return formulaArray(horizontal ? [values] : values.map(value => [value]))
}
function wrap(args: Argument[], columns: boolean): FormulaValue {
  arity(args, 2, 3)
  const source = spillMatrix(required(args[0])), count = integer(args[1])
  if (source.length !== 1 && source[0].length !== 1 || count < 1) return fail()
  const values = source.flat(), length = Math.ceil(values.length / count), padding = args[2] === undefined ? arrayCellError('#N/A') : formulaScalar(args[2])
  if (length * count > 最大数组单元格) throw new 未支持公式('换行数组超过安全计算上限')
  const matrix = Array.from({ length }, (_, row) => Array.from({ length: count }, (_, column) => values[row * count + column] ?? padding))
  return formulaArray(columns ? transpose(matrix) : matrix)
}

/** Only functions whose documented arguments are scalar are lifted over arrays. Aggregates/lookups remain explicit. */
export const liftedArrayFunctions = new Set(`ABS ACOS ACOSH ACOT ACOTH ASIN ASINH ATAN ATANH CEILING CEILING.MATH CEILING.PRECISE CHAR CLEAN CODE COS COSH COT COTH CSC CSCH DATE DATEVALUE DAY DAYS EDATE EOMONTH EVEN EXACT EXP EXPON.DIST FACT FACTDOUBLE FIND FIXED FLOOR FLOOR.MATH FLOOR.PRECISE HOUR INT ISNUMBER ISTEXT ISOWEEKNUM LEFT LEN LN LOG LOG10 LOWER MID MINUTE MOD MONTH MROUND ODD POWER PROPER REPLACE REPT RIGHT ROUND ROUNDDOWN ROUNDUP SEARCH SECOND SIGN SIN SINH SQRT SUBSTITUTE T TEXT TIME TIMEVALUE TRIM TRUNC UNICHAR UNICODE UPPER VALUE WEEKDAY WEEKNUM YEAR`.split(' '))
