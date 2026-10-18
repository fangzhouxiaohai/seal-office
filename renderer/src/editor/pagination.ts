/** Physical flow planning shared by the live page counter and layout verification.
 * Measurements come from the browser after fonts/images resolve; document HTML is never split or rewritten.
 */
export type PageBreak = 'auto' | 'page' | 'column' | 'oddPage' | 'evenPage'
export interface PageGeometry { height: number; marginTop: number; marginBottom: number; columns: number }
export interface PageBlock {
  id: string
  height: number
  lines?: number[]
  marginBefore?: number
  marginAfter?: number
  keepTogether?: boolean
  keepNext?: boolean
  orphans?: number
  widows?: number
  breakBefore?: PageBreak
  breakAfter?: PageBreak
  /** A literal document page-break creates a blank page even at a page boundary. */
  explicitBreak?: boolean
  /** Height of a table heading repeated whenever this row continues in another column/page. */
  repeatHeader?: number
  section?: Partial<PageGeometry>
}
export interface PagePlacement { id: string; page: number; column: number; top: number; endPage: number; fragments: Array<{ page: number; column: number; height: number }> }
const bounded = (n: number | undefined, fallback: number, low: number, high: number) => typeof n === 'number' && Number.isFinite(n) ? Math.min(high, Math.max(low, n)) : fallback
export function pageGeometry(value: Partial<PageGeometry>): PageGeometry {
  const height = bounded(value.height, 1123, 96, 20000)
  return { height, marginTop: bounded(value.marginTop, 96, 0, height - 24), marginBottom: bounded(value.marginBottom, 96, 0, height - 24), columns: Math.round(bounded(value.columns, 1, 1, 16)) }
}
export function planPages(blocks: readonly PageBlock[], initial: Partial<PageGeometry> = {}): { pages: number; placements: PagePlacement[] } {
  let geometry = pageGeometry(initial), page = 1, column = 1, used = 0, repeatedHeader = 0
  const placements: PagePlacement[] = []
  const capacity = () => Math.max(24, geometry.height - geometry.marginTop - geometry.marginBottom)
  const nextColumn = () => { used = repeatedHeader; if (column < geometry.columns) column++; else { page++; column = 1 } }
  const nextPage = () => { page++; column = 1; used = repeatedHeader }
  const forced = (kind: PageBreak | undefined, explicit = false) => {
    if (!kind || kind === 'auto') return
    if (kind === 'column') nextColumn()
    else { if (used > 0 || column > 1 || explicit) nextPage(); if (kind === 'oddPage' && page % 2 === 0) nextPage(); if (kind === 'evenPage' && page % 2 !== 0) nextPage() }
  }
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block.section) geometry = pageGeometry({ ...geometry, ...block.section })
    repeatedHeader = bounded(block.repeatHeader, 0, 0, Math.max(0, capacity() - 24))
    forced(block.breakBefore, block.explicitBreak)
    const height = bounded(block.height, 0, 0, 10_000_000), before = bounded(block.marginBefore, 0, 0, 20000), after = bounded(block.marginAfter, 0, 0, 20000)
    let chainHeight = height + before + after
    for (let j = i; blocks[j]?.keepNext && j + 1 < blocks.length && j < i + 256; j++) {
      const next = blocks[j + 1]
      if (next.breakBefore && next.breakBefore !== 'auto') break
      chainHeight += Math.max(0, next.height) + (next.marginBefore ?? 0) + (next.marginAfter ?? 0)
      if (chainHeight > capacity()) break
    }
    if (used > 0 && ((block.keepTogether && height + before <= capacity() && used + before + height > capacity()) || (block.keepNext && chainHeight <= capacity() && used + chainHeight > capacity()))) nextColumn()
    if (used > 0 && used + before >= capacity()) nextColumn()
    used += before
    const placement: PagePlacement = { id: block.id, page, column, top: used, endPage: page, fragments: [] }
    const lines = block.lines?.length && block.lines.every(line => Number.isFinite(line) && line > 0) ? block.lines : undefined
    if (lines) {
      let offset = 0
      while (offset < lines.length) {
        const start = offset
        let fit = 0, fragmentHeight = 0
        while (offset + fit < lines.length && fragmentHeight + lines[offset + fit] <= capacity() - used + 0.01) fragmentHeight += lines[offset + fit++]
        const orphans = Math.round(bounded(block.orphans, 2, 1, 100)), widows = Math.round(bounded(block.widows, 2, 1, 100))
        const remainingLines = lines.length - offset - fit
        const widowReduction = Math.max(0, widows - remainingLines)
        if (offset === 0 && fit < lines.length && used > repeatedHeader && (fit < orphans || (remainingLines < widows && fit - widowReduction < orphans && lines.reduce((sum, line) => sum + line, 0) <= capacity()))) { nextColumn(); continue }
        if (fit > 0 && fit < lines.length - offset && remainingLines < widows && fit - widowReduction >= orphans) fit -= widowReduction
        if (fit === 0) { if (used > repeatedHeader) { nextColumn(); continue }; fit = 1 }
        fragmentHeight = lines.slice(start, start + fit).reduce((sum, value) => sum + value, 0)
        if (!placement.fragments.length) { placement.page = page; placement.column = column; placement.top = used }
        placement.fragments.push({ page, column, height: fragmentHeight }); used += fragmentHeight; offset += fit
        if (offset < lines.length) nextColumn()
      }
    } else {
      let remaining = height
      while (remaining > 0) {
        if (used >= capacity() - 0.01) nextColumn()
        const size = Math.min(remaining, capacity() - used)
        if (!placement.fragments.length) { placement.page = page; placement.column = column; placement.top = used }
        placement.fragments.push({ page, column, height: size }); used += size; remaining -= size
      }
    }
    placement.endPage = page; placements.push(placement)
    used += after
    forced(block.breakAfter)
  }
  return { pages: page, placements }
}
