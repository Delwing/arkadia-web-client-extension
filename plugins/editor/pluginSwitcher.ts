import type { PluginSummary } from './pluginManagement'
import { createPopover, type Popover } from './popover'
import { formatAgo } from './utils'

/**
 * The plugin switcher: the header button showing the open plugin, and the
 * searchable list it opens (also on Ctrl+O). The welcome screen reuses the
 * card rendering for its recent plugins.
 */

export interface PluginSwitcherOptions {
  getPlugins: () => PluginSummary[]
  getCurrentId: () => string | null
  onPick: (id: string) => void
  onNew: () => void
  onImport: () => void
}

/** A stable per-plugin hue for its initial, so plugins are told apart at a glance. */
export function pluginHue(id: string): number {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return hash % 360
}

export function languageBadge(language: PluginSummary['language']): HTMLSpanElement {
  const badge = document.createElement('span')
  badge.className = `lang-badge lang-badge--${language === 'typescript' ? 'ts' : 'js'}`
  badge.textContent = language === 'typescript' ? 'TS' : 'JS'
  return badge
}

export function pluginAvatar(plugin: PluginSummary): HTMLSpanElement {
  const avatar = document.createElement('span')
  avatar.className = 'plugin-avatar'
  avatar.style.setProperty('--hue', String(pluginHue(plugin.id)))
  avatar.textContent = (plugin.name.trim()[0] || '?').toUpperCase()
  return avatar
}

export function fileCountLabel(count: number): string {
  return count === 1 ? '1 file' : `${count} files`
}

export function setupPluginSwitcher(options: PluginSwitcherOptions): Popover {
  const trigger = document.getElementById('plugin-switcher-btn')!
  const panel = document.getElementById('plugin-switcher')!
  const search = document.getElementById('plugin-search') as HTMLInputElement
  const list = document.getElementById('plugin-list')!

  let selected = 0
  let shown: PluginSummary[] = []

  const render = () => {
    const query = search.value.trim().toLowerCase()
    shown = options.getPlugins().filter(p => !query || p.name.toLowerCase().includes(query))
    selected = Math.min(selected, Math.max(0, shown.length - 1))
    const currentId = options.getCurrentId()

    list.innerHTML = ''
    if (shown.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'switcher-empty'
      empty.textContent = query ? `No plugin matches "${search.value.trim()}"` : 'No plugins yet'
      list.appendChild(empty)
      return
    }

    shown.forEach((plugin, index) => {
      const row = document.createElement('button')
      row.className = 'switcher-item'
      row.classList.toggle('selected', index === selected)

      const text = document.createElement('span')
      text.className = 'switcher-item__text'
      const name = document.createElement('span')
      name.className = 'switcher-item__name'
      name.textContent = plugin.name
      const meta = document.createElement('span')
      meta.className = 'switcher-item__meta'
      meta.append(languageBadge(plugin.language), fileCountLabel(plugin.fileCount))
      text.append(name, meta)

      row.append(pluginAvatar(plugin), text)

      if (plugin.id === currentId) {
        const open = document.createElement('span')
        open.className = 'switcher-item__open'
        open.textContent = 'open'
        row.appendChild(open)
      }

      const ago = document.createElement('span')
      ago.className = 'switcher-item__ago'
      ago.textContent = formatAgo(plugin.updatedAt)
      row.appendChild(ago)

      row.addEventListener('mousemove', () => {
        if (selected === index) return
        selected = index
        list.querySelectorAll('.switcher-item').forEach((el, i) => el.classList.toggle('selected', i === index))
      })
      row.addEventListener('click', () => pick(plugin.id))
      list.appendChild(row)
    })
  }

  const pick = (id: string) => {
    popover.close()
    options.onPick(id)
  }

  const popover = createPopover(trigger, panel, {
    onOpen: () => {
      search.value = ''
      // Start on the plugin after the open one: the likely target of a switch.
      const plugins = options.getPlugins()
      const current = plugins.findIndex(p => p.id === options.getCurrentId())
      selected = current === 0 && plugins.length > 1 ? 1 : 0
      render()
      search.focus()
    },
  })

  search.addEventListener('input', () => {
    selected = 0
    render()
  })

  search.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (shown.length === 0) return
      selected = (selected + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length
      render()
      list.querySelector('.switcher-item.selected')?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const plugin = shown[selected]
      if (plugin) pick(plugin.id)
    }
  })

  document.getElementById('switcher-new-btn')!.addEventListener('click', () => {
    popover.close()
    options.onNew()
  })
  document.getElementById('switcher-import-btn')!.addEventListener('click', () => {
    popover.close()
    options.onImport()
  })

  return popover
}
