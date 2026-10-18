import type { CellFormat, Sheet, SheetCell } from './model'
import { 求值公式, 读取公式布尔结果, 未支持公式 } from './formula'
import { arrayCellError, isFormulaErrorCode, 公式错误, 最大数组单元格, type FormulaScalar } from './formulaValues'
import { 生成地址, 解析地址 } from './address'

type Format = (raw: string, format: CellFormat, date1904?: boolean) => string
type Result = { value: number | string; status?: SheetCell['公式状态']; matrix?: FormulaScalar[][]; error?: boolean; spillError?: string; boolean?: boolean; arrayError?: boolean }
// Discovering an owner of a blank cell is speculative: an unrelated candidate may
// depend on the formula currently asking for that blank. Retry that candidate
// later instead of caching the temporary recursion as a real circular reference.
class DeferredDiscovery extends Error {}
const normalized = (value: FormulaScalar): number | string => isFormulaErrorCode(value) ? String(value) : typeof value === 'boolean' ? value ? 'TRUE' : 'FALSE' : value
const empty = (cell?: SheetCell) => !cell || cell.原始值 === '' && !cell.值类型
const bounds = (range: string) => {
  const [first, last = first] = range.split(':').map(解析地址)
  if (!first || !last || first.行 > last.行 || first.列 > last.列 || last.行 >= 1048576 || last.列 >= 16384) return null
  const rows = last.行 - first.行 + 1, columns = last.列 - first.列 + 1
  return { first, last, rows, columns }
}
const dimensions = (range: string) => { const result = bounds(range); return result && result.rows * result.columns <= 最大数组单元格 ? result : null }
const sourceValue = (cell?: SheetCell): FormulaScalar => {
  if (!cell) return 0
  if (cell.计算错误) return arrayCellError(String(cell.计算值 ?? cell.显示值))
  if (cell.布尔结果 !== undefined) return cell.布尔结果
  if (cell.计算值 !== undefined) return cell.计算值
  const raw = cell.原始值 || cell.显示值
  return cell.值类型 !== '文本' && raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw === '' ? 0 : raw
}

/** A workbook-wide pure solver. Derived spill cells are removed before evaluation and never become blockers. */
export function 计算溢出工作簿(workbook: readonly Sheet[], format: Format): Sheet[] {
  const sources = workbook.map(sheet => {
    const cells: Record<string, SheetCell> = {}
    for (const [address, cell] of Object.entries(sheet.单元格)) {
      if (!cell.溢出锚点) { cells[address] = cell; continue }
      // Keep independent formatting/comments/validation even after an array shrinks or disappears.
      const { 溢出锚点: _owner, 计算值: _value, 计算错误: _error, 布尔结果: _boolean, 公式状态: _status, 值类型: _type, 公式来源: _origin, ...base } = cell
      if (Object.keys(base.格式).length || base.批注 || base.数据验证 || base.超链接) cells[address] = { ...base, 原始值: '', 显示值: '' }
    }
    return { ...sheet, 单元格: cells }
  })
  const originals = new Map(workbook.map(sheet => [sheet.id, sheet]))
  const cache = new Map<string, Result>(), visiting = new Set<string>(), owners = new Map<string, string>()
  const derived = new Map<string, Result>(), reads = new Map<string, Set<string>>()
  const candidates = sources.flatMap(sheet => Object.entries(sheet.单元格).filter(([, cell]) => cell.值类型 !== '文本' && cell.原始值.startsWith('=') && (cell.公式来源?.动态数组 || /[:#{]|\b(?:SEQUENCE|FILTER|SORT|SORTBY|UNIQUE|TRANSPOSE|TAKE|DROP|CHOOSECOLS|CHOOSEROWS|HSTACK|VSTACK|TOCOL|TOROW|EXPAND|WRAPROWS|WRAPCOLS|ANCHORARRAY)\s*\(/i.test(cell.原始值))).map(([address]) => ({ sheet, address })))
  let operations = 0, discoveryDepth = 0
  const key = (sheet: Sheet, address: string) => `${sheet.id}!${address}`
  const resolveSheet = (sheet: Sheet, name?: string) => {
    if (name === undefined) return sheet
    const target = sources.find(item => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())
    if (!target) throw new 公式错误('#REF!')
    return target
  }
  const discover = (sheet: Sheet, address: string) => {
    const targetKey = key(sheet, address)
    for (const candidate of candidates) {
      if (++operations > 1000000) throw new 未支持公式('工作簿候选数组扫描超过安全上限')
      if (candidate.sheet.id !== sheet.id || cache.has(key(sheet, candidate.address)) || visiting.has(key(sheet, candidate.address))) continue
      discoveryDepth++
      try { evaluate(candidate.sheet, candidate.address) }
      catch (error) { if (!(error instanceof DeferredDiscovery)) throw error }
      finally { discoveryDepth-- }
      if (owners.has(targetKey)) return
    }
  }
  const evaluate = (sheet: Sheet, address: string): Result => {
    if (++operations > 1000000) throw new 未支持公式('工作簿依赖计算超过安全上限')
    const id = key(sheet, address)
    if (cache.has(id)) return cache.get(id)!
    if (derived.has(id)) return derived.get(id)!
    if (visiting.has(id)) throw new DeferredDiscovery('存在循环引用')
    let cell = sheet.单元格[address]
    if (empty(cell)) {
      discover(sheet, address)
      if (derived.has(id)) return derived.get(id)!
      cell = sheet.单元格[address]
    }
    if (!cell) return { value: '' }
    if (cell.值类型 === '文本' || !cell.原始值.startsWith('=')) return { value: cell.原始值 === '' ? '' : normalized(sourceValue(cell)) }
    visiting.add(id); reads.set(id, new Set())
    let dependencyCache = false, dependencyPending = false, deferred = false
    const source = cell.公式来源?.原始值 === cell.原始值 ? cell.公式来源 : undefined
    const evaluateDependency = (target: Sheet, reference: string) => {
      try { return evaluate(target, reference) }
      catch (error) { if (discoveryDepth && error instanceof DeferredDiscovery) deferred = true; throw error }
    }
    const read = (reference: string, name?: string): FormulaScalar => {
      const target = resolveSheet(sheet, name), targetId = key(target, reference)
      reads.get(id)!.add(targetId)
      const result = evaluateDependency(target, reference)
      if (result.status) dependencyCache = true
      if (result.status === '待计算') dependencyPending = true
      if (result.error || result.status === '待计算') throw new 公式错误(String(result.value))
      return result.boolean ?? result.value
    }
    let evaluation
    try {
      evaluation = source?.数组范围 && !source.动态数组 ? { 值: '#错误', 错误: true, 未支持: true } : 求值公式(cell.原始值, read, new Set(), address, {
        日期系统1904: sheet.日期系统1904 === true,
        公式兼容模式: sheet.公式兼容模式,
        取溢出: (reference, name) => {
          const target = resolveSheet(sheet, name), result = evaluateDependency(target, reference)
          reads.get(id)!.add(key(target, reference))
          if (result.status) dependencyCache = true
          if (!result.matrix || result.spillError) throw new 公式错误(result.spillError ? '#SPILL!' : '#REF!')
          return result.matrix
        },
      })
    } finally { visiting.delete(id) }
    if (deferred) { reads.delete(id); throw new DeferredDiscovery('候选数组依赖尚未完成') }
    let result: Result = { value: evaluation.值, error: evaluation.错误, matrix: evaluation.数组?.map((row, r) => row.map((cell, c) => evaluation.数组错误?.[r]?.[c] ? arrayCellError(String(cell)) : cell)), boolean: 读取公式布尔结果(evaluation) }
    if (evaluation.未支持) {
      if (source?.结果 !== undefined) {
        result = { value: typeof source.结果 === 'object' ? source.结果.error : normalized(source.结果), status: '来源缓存', error: typeof source.结果 === 'object', ...(typeof source.结果 === 'boolean' ? { boolean: source.结果 } : {}) }
        if (source.动态数组 && source.数组范围) {
          const range = dimensions(source.数组范围), original = originals.get(sheet.id)!
          if (range) result.matrix = Array.from({ length: range.rows }, (_, row) => Array.from({ length: range.columns }, (_, column) => {
            if (row === 0 && column === 0) return typeof source.结果 === 'object' ? arrayCellError(source.结果.error) : source.结果!
            const address = 生成地址(range.first.行 + row, range.first.列 + column), cached = source.数组缓存?.[address], old = original.单元格[address]
            const hasCachedValue = old && (old.原始值 !== '' || old.计算值 !== undefined || old.布尔结果 !== undefined || old.值类型 === '文本')
            return cached !== undefined ? typeof cached === 'object' ? arrayCellError(cached.error) : cached : hasCachedValue ? sourceValue(old) : arrayCellError('#待计算')
          }))
        }
      } else result = { value: '#待计算', status: '待计算', error: true }
    } else if (dependencyPending && evaluation.错误) result = { value: '#待计算', status: '待计算', error: true }
    else if (dependencyCache) result.status = '依赖缓存'
    if (result.error && !result.status && /\b(?:SEQUENCE|FILTER|SORT|SORTBY|UNIQUE|TRANSPOSE|TAKE|DROP|CHOOSECOLS|CHOOSEROWS|HSTACK|VSTACK|TOCOL|TOROW|EXPAND|WRAPROWS|WRAPCOLS)\s*\(/i.test(cell.原始值)) result.arrayError = true
    if (result.matrix) {
      const origin = 解析地址(address)!, matrix = result.matrix, rows = matrix.length, columns = matrix[0].length
      const rowEnd = origin.行 + rows, columnEnd = origin.列 + columns
      let spillError = rowEnd > 1048576 || columnEnd > 16384 ? '结果超出工作表边界' : Math.max(sheet.行数, rowEnd) * Math.max(sheet.列数, columnEnd) > 最大数组单元格 ? '展开区域超过本机安全显示上限' : ''
      if (!spillError) for (const range of sheet.合并区域) {
        const merge = bounds(range)
        if (merge && origin.行 <= merge.last.行 && rowEnd > merge.first.行 && origin.列 <= merge.last.列 && columnEnd > merge.first.列) { spillError = '结果区域包含合并单元格'; break }
      }
      if (!spillError) for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
        const targetAddress = 生成地址(origin.行 + row, origin.列 + column), targetId = key(sheet, targetAddress)
        if (targetId !== id && (!empty(sheet.单元格[targetAddress]) || owners.has(targetId))) { spillError = `${targetAddress} 阻塞溢出区域`; break }
        if (reads.get(id)?.has(targetId)) { spillError = '数组结果包含自身依赖'; break }
      }
      if (spillError) result = { value: '#SPILL!', error: true, spillError }
      else {
        result.value = normalized(matrix[0][0]); result.boolean = typeof matrix[0][0] === 'boolean' ? matrix[0][0] : undefined
        result.error = isFormulaErrorCode(matrix[0][0])
        for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
          const targetId = key(sheet, 生成地址(origin.行 + row, origin.列 + column)), value = matrix[row][column]
          owners.set(targetId, id)
          if (targetId !== id) derived.set(targetId, { value: normalized(value), ...(typeof value === 'boolean' ? { boolean: value } : {}), ...(result.status ? { status: isFormulaErrorCode(value) && String(value) === '#待计算' ? '待计算' : result.status } : {}), error: isFormulaErrorCode(value) })
        }
      }
    }
    cache.set(id, result)
    return result
  }
  const failed = (sheet: Sheet, address: string, error: unknown) => cache.set(key(sheet,address), error instanceof 未支持公式 ? {value:'#待计算',error:true,status:'待计算'} : {value:'#错误',error:true})
  for (const candidate of candidates) { try { evaluate(candidate.sheet, candidate.address) } catch (error) { failed(candidate.sheet,candidate.address,error) } }
  for (const sheet of sources) for (const address of Object.keys(sheet.单元格)) { try { evaluate(sheet, address) } catch (error) { failed(sheet,address,error) } }
  return sources.map(sheet => {
    const original = originals.get(sheet.id)!, cells: Record<string, SheetCell> = {}, prefix = sheet.id + '!'
    let rows = sheet.行数, columns = sheet.列数
    const addresses = new Set([...Object.keys(sheet.单元格), ...[...derived.keys()].filter(id => id.startsWith(prefix)).map(id => id.slice(prefix.length))])
    for (const address of addresses) {
      const id = key(sheet, address), base = sheet.单元格[address] ?? { 原始值: '', 显示值: '', 格式: original.单元格[address]?.格式 ?? {} }, result = derived.get(id) ?? cache.get(id)
      const formula = base.值类型 !== '文本' && base.原始值.startsWith('='), child = derived.has(id), ownerId = owners.get(id)
      const { 计算值: _value, 公式状态: _status, 溢出范围: _range, 溢出错误: _error, 动态数组: _dynamic, 布尔结果: _boolean, 计算错误: _calculationError, ...source } = base
      const value = result?.value ?? normalized(sourceValue(base))
      const position = 解析地址(address)!
      if (child) { rows = Math.max(rows, position.行 + 1); columns = Math.max(columns, position.列 + 1) }
      const matrix = result?.matrix
      const range = matrix ? `${address}:${生成地址(position.行 + matrix.length - 1, position.列 + matrix[0].length - 1)}` : undefined
      const cell: SheetCell = { ...source, 显示值: base.值类型 === '文本' ? base.原始值 : format(formula || child ? String(value) : base.原始值, base.格式, sheet.日期系统1904),
        ...(formula || child ? { 计算值: value } : {}), ...(result?.status ? { 公式状态: result.status } : {}), ...(child && ownerId ? { 溢出锚点: ownerId.slice(prefix.length) } : {}),
        ...(range ? { 溢出范围: range, 动态数组: true } : {}), ...(result?.arrayError ? {动态数组:true} : {}), ...(result?.spillError ? { 溢出错误: result.spillError, 动态数组: true } : {}), ...(result?.boolean !== undefined ? { 布尔结果: result.boolean } : {}), ...(result?.error ? { 计算错误: true } : {}) }
      const old = original.单元格[address]
      cells[address] = old && Object.keys(cell).length === Object.keys(old).length && Object.entries(cell).every(([name, value]) => old[name as keyof SheetCell] === value) ? old : cell
    }
    if (rows === original.行数 && columns === original.列数 && Object.keys(cells).length === Object.keys(original.单元格).length && Object.keys(cells).every(address => cells[address] === original.单元格[address])) return original
    return { ...sheet, 单元格: cells, 行数: rows, 列数: columns, 行高: Array.from({ length: rows }, (_, row) => sheet.行高[row] ?? 24), 列宽: Array.from({ length: columns }, (_, column) => sheet.列宽[column] ?? 88) }
  })
}
