/** Drag handles that resize the side panels, within limits. */

interface ResizeOptions {
  min: number
  max: number
  /** Which side of the editor the panel sits on: dragging towards the editor widens it. */
  side: 'left' | 'right'
}

function makeResizable(panel: HTMLElement, handle: HTMLElement, {min, max, side}: ResizeOptions) {
  let resizing = false
  let startX = 0
  let startWidth = 0

  handle.addEventListener('mousedown', (e) => {
    resizing = true
    startX = e.clientX
    startWidth = panel.offsetWidth
    handle.classList.add('resizing')
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  })

  document.addEventListener('mousemove', (e) => {
    if (!resizing) return
    const delta = side === 'left' ? e.clientX - startX : startX - e.clientX
    panel.style.width = `${Math.max(min, Math.min(max, startWidth + delta))}px`
  })

  document.addEventListener('mouseup', () => {
    if (!resizing) return
    resizing = false
    handle.classList.remove('resizing')
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })
}

/** The file tree, the AI agent panel and the JS preview. */
export function setupPanelResizers() {
  const el = (id: string) => document.getElementById(id)!
  makeResizable(el('file-tree'), el('file-tree-resizer'), {min: 150, max: 600, side: 'left'})
  makeResizable(el('agent-panel'), el('agent-resizer'), {min: 300, max: 800, side: 'right'})
  makeResizable(el('js-preview-panel'), el('js-preview-resizer'), {min: 200, max: 800, side: 'right'})
}
