/** Only file images belong to the editor; document drops still open normally. */
export function hasImageTransfer(data: DataTransfer | null | undefined): boolean {
  return !!data && (Array.from(data.items ?? []).some(item => item.kind === 'file' && item.type.startsWith('image/')) ||
    Array.from(data.files ?? []).some(file => file.type.startsWith('image/') || /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(file.name)))
}

export function installImageTransfer(root: HTMLElement, insert: (files: File[], range: Range | null) => void): () => void {
  const receive = (event: ClipboardEvent | DragEvent) => {
    const data = 'clipboardData' in event ? event.clipboardData : event.dataTransfer
    if (!hasImageTransfer(data)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.type !== 'paste' && event.type !== 'drop') return
    const files = Array.from(data?.files ?? [])
    if (!files.length) for (const item of Array.from(data?.items ?? [])) { const file = item.kind === 'file' ? item.getAsFile() : null; if (file) files.push(file) }
    // Keep a mixed drop atomic: validation rejects unsupported files before insertion.
    let range: Range | null = null
    if (event.type === 'drop') {
      const drag = event as DragEvent
      range = document.caretRangeFromPoint?.(drag.clientX, drag.clientY) ?? null
    } else {
      const selection = window.getSelection()
      range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
    }
    if (range && (!root.contains(range.startContainer) || !root.contains(range.endContainer))) range = null
    if (!range) { range = document.createRange(); range.selectNodeContents(root); range.collapse(false) }
    insert(files, range)
  }
  const types = ['paste', 'drop', 'dragover', 'dragenter'] as const
  types.forEach(type => root.addEventListener(type, receive as EventListener, true))
  return () => types.forEach(type => root.removeEventListener(type, receive as EventListener, true))
}
