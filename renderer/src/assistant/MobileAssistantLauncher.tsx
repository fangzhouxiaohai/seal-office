import { useLayoutEffect, useRef, useState } from 'react'
import Icon from '../components/Icon'

const storageKey = 'seal.mobile.assistant.position.v1'
type Position = { x: number; y: number }
type Bounds = { left: number; top: number; width: number; height: number }
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, Math.max(low, high)))

/** The native host and mobile browser both keep the control inside the visible viewport. */
export default function MobileAssistantLauncher({ onOpen, disabled }: { onOpen: () => void; disabled: boolean }) {
  const button = useRef<HTMLButtonElement>(null)
  const safeArea = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<Position | null>(null)
  const [dragging, setDragging] = useState(false)
  const current = useRef<Position | null>(null)
  const ratio = useRef<Position | null>(null)
  const drag = useRef<{ id: number; x: number; y: number; start: Position; moved: boolean } | null>(null)
  const suppressClick = useRef(false)

  const bounds = (): Bounds => {
    const area = safeArea.current?.getBoundingClientRect()
    const visual = window.visualViewport
    const left = Math.max(area?.left ?? 12, (visual?.offsetLeft ?? 0) + 12)
    const top = Math.max(area?.top ?? 12, (visual?.offsetTop ?? 0) + 12)
    const right = Math.min(area?.right || window.innerWidth - 12, (visual?.offsetLeft ?? 0) + (visual?.width ?? window.innerWidth) - 12)
    const bottom = Math.min(area?.bottom || window.innerHeight - 12, (visual?.offsetTop ?? 0) + (visual?.height ?? window.innerHeight) - 12)
    return { left, top, width: Math.max(0, right - left - 56), height: Math.max(0, bottom - top - 56) }
  }
  const move = (next: Position, persist = false) => {
    const area = bounds()
    const value = { x: clamp(next.x, area.left, area.left + area.width), y: clamp(next.y, area.top, area.top + area.height) }
    current.current = value; setPosition(value)
    if (persist) {
      ratio.current = { x: area.width ? (value.x - area.left) / area.width : 1, y: area.height ? (value.y - area.top) / area.height : 1 }
      try { localStorage.setItem(storageKey, JSON.stringify(ratio.current)) } catch { /* Dragging also works when storage is unavailable. */ }
    }
  }
  useLayoutEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || 'null')
      if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.y)) ratio.current = { x: clamp(stored.x, 0, 1), y: clamp(stored.y, 0, 1) }
    } catch { /* Use the reachable default position. */ }
    const resize = () => {
      const area = bounds(), saved = ratio.current
      move(saved ? { x: area.left + area.width * saved.x, y: area.top + area.height * saved.y } : { x: area.left + area.width, y: area.top + area.height - 100 })
    }
    resize()
    window.addEventListener('resize', resize)
    window.visualViewport?.addEventListener('resize', resize)
    window.visualViewport?.addEventListener('scroll', resize)
    return () => {
      window.removeEventListener('resize', resize)
      window.visualViewport?.removeEventListener('resize', resize)
      window.visualViewport?.removeEventListener('scroll', resize)
    }
  }, [])

  return <>
    <div ref={safeArea} className="assistant-mobile-safe-area" aria-hidden="true" />
    <button ref={button} type="button" className={`assistant-mobile-launcher${dragging ? ' is-dragging' : ''}`}
      style={position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined}
      disabled={disabled} aria-label="打开智能助手" title="智能助手：点击打开，拖动移动位置；方向键也可移动"
      onPointerDown={event => {
        if (event.button !== 0 || event.isPrimary === false || disabled) return
        const rect = event.currentTarget.getBoundingClientRect()
        suppressClick.current = false
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, start: current.current ?? { x: rect.left, y: rect.top }, moved: false }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={event => {
        const active = drag.current
        if (!active || active.id !== event.pointerId) return
        const x = event.clientX - active.x, y = event.clientY - active.y
        if (!active.moved && Math.hypot(x, y) < 6) return
        active.moved = true; suppressClick.current = true; setDragging(true)
        move({ x: active.start.x + x, y: active.start.y + y })
      }}
      onPointerUp={event => {
        if (drag.current?.id !== event.pointerId) return
        if (drag.current.moved && current.current) move(current.current, true)
        drag.current = null; setDragging(false)
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={() => { drag.current = null; setDragging(false); suppressClick.current = true }}
      onLostPointerCapture={() => { drag.current = null; setDragging(false) }}
      onKeyDown={event => {
        suppressClick.current = false
        const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
        if (!direction || !current.current) return
        event.preventDefault()
        move({ x: current.current.x + direction[0] * 16, y: current.current.y + direction[1] * 16 }, true)
      }}
      onClick={event => { if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); return }; onOpen() }}>
      <Icon name="ai" size={26} />
    </button>
  </>
}
