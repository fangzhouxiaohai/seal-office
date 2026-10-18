import { useLayoutEffect, useState } from 'react'

/** Visual line positions are measured from layout, never written into the text. */
export default function LineNumbers({ root, html, scale }: { root: React.RefObject<HTMLDivElement>; html: string; scale: number }) {
  const [lines, setLines] = useState<Array<{ left: number; top: number }>>([])
  useLayoutEffect(() => {
    const content = root.current
    if (!content) return
    let frame = 0, alive = true
    const measure = () => {
      frame = 0
      const rect = content.getBoundingClientRect(), factor = rect.width / content.offsetWidth || 1
      const columns = Math.max(1, Number.parseInt(getComputedStyle(content).columnCount) || 1), width = rect.width / columns
      const positions: Array<{ column: number; top: number; bottom: number }> = []
      const buckets = new Map<string, number>(), tolerance = 4 * factor
      const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
      let node: Node | null
      while ((node = walker.nextNode()) && positions.length < 20000) {
        if (!node.textContent?.trim() || node.parentElement?.closest('[data-seal-notes]')) continue
        const range = document.createRange(); range.selectNodeContents(node)
        for (const line of Array.from(range.getClientRects?.() ?? [])) {
          if (!line.width || !line.height) continue
          const column = Math.min(columns - 1, Math.max(0, Math.floor((line.left - rect.left) / width)))
          const bucket = Math.floor(line.bottom / tolerance)
          if (![bucket - 1, bucket, bucket + 1].some(value => Math.abs((buckets.get(`${column}:${value}`) ?? Infinity) - line.bottom) < tolerance)) {
            positions.push({ column, top: line.top, bottom: line.bottom }); buckets.set(`${column}:${bucket}`, line.bottom)
          }
        }
      }
      positions.sort((a, b) => a.column - b.column || a.top - b.top)
      if (alive) setLines(positions.map(line => ({ left: content.offsetLeft + line.column * width / factor - 30, top: content.offsetTop + (line.top - rect.top) / factor })))
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure) }
    const resize = new ResizeObserver(schedule), mutation = new MutationObserver(schedule)
    resize.observe(content); mutation.observe(content, { childList: true, characterData: true, subtree: true, attributes: true })
    void document.fonts?.ready.then(schedule)
    schedule()
    return () => { alive = false; resize.disconnect(); mutation.disconnect(); cancelAnimationFrame(frame) }
  }, [root, html, scale])
  return <div aria-hidden="true" className="wps-line-numbers" contentEditable={false} style={{ pointerEvents: 'none', userSelect: 'none' }}>
    {lines.map((line, index) => <span key={index} style={{ position: 'absolute', left: line.left, top: line.top, width: 22, textAlign: 'right', color: '#667085', fontSize: 11 }}>{index + 1}</span>)}
  </div>
}
