import type { PluginSummary } from './pluginManagement'
import { fileCountLabel, languageBadge, pluginAvatar } from './pluginSwitcher'
import { formatAgo } from './utils'

/**
 * The welcome screen, shown in place of the file tree and the editor while no
 * plugin is open (the editor was opened without ?plugin=, or the open plugin
 * was deleted).
 */

const RECENT_LIMIT = 6

export function setWelcomeVisible(visible: boolean) {
  document.getElementById('app')!.classList.toggle('no-plugin', visible)
  document.getElementById('welcome')!.hidden = !visible
}

export function renderWelcome(plugins: PluginSummary[], onOpen: (id: string) => void) {
  const section = document.getElementById('welcome-recent-section')!
  const grid = document.getElementById('welcome-recent')!
  section.hidden = plugins.length === 0
  grid.innerHTML = ''

  for (const plugin of plugins.slice(0, RECENT_LIMIT)) {
    const card = document.createElement('button')
    card.className = 'recent-card'

    const head = document.createElement('span')
    head.className = 'recent-card__head'
    const name = document.createElement('span')
    name.className = 'recent-card__name'
    name.textContent = plugin.name
    head.append(pluginAvatar(plugin), name, languageBadge(plugin.language))

    const meta = document.createElement('span')
    meta.className = 'recent-card__meta'
    meta.textContent = `${fileCountLabel(plugin.fileCount)} · edited ${formatAgo(plugin.updatedAt, true)}`

    card.append(head, meta)
    card.addEventListener('click', () => onOpen(plugin.id))
    grid.appendChild(card)
  }
}
