import { useEffect, useRef, useState, type RefObject } from 'react'

const mobileQuery = '(max-width: 820px), (pointer: coarse) and (max-width: 1024px)'
const controls = '[data-reading-chrome]'
const interactive = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('button,input,textarea,select,a[href],audio,video,[contenteditable="true"],[data-reading-control]'))

/** Reading chrome overlays the page, so revealing it never repaginates a document.
 * Single-finger panning stays native; a completed, stationary double tap alone
 * reveals the chrome. Pinches, drags and taps on document links are excluded. */
export function useReadingChrome(root: RefObject<HTMLElement>, active: boolean, onReveal?: () => void) {
  const [mobile, setMobile] = useState(() => window.matchMedia?.(mobileQuery).matches ?? false)
  const [visible, setVisible] = useState(() => !(active && mobile))
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const latestReveal = useRef(onReveal); latestReveal.current = onReveal
  const autoHide = active && mobile
  useEffect(() => {
    const media = window.matchMedia?.(mobileQuery)
    if (!media) return
    const change = () => setMobile(media.matches)
    change()
    if (media.addEventListener) media.addEventListener('change', change)
    else media.addListener(change)
    return () => {
      if (media.removeEventListener) media.removeEventListener('change', change)
      else media.removeListener(change)
    }
  }, [])
  useEffect(() => {
    const element = root.current
    setVisible(!autoHide)
    if (!element || !autoHide) return
    let pointerHeld = false, keyboard = false, composing = false, hiding = false
    let start: { x: number; y: number; at: number; id: number } | null = null
    let lastTap: { x: number; y: number; at: number } | null = null
    const clear = () => { if (timer.current !== undefined) clearTimeout(timer.current); timer.current = undefined }
    const schedule = () => {
      clear()
      timer.current = setTimeout(() => {
        const focused = document.activeElement instanceof Element && element.contains(document.activeElement) && document.activeElement.closest(controls)
        if (pointerHeld || composing || focused && (keyboard || document.activeElement?.matches('input,textarea,select'))) { schedule(); return }
        // A pointer-focused button must not retain focus in hidden chrome.
        if (focused) { hiding = true; element.focus({ preventScroll: true }); hiding = false }
        setVisible(false)
        timer.current = undefined
      }, 3000)
    }
    const reveal = () => { latestReveal.current?.(); setVisible(true); schedule() }
    const chromeTarget = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest(controls))
    const doubleClick = (event: MouseEvent) => {
      if (chromeTarget(event.target) || interactive(event.target)) return
      event.preventDefault()
      reveal()
    }
    const touchStart = (event: TouchEvent) => {
      keyboard = false
      if (event.touches.length !== 1 || chromeTarget(event.target) || interactive(event.target)) { start = null; lastTap = null; return }
      const point = event.touches[0]
      start = { x: point.clientX, y: point.clientY, id: point.identifier, at: Date.now() }
    }
    const touchMove = (event: TouchEvent) => {
      const point = event.touches[0]
      if (!start || event.touches.length !== 1 || !point || point.identifier !== start.id || Math.hypot(point.clientX - start.x, point.clientY - start.y) > 10) { start = null; lastTap = null }
    }
    const touchEnd = (event: TouchEvent) => {
      if (event.touches.length || !start) return
      const tap = start; start = null
      if (Date.now() - tap.at > 300) { lastTap = null; return }
      const now = Date.now()
      if (lastTap && now - lastTap.at <= 350 && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) <= 24) {
        lastTap = null
        if (event.cancelable) event.preventDefault()
        reveal()
      } else lastTap = { x: tap.x, y: tap.y, at: now }
    }
    const cancelTap = () => { start = null; lastTap = null }
    const activity = (event: Event) => { if (!hiding && chromeTarget(event.target)) reveal() }
    const pointerDown = (event: Event) => { keyboard = false; if (chromeTarget(event.target)) { pointerHeld = true; reveal() } }
    const pointerUp = () => { if (pointerHeld) { pointerHeld = false; schedule() } }
    const key = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return
      if (event.key === 'Tab') {
        keyboard = true
        const hidden = element.dataset.readingControls === 'hidden'
        reveal()
        if (hidden) {
          event.preventDefault(); event.stopImmediatePropagation()
          requestAnimationFrame(() => {
            const items = element.querySelectorAll<HTMLElement>('[data-reading-chrome] button:not([disabled]),[data-reading-chrome] input:not([disabled]),[data-reading-chrome] select:not([disabled])')
            ;(event.shiftKey ? items[items.length - 1] : items[0])?.focus({ preventScroll: true })
          })
        }
      } else if (chromeTarget(event.target)) reveal()
    }
    const composingStart = () => { composing = true }
    const composingEnd = () => { composing = false; schedule() }
    element.addEventListener('dblclick', doubleClick)
    element.addEventListener('touchstart', touchStart, { passive: true })
    element.addEventListener('touchmove', touchMove, { passive: true })
    element.addEventListener('touchend', touchEnd, { passive: false })
    element.addEventListener('touchcancel', cancelTap)
    element.addEventListener('pointerdown', pointerDown, true)
    window.addEventListener('pointerup', pointerUp); window.addEventListener('pointercancel', pointerUp)
    element.addEventListener('click', activity, true); element.addEventListener('input', activity, true); element.addEventListener('change', activity, true)
    element.addEventListener('keydown', key, true)
    element.addEventListener('focusin', activity); element.addEventListener('focusout', activity)
    element.addEventListener('compositionstart', composingStart); element.addEventListener('compositionend', composingEnd)
    return () => {
      clear()
      element.removeEventListener('dblclick', doubleClick)
      element.removeEventListener('touchstart', touchStart); element.removeEventListener('touchmove', touchMove); element.removeEventListener('touchend', touchEnd); element.removeEventListener('touchcancel', cancelTap)
      element.removeEventListener('pointerdown', pointerDown, true); window.removeEventListener('pointerup', pointerUp); window.removeEventListener('pointercancel', pointerUp)
      element.removeEventListener('click', activity, true); element.removeEventListener('input', activity, true); element.removeEventListener('change', activity, true)
      element.removeEventListener('keydown', key, true); element.removeEventListener('focusin', activity); element.removeEventListener('focusout', activity)
      element.removeEventListener('compositionstart', composingStart); element.removeEventListener('compositionend', composingEnd)
    }
  }, [root, autoHide])
  return { autoHide, visible: !autoHide || visible, description: autoHide ? '双击页面显示操作栏，3秒无操作后自动隐藏；按Tab也可显示操作栏，按Esc或系统返回退出阅读。' : undefined }
}
