/** 区域仍是按行展平的一维数组；形状仅存在 WeakMap，不进入保存、导出或普通聚合参数。 */
export type FormulaScalar = number | string | boolean
export type FormulaValue = FormulaScalar | FormulaScalar[]
export class 未支持公式 extends Error {}
export class 公式错误 extends Error {
  constructor(public readonly 代码: string) { super(代码) }
}
export const 最大数组单元格 = 100000
class ArrayCellError extends String {}
/** Tagged internal error. Literal text such as "#N/A" must remain ordinary text. */
export const arrayCellError = (code: string): FormulaScalar => new ArrayCellError(code) as unknown as string
export const isFormulaErrorCode = (value: FormulaScalar): boolean => (value as unknown) instanceof ArrayCellError

const matrices = new WeakMap<FormulaScalar[], FormulaScalar[][]>()
export function markFormulaRange(values: FormulaScalar[], columns: number): FormulaScalar[] {
  matrices.set(values, Array.from({ length: values.length / columns }, (_, row) => values.slice(row * columns, (row + 1) * columns)))
  return values
}
const references = new WeakMap<FormulaScalar[], boolean>()
export function markReferenceRange(values: FormulaScalar[], columns: number, preserveBlank = false): FormulaScalar[] {
  references.set(values, preserveBlank)
  return markFormulaRange(values, columns)
}
export function formulaArray(matrix: FormulaScalar[][]): FormulaScalar[] {
  if (!matrix.length || !matrix[0]?.length) throw new 公式错误('#CALC!')
  if (matrix.length * matrix[0].length > 最大数组单元格) throw new 未支持公式('数组超过安全计算上限')
  if (matrix.some(row => row.length !== matrix[0].length)) throw new 公式错误('#VALUE!')
  return markFormulaRange(matrix.flat(), matrix[0].length)
}
/** A genuinely empty referenced cell displays as zero in a spilled range; literal empty strings remain strings. */
export function spillMatrix(value: FormulaValue): FormulaScalar[][] {
  const matrix = formulaMatrix(value)
  return Array.isArray(value) && references.get(value) === false ? matrix.map(row => row.map(cell => cell === '' ? 0 : cell)) : matrix
}
export function arrayBroadcast(values: FormulaValue[], operation: (cells: FormulaScalar[]) => FormulaScalar, selectErrors = false): FormulaValue {
  if (!values.some(Array.isArray)) return operation(values as FormulaScalar[])
  const matrices = values.map(formulaMatrix)
  const rows = Math.max(...matrices.map(matrix => matrix.length)), columns = Math.max(...matrices.map(matrix => matrix[0].length))
  if (matrices.some(matrix => ![1, rows].includes(matrix.length) || ![1, columns].includes(matrix[0].length))) throw new 公式错误('#VALUE!')
  if (rows * columns > 最大数组单元格) throw new 未支持公式('数组超过安全计算上限')
  return formulaArray(Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => {
    const cells = matrices.map(matrix => matrix[row % matrix.length][column % matrix[0].length])
    if (!selectErrors) { const error = cells.find(isFormulaErrorCode); if (error) return error }
    try { const value = operation(cells); return typeof value === 'number' && !Number.isFinite(value) ? arrayCellError('#NUM!') : value }
    catch (error) {
      if (error instanceof 未支持公式) throw error
      return arrayCellError(error instanceof 公式错误 ? error.代码 : error instanceof Error && error.message === '除数为零' ? '#DIV/0!' : error instanceof Error && /^#(?:N\/A|NUM!|VALUE!|REF!|DIV\/0!)$/.test(error.message) ? error.message : '#VALUE!')
    }
  })))
}
export function formulaMatrix(value: FormulaValue): FormulaScalar[][] {
  return Array.isArray(value) ? matrices.get(value) ?? [value] : [[value]]
}
export function formulaScalar(value: FormulaValue): FormulaScalar {
  if (Array.isArray(value)) {
    if (value.length !== 1) throw new 未支持公式('该函数的数组结果尚不能展开')
    return value[0]
  }
  return value
}
export function formulaNumber(value: FormulaValue): number {
  const scalar = formulaScalar(value), number = typeof scalar === 'boolean' ? Number(scalar) : Number(scalar)
  if (!Number.isFinite(number)) throw new Error('参数不是有限数值')
  return number
}
