import type { StatusType } from './types'

export function updateStatus(message: string, type: StatusType = 'normal') {
  const statusBar = document.getElementById('status-bar')!
  const statusText = document.getElementById('status-text')!
  statusText.textContent = message

  statusBar.className = ''
  if (type === 'success') statusBar.classList.add('success')
  if (type === 'error') statusBar.classList.add('error')
}

/**
 * How long ago a timestamp was: "2 min", "3 d". With `long`, a phrase for
 * running text: "2 min ago", "yesterday".
 */
export function formatAgo(timestamp: number, long = false, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - timestamp) / 60000))
  const hours = Math.round(minutes / 60)
  const days = Math.round(hours / 24)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return long ? `${minutes} min ago` : `${minutes} min`
  if (hours < 24) return long ? `${hours} h ago` : `${hours} h`
  if (days === 1 && long) return 'yesterday'
  if (days < 7) return long ? `${days} days ago` : `${days} d`
  if (days < 30) return long ? `${Math.round(days / 7)} wk ago` : `${Math.round(days / 7)} wk`
  if (days < 365) return long ? `${Math.round(days / 30)} mo ago` : `${Math.round(days / 30)} mo`
  return long ? `${Math.round(days / 365)} y ago` : `${Math.round(days / 365)} y`
}
