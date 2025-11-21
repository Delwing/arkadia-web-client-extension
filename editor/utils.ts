import type { StatusType } from './types'

export function updateStatus(message: string, type: StatusType = 'normal') {
  const statusBar = document.getElementById('status-bar')!
  const statusText = document.getElementById('status-text')!
  statusText.textContent = message

  statusBar.className = ''
  if (type === 'success') statusBar.classList.add('success')
  if (type === 'error') statusBar.classList.add('error')
}

export function updateLanguageUI(language: 'javascript' | 'typescript') {
  const compileBtn = document.getElementById('compile-btn')!
  compileBtn.style.display = language === 'typescript' ? 'block' : 'none'
}
