import * as monaco from 'monaco-editor'
import { createPopover } from './popover'
import { getEditorPrefs, saveEditorPrefs } from './monacoSetup'

/**
 * The editor's chrome around Monaco: the header (open plugin, breadcrumb,
 * save state), the status bar (problems, cursor, file language) and the
 * settings popover. main.ts owns the plugin state and pushes it in here.
 */

const LANGUAGE_NAMES: Record<string, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  json: 'JSON',
  markdown: 'Markdown',
  css: 'CSS',
  html: 'HTML',
  plaintext: 'Plain text',
}

export function languageName(language: string): string {
  return LANGUAGE_NAMES[language] ?? language.charAt(0).toUpperCase() + language.slice(1)
}

// ── Header ──────────────────────────────────────────────────────────────

export function setHeaderPlugin(plugin: { name: string; language: 'typescript' | 'javascript' } | null) {
  const name = document.getElementById('switcher-name')!
  const lang = document.getElementById('switcher-lang')!
  const trigger = document.getElementById('plugin-switcher-btn')!

  trigger.classList.toggle('is-empty', !plugin)
  name.textContent = plugin ? plugin.name : 'Open a plugin…'
  lang.hidden = !plugin
  if (plugin) {
    lang.textContent = plugin.language === 'typescript' ? 'TS' : 'JS'
    lang.className = `lang-badge lang-badge--${plugin.language === 'typescript' ? 'ts' : 'js'}`
  }

  for (const id of ['save-btn', 'actions-btn', 'save-state', 'breadcrumb']) {
    document.getElementById(id)!.hidden = !plugin
  }
  if (!plugin) setBreadcrumb(null)
}

export function setBreadcrumb(filePath: string | null) {
  const path = document.getElementById('breadcrumb-path')!
  path.innerHTML = ''
  if (!filePath) return

  const parts = filePath.split('/')
  parts.forEach((part, index) => {
    if (index > 0) {
      const sep = document.createElement('span')
      sep.className = 'breadcrumb-sep'
      sep.textContent = '/'
      path.appendChild(sep)
    }
    const segment = document.createElement('span')
    segment.className = index === parts.length - 1 ? 'breadcrumb-file' : 'breadcrumb-dir'
    segment.textContent = part
    path.appendChild(segment)
  })
}

export type SaveState = 'clean' | 'dirty' | 'saving' | 'failed'

export function setSaveState(saveState: SaveState, modifiedCount = 0) {
  const label = document.getElementById('save-state')!
  const saveBtn = document.getElementById('save-btn')!
  const dirtyDot = document.getElementById('switcher-dirty')!

  label.className = `save-state save-state--${saveState}`
  label.textContent = {
    clean: 'Saved',
    dirty: modifiedCount > 1 ? `${modifiedCount} unsaved files` : 'Unsaved changes',
    saving: 'Saving…',
    failed: 'Save failed',
  }[saveState]

  saveBtn.classList.toggle('primary', saveState === 'dirty' || saveState === 'failed')
  ;(saveBtn as HTMLButtonElement).disabled = saveState === 'saving'
  dirtyDot.hidden = saveState === 'clean' || saveState === 'saving'
}

// ── Status bar ──────────────────────────────────────────────────────────

export function setupStatusBar(
  editor: monaco.editor.IStandaloneCodeEditor,
  getPluginId: () => string | null,
  openLocation: (filePath: string, position: monaco.IPosition) => void
) {
  const cursor = document.getElementById('cursor-position')!
  const language = document.getElementById('file-language')!
  const problemsBtn = document.getElementById('problems-btn') as HTMLButtonElement
  const errors = document.getElementById('problems-errors')!
  const warnings = document.getElementById('problems-warnings')!

  const updateCursor = () => {
    const position = editor.getPosition()
    const model = editor.getModel()
    cursor.textContent = position && getPluginId() ? `Ln ${position.lineNumber}, Col ${position.column}` : ''
    language.textContent = model && getPluginId() ? languageName(model.getLanguageId()) : ''
  }

  // Markers of the open plugin's files only (models live at file:///<pluginId>/<path>).
  const pluginMarkers = () => {
    const pluginId = getPluginId()
    if (!pluginId) return []
    const prefix = `/${pluginId}/`
    return monaco.editor.getModelMarkers({}).filter(marker =>
      marker.resource.scheme === 'file' && marker.resource.path.startsWith(prefix)
    )
  }

  const updateProblems = () => {
    const markers = pluginMarkers()
    const errorCount = markers.filter(m => m.severity === monaco.MarkerSeverity.Error).length
    const warningCount = markers.filter(m => m.severity === monaco.MarkerSeverity.Warning).length
    errors.textContent = String(errorCount)
    warnings.textContent = String(warningCount)
    problemsBtn.hidden = !getPluginId()
    problemsBtn.classList.toggle('has-errors', errorCount > 0)
    problemsBtn.classList.toggle('has-warnings', errorCount === 0 && warningCount > 0)
  }

  problemsBtn.addEventListener('click', () => {
    const markers = pluginMarkers().sort((a, b) => a.severity === b.severity ? 0 : b.severity - a.severity)
    const first = markers[0]
    if (!first) return
    const pluginId = getPluginId()!
    const filePath = first.resource.path.slice(pluginId.length + 2)
    openLocation(filePath, { lineNumber: first.startLineNumber, column: first.startColumn })
  })

  editor.onDidChangeCursorPosition(updateCursor)
  editor.onDidChangeModel(() => {
    updateCursor()
    updateProblems()
  })
  monaco.editor.onDidChangeMarkers(updateProblems)

  return () => {
    updateCursor()
    updateProblems()
  }
}

// ── Settings popover ────────────────────────────────────────────────────

const FONT_MIN = 10
const FONT_MAX = 24

export function setupSettings(
  getEditors: () => monaco.editor.IStandaloneCodeEditor[],
  onThemeChange: (theme: string) => void,
  onConfigureIde: () => void
) {
  const popover = createPopover(
    document.getElementById('settings-btn')!,
    document.getElementById('settings-popover')!,
    { align: 'right' }
  )

  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement
  themeSelect.addEventListener('change', () => onThemeChange(themeSelect.value))

  const fontValue = document.getElementById('font-size-value')!
  const minimap = document.getElementById('minimap-toggle') as HTMLInputElement

  const apply = () => {
    const prefs = getEditorPrefs()
    fontValue.textContent = String(prefs.fontSize)
    minimap.checked = prefs.minimap
    getEditors().forEach(editor => editor.updateOptions({ fontSize: prefs.fontSize }))
    getEditors()[0]?.updateOptions({ minimap: { enabled: prefs.minimap } })
  }

  const stepFont = (delta: number) => {
    const fontSize = Math.min(FONT_MAX, Math.max(FONT_MIN, getEditorPrefs().fontSize + delta))
    saveEditorPrefs({ fontSize })
    apply()
  }

  document.getElementById('font-smaller-btn')!.addEventListener('click', () => stepFont(-1))
  document.getElementById('font-larger-btn')!.addEventListener('click', () => stepFont(1))
  minimap.addEventListener('change', () => {
    saveEditorPrefs({ minimap: minimap.checked })
    apply()
  })

  document.getElementById('settings-ide-btn')!.addEventListener('click', () => {
    popover.close()
    onConfigureIde()
  })

  apply()
  return { popover, apply }
}

/** Mirror the IDE connection into the settings popover. */
export function setSettingsIdeStatus(status: string, text: string) {
  document.getElementById('settings-ide-dot')!.className = `status-dot status-dot--${status}`
  document.getElementById('settings-ide-text')!.textContent = text
}
