import { useEffect, useRef, type RefObject } from 'react'
import { pageGeometry, planPages, type PageBlock, type PageBreak, type PageGeometry } from './pagination'

function breakKind(value: string): PageBreak { return /^(page|always|left|right|column)$/.test(value) ? ({ always: 'page', left: 'evenPage', right: 'oddPage' } as Record<string, PageBreak>)[value] ?? value as PageBreak : 'auto' }
const px = (value: string) => Number.parseFloat(value) || 0
/** Read-only DOM measurement: excludes hidden source packages and invisible revision variants. */
export function measurePageBlocks(root: HTMLElement, scale = 1): PageBlock[] {
  const blocks: PageBlock[] = [], ratio = Math.max(0.01, scale)
  const visit = (parent: Element, section?: Partial<PageGeometry>) => {
    for (const child of Array.from(parent.children)) {
      if (!(child instanceof HTMLElement) || child.hidden || child.hasAttribute('data-seal-docx-package') || child.getAttribute('aria-hidden') === 'true') continue
      const style = getComputedStyle(child)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      if (child.hasAttribute('data-seal-section')) {
        let layout: any
        try { layout = JSON.parse(decodeURIComponent(child.getAttribute('data-seal-section-layout') ?? '')) } catch { /* invalid source metadata never controls layout */ }
        const geometry: Partial<PageGeometry> = layout ? {
          height: Number(layout.纸张?.高) / 15,
          marginTop: Number(layout.页边距?.上) / 15,
          marginBottom: Number(layout.页边距?.下) / 15,
          columns: Number(layout.分栏?.数量 ?? 1),
        } : {}
        const index = blocks.length
        visit(child, geometry)
        if (blocks[index]) blocks[index].breakBefore = layout?.类型 === 'continuous' ? 'auto' : layout?.类型 === 'nextColumn' ? 'column' : layout?.类型 === 'evenPage' ? 'evenPage' : layout?.类型 === 'oddPage' ? 'oddPage' : index ? 'page' : 'auto'
        continue
      }
      const rect = child.getBoundingClientRect()
      if (child.tagName === 'TABLE') {
        const table = child as HTMLTableElement, rows = Array.from(table.rows)
        const headerRows = new Set(Array.from(table.tHead?.rows ?? [])), headerHeight = [...headerRows].reduce((sum, row) => sum + row.getBoundingClientRect().height / ratio, 0)
        for (let row = 0; row < rows.length; row++) {
          let end = row + 1
          // Keep all rows intersected by a vertical merge in the same group.
          for (let index = row; index < Math.min(end, rows.length); index++) for (const cell of Array.from(rows[index].cells)) end = Math.max(end, index + (cell.rowSpan || rows.length - index))
          end = Math.min(rows.length, end)
          const group = rows.slice(row, end), height = group.reduce((sum, item) => sum + item.getBoundingClientRect().height / ratio, 0)
          blocks.push({id:`${child.id || `table-${blocks.length}`}-row-${row}`,height,keepTogether:true,repeatHeader:group.every(item=>headerRows.has(item))?0:headerHeight,marginBefore:row===0?px(style.marginTop):0,marginAfter:end===rows.length?px(style.marginBottom):0,...(section?{section}:{})})
          section=undefined;row=end-1
        }
        if (rows.length) continue
      }
      const lines: number[] = []
      if (/^(P|H[1-6]|LI|BLOCKQUOTE)$/.test(child.tagName)) {
        const range = document.createRange(); range.selectNodeContents(child)
        if (typeof range.getClientRects === 'function') {
          const rects = Array.from(range.getClientRects()).filter(box => box.height > 0 && box.width > 0).sort((a, b) => a.top - b.top || a.left - b.left)
          const rows: Array<{ top: number; bottom: number; left: number; right: number }> = []
          for (const box of rects) {
            // Rectangles are sorted by baseline; only recent lines/columns can overlap.
            const row = rows.slice(-32).find(row => Math.min(row.bottom, box.bottom) - Math.max(row.top, box.top) > Math.min(row.bottom - row.top, box.height) * 0.5 && box.left <= row.right + 4 && box.right >= row.left - 4)
            if (row) { row.top = Math.min(row.top, box.top); row.bottom = Math.max(row.bottom, box.bottom); row.left = Math.min(row.left, box.left); row.right = Math.max(row.right, box.right) }
            else rows.push({ top: box.top, bottom: box.bottom, left: box.left, right: box.right })
          }
          const lineHeight = px(style.lineHeight)
          lines.push(...rows.map(row => Math.max(lineHeight, (row.bottom - row.top) / ratio)))
        }
      }
      const pageBreak = child.classList.contains('wps-page-break') || child.hasAttribute('data-seal-page-break')
      blocks.push({ id: child.id || `block-${blocks.length}`, height: rect.height / ratio, ...(lines.length > 1 ? { lines } : {}), marginBefore: px(style.marginTop), marginAfter: px(style.marginBottom), keepTogether: style.breakInside.includes('avoid') || style.pageBreakInside === 'avoid' || child.tagName === 'TR', keepNext: child.dataset.sealKeepNext === 'true' || /^(H[1-6])$/.test(child.tagName), orphans: px(style.orphans) || 2, widows: px(style.widows) || 2, breakBefore: pageBreak ? 'page' : breakKind(style.breakBefore || style.pageBreakBefore), explicitBreak: pageBreak, breakAfter: breakKind(style.breakAfter || style.pageBreakAfter), ...(section ? { section } : {}) })
      section = undefined
    }
  }
  visit(root)
  return blocks
}
export function usePagination(root: RefObject<HTMLElement>, geometry: PageGeometry, scale: number, content: string, onPagination?: (pages: number) => void) {
  const latest = useRef(onPagination); latest.current = onPagination
  useEffect(() => {
    const element = root.current
    if (!element || !latest.current) return
    let cancelled = false, frame = 0, last = -1
    const measure = () => {
      frame = 0
      if (cancelled) return
      const pages = planPages(measurePageBlocks(element, scale), pageGeometry(geometry)).pages
      if (pages !== last) { last = pages; latest.current?.(pages) }
    }
    const schedule = () => { if (!frame && !cancelled) frame = requestAnimationFrame(measure) }
    const mutation = new MutationObserver(schedule)
    mutation.observe(element, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'data-seal-revision-view', 'data-seal-section-layout', 'data-seal-keep-next'] })
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : undefined
    resize?.observe(element)
    element.addEventListener('load', schedule, true)
    window.addEventListener('resize', schedule)
    void document.fonts?.ready.then(schedule)
    schedule()
    return () => { cancelled = true; if (frame) cancelAnimationFrame(frame); mutation.disconnect(); resize?.disconnect(); element.removeEventListener('load', schedule, true); window.removeEventListener('resize', schedule) }
  }, [root, geometry.height, geometry.marginTop, geometry.marginBottom, geometry.columns, scale, content])
}
