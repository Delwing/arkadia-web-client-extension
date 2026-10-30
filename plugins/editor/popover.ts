/**
 * A popover anchored under a header button: opens below it, closes on a
 * click outside, on Escape, or when another popover opens. The trigger
 * carries `.active` while it is open.
 */

export interface Popover {
  open(): void
  close(): void
  toggle(): void
  isOpen(): boolean
}

const all: Popover[] = []

export function createPopover(
  trigger: HTMLElement,
  panel: HTMLElement,
  options: { align?: 'left' | 'right'; onOpen?: () => void } = {}
): Popover {
  const place = () => {
    const rect = trigger.getBoundingClientRect()
    panel.style.top = `${rect.bottom + 6}px`
    if (options.align === 'right') {
      panel.style.left = ''
      panel.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`
    } else {
      panel.style.right = ''
      panel.style.left = `${Math.max(8, rect.left)}px`
    }
  }

  const onPointerDown = (e: PointerEvent) => {
    const target = e.target as Node
    if (!panel.contains(target) && !trigger.contains(target)) popover.close()
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      popover.close()
      trigger.focus()
    }
  }

  const popover: Popover = {
    open() {
      if (popover.isOpen()) return
      all.forEach(other => other !== popover && other.close())
      place()
      panel.hidden = false
      trigger.classList.add('active')
      document.addEventListener('pointerdown', onPointerDown, true)
      document.addEventListener('keydown', onKeyDown, true)
      window.addEventListener('resize', place)
      options.onOpen?.()
    },
    close() {
      if (!popover.isOpen()) return
      panel.hidden = true
      trigger.classList.remove('active')
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('resize', place)
    },
    toggle() {
      if (popover.isOpen()) popover.close()
      else popover.open()
    },
    isOpen() {
      return !panel.hidden
    },
  }

  trigger.addEventListener('click', () => popover.toggle())
  all.push(popover)
  return popover
}
