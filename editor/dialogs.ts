/**
 * In-app confirm / prompt dialog (#app-dialog), replacing the browser's
 * confirm() and prompt(): same frame as every other editor dialog, and
 * the buttons say what they do ("Save and open", "Delete") instead of OK.
 */

export interface DialogButton {
  id: string
  label: string
  kind?: 'primary' | 'danger'
  /** Push this button to the left edge of the footer (e.g. "Discard"). */
  start?: boolean
}

export interface DialogOptions {
  title: string
  message: string
  buttons: DialogButton[]
  /** Show a text field; its value comes back in the result. */
  input?: { value: string; placeholder?: string }
}

export interface DialogResult {
  /** Id of the button pressed, or null when dismissed (Escape, backdrop). */
  button: string | null
  value: string
}

let pending: ((result: DialogResult) => void) | null = null

export function openDialog(options: DialogOptions): Promise<DialogResult> {
  // One dialog at a time: a new one dismisses the previous.
  pending?.({ button: null, value: '' })

  const overlay = document.getElementById('app-dialog')!
  const title = document.getElementById('app-dialog-title')!
  const message = document.getElementById('app-dialog-message')!
  const input = document.getElementById('app-dialog-input') as HTMLInputElement
  const footer = document.getElementById('app-dialog-buttons')!

  title.textContent = options.title
  message.textContent = options.message
  message.hidden = !options.message
  input.hidden = !options.input
  input.value = options.input?.value ?? ''
  input.placeholder = options.input?.placeholder ?? ''

  footer.innerHTML = ''
  let spacerAdded = false
  const buttons = [...options.buttons].sort((a, b) => Number(!!b.start) - Number(!!a.start))
  for (const spec of buttons) {
    if (!spec.start && !spacerAdded) {
      const spacer = document.createElement('div')
      spacer.className = 'spacer'
      footer.appendChild(spacer)
      spacerAdded = true
    }
    const button = document.createElement('button')
    button.textContent = spec.label
    if (spec.kind) button.className = spec.kind
    button.addEventListener('click', () => finish(spec.id))
    footer.appendChild(button)
  }

  const primary = options.buttons.find(b => b.kind === 'primary') ?? options.buttons.find(b => b.kind === 'danger' && !b.start)

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      finish(null)
    } else if (e.key === 'Enter' && primary && (e.target === input || !options.input)) {
      e.preventDefault()
      finish(primary.id)
    }
  }
  const onBackdrop = (e: MouseEvent) => {
    if (e.target === overlay) finish(null)
  }

  function finish(button: string | null) {
    document.removeEventListener('keydown', onKeyDown, true)
    overlay.removeEventListener('click', onBackdrop)
    overlay.classList.remove('active')
    const resolve = pending
    pending = null
    resolve?.({ button, value: input.value })
  }

  document.addEventListener('keydown', onKeyDown, true)
  overlay.addEventListener('click', onBackdrop)
  overlay.classList.add('active')

  if (options.input) {
    input.focus()
    input.select()
  } else {
    (footer.querySelector<HTMLButtonElement>('button.primary') ?? footer.querySelector<HTMLButtonElement>('button.danger'))?.focus()
  }

  return new Promise(resolve => {
    pending = resolve
  })
}
