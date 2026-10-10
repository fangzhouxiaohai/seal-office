export function viewportState(windowHeight: number, visualHeight: number, scale: number, baseline: number, editing: boolean) {
  // 缩放手势不能被当成键盘；部分 ROM 同时改变 innerHeight 与 visualViewport。
  const height = scale === 1 ? Math.min(windowHeight, visualHeight) : windowHeight
  return { height, keyboard: editing && scale === 1 && baseline - height > 150 }
}

export function installViewport() {
  let baseline = window.innerHeight, width = window.innerWidth
  const update = () => {
    if (Math.abs(width - window.innerWidth) > 80) { width = window.innerWidth; baseline = window.innerHeight }
    const active = document.activeElement
    const editing = active instanceof HTMLElement && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))
    const visual = window.visualViewport
    const state = viewportState(window.innerHeight, visual?.height ?? window.innerHeight, visual?.scale ?? 1, baseline, editing)
    if (!state.keyboard) baseline = Math.max(baseline, state.height)
    document.documentElement.style.setProperty('--seal-viewport-height', state.height + 'px')
    document.documentElement.classList.toggle('seal-keyboard-open', state.keyboard)
  }
  window.addEventListener('resize', update)
  window.visualViewport?.addEventListener('resize', update)
  document.addEventListener('focusin', update)
  document.addEventListener('focusout', () => requestAnimationFrame(update))
  update()
}
