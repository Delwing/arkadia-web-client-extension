export function showModal(modalId: string) {
  const modal = document.getElementById(modalId)!
  modal.classList.add('active')
}

export function hideModal(modalId: string) {
  const modal = document.getElementById(modalId)!
  modal.classList.remove('active')
}

export function showNewPluginModal() {
  const modal = document.getElementById('new-plugin-modal')!
  modal.classList.add('active')

  const nameInput = document.getElementById('new-plugin-name') as HTMLInputElement
  nameInput.value = ''

  const langSelect = document.getElementById('new-plugin-language') as HTMLSelectElement
  langSelect.value = 'typescript'

  nameInput.focus()
}

export function hideNewPluginModal() {
  hideModal('new-plugin-modal')
}

export function showNewFileModal() {
  const modal = document.getElementById('new-file-modal')!
  modal.classList.add('active')

  const pathInput = document.getElementById('new-file-path') as HTMLInputElement
  pathInput.value = ''
  pathInput.focus()
}

export function hideNewFileModal() {
  hideModal('new-file-modal')
}

export function showFilePicker() {
  const modal = document.getElementById('file-picker-modal')!
  const input = document.getElementById('file-picker-input') as HTMLInputElement

  modal.classList.add('active')
  input.value = ''
  input.focus()
}

export function closeFilePicker() {
  const modal = document.getElementById('file-picker-modal')!
  modal.classList.remove('active')

  // Call cleanup if it exists
  if ((modal as any)._cleanup) {
    (modal as any)._cleanup()
    delete (modal as any)._cleanup
  }
}
