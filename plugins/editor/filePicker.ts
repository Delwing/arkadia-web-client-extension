/** Ctrl+P: pick a file of the open plugin by name. */
import * as FileIcons from 'file-icons-js'
import {closeFilePicker, showFilePicker} from './modals'
import {state, switchToFile} from './session'

// File picker
export function renderFilePickerList(filter: string) {
  if (!state.currentPlugin) return

  const list = document.getElementById('file-picker-list')!
  const files = Object.keys(state.currentPlugin.files).sort()

  const filteredFiles = filter
    ? files.filter(f => f.toLowerCase().includes(filter.toLowerCase()))
    : files

  list.innerHTML = ''

  filteredFiles.forEach((filePath, index) => {
    const item = document.createElement('div')
    item.className = 'file-picker-item'

    const iconClass = FileIcons.getClassWithColor(filePath)
    const icon = document.createElement('span')
    icon.className = iconClass
    item.appendChild(icon)

    const text = document.createElement('span')
    text.textContent = filePath
    item.appendChild(text)

    item.addEventListener('click', () => {
      switchToFile(filePath)
      closeFilePicker()
    })

    if (index === 0) {
      item.classList.add('selected')
    }

    list.appendChild(item)
  })

  if (filteredFiles.length === 0) {
    list.innerHTML = '<div class="file-picker-empty">No files found</div>'
  }
}

export function showFilePickerHandler() {
  showFilePicker()
  renderFilePickerList('')

  const modal = document.getElementById('file-picker-modal')!
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeFilePicker()
    }
  }

  const handleClick = (e: MouseEvent) => {
    if (e.target === modal) {
      closeFilePicker()
    }
  }

  document.addEventListener('keydown', handleKeyDown)
  modal.addEventListener('click', handleClick)

  const cleanup = () => {
    document.removeEventListener('keydown', handleKeyDown)
    modal.removeEventListener('click', handleClick)
  }

  ;(modal as any)._cleanup = cleanup
}

/** Wire the picker's filter field. */
export function setupFilePicker() {
  // File picker input
  const filePickerInput = document.getElementById('file-picker-input') as HTMLInputElement
  filePickerInput.addEventListener('input', (e) => {
    const filter = (e.target as HTMLInputElement).value
    renderFilePickerList(filter)
  })

  filePickerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const firstItem = document.querySelector('.file-picker-item') as HTMLElement
      if (firstItem) {
        firstItem.click()
      }
    }
  })
}
