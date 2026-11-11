/**
 * The Problems panel under the editors: every error and warning in the open
 * plugin's files, grouped by file. Clicking one opens the file there.
 * Toggled from the status bar's problem counts or with Ctrl+Shift+M.
 */
import * as monaco from 'monaco-editor'
import * as FileIcons from 'file-icons-js'

export interface ProblemsPanelOptions {
  getPluginId: () => string | null
  openLocation: (filePath: string, range: monaco.IRange) => void
}

/** Markers of the open plugin's files only (models live at file:///<pluginId>/<path>). */
export function pluginMarkers(pluginId: string | null): monaco.editor.IMarker[] {
  if (!pluginId) return []
  const prefix = `/${pluginId}/`
  return monaco.editor.getModelMarkers({}).filter(marker =>
    marker.resource.scheme === 'file' && marker.resource.path.startsWith(prefix)
  )
}

const SEVERITY_ORDER = [
  monaco.MarkerSeverity.Error,
  monaco.MarkerSeverity.Warning,
  monaco.MarkerSeverity.Info,
  monaco.MarkerSeverity.Hint,
]

const SEVERITY_ICON: Record<number, { cls: string; svg: string; label: string }> = {
  [monaco.MarkerSeverity.Error]: {
    cls: 'error',
    label: 'Error',
    svg: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  },
  [monaco.MarkerSeverity.Warning]: {
    cls: 'warning',
    label: 'Warning',
    svg: '<path d="m21.7 18-8-14a2 2 0 0 0-3.5 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  },
  [monaco.MarkerSeverity.Info]: {
    cls: 'info',
    label: 'Info',
    svg: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  },
}

function severityIcon(severity: monaco.MarkerSeverity): HTMLElement {
  const info = SEVERITY_ICON[severity] ?? SEVERITY_ICON[monaco.MarkerSeverity.Info]
  const span = document.createElement('span')
  span.className = `problem-severity problem-severity--${info.cls}`
  span.title = info.label
  span.innerHTML = `<svg class="icon icon--xs" viewBox="0 0 24 24">${info.svg}</svg>`
  return span
}

/** "ts(2304)" for TypeScript's own diagnostics, else the marker's source and code. */
function markerCode(marker: monaco.editor.IMarker): string {
  const code = typeof marker.code === 'string' ? marker.code : marker.code?.value
  if (!code) return marker.source ?? ''
  const source = marker.source ?? (marker.owner === 'typescript' || marker.owner === 'javascript' ? 'ts' : marker.owner)
  return `${source}(${code})`
}

export function setupProblemsPanel({ getPluginId, openLocation }: ProblemsPanelOptions) {
  const panel = document.getElementById('problems-panel')!
  const list = document.getElementById('problems-list')!
  const summary = document.getElementById('problems-summary')!
  const problemsBtn = document.getElementById('problems-btn')!
  const resizer = document.getElementById('problems-resizer')!
  const filterButtons = [...panel.querySelectorAll<HTMLButtonElement>('[data-problems-filter]')]

  const collapsed = new Set<string>()
  let filter: 'all' | 'errors' = 'all'
  let visible = false

  const render = () => {
    if (!visible) return
    const pluginId = getPluginId()
    // Hints (unused names and the like) are shown faded in the editor, not listed.
    const markers = pluginMarkers(pluginId).filter(m =>
      filter === 'all' ? m.severity !== monaco.MarkerSeverity.Hint : m.severity === monaco.MarkerSeverity.Error
    )

    const errors = markers.filter(m => m.severity === monaco.MarkerSeverity.Error).length
    const warnings = markers.filter(m => m.severity === monaco.MarkerSeverity.Warning).length
    summary.textContent = markers.length === 0 ? '' : [
      errors ? `${errors} ${errors === 1 ? 'error' : 'errors'}` : '',
      warnings ? `${warnings} ${warnings === 1 ? 'warning' : 'warnings'}` : '',
    ].filter(Boolean).join(', ')

    // Keep the scroll position across redraws (markers change as you type)
    const scrollTop = list.scrollTop
    list.replaceChildren()

    if (!pluginId || markers.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'problems-empty'
      empty.textContent = filter === 'errors' ? 'No errors in this plugin.' : 'No problems in this plugin.'
      list.append(empty)
      return
    }

    // Group by file; files with errors first, then by path
    const byFile = new Map<string, monaco.editor.IMarker[]>()
    for (const marker of markers) {
      // Uri.path is already decoded; decoding again throws on a literal % in a file name
      const filePath = marker.resource.path.slice(pluginId.length + 2)
      if (!byFile.has(filePath)) byFile.set(filePath, [])
      byFile.get(filePath)!.push(marker)
    }
    const worst = (ms: monaco.editor.IMarker[]) => Math.max(...ms.map(m => m.severity))
    const files = [...byFile.entries()].sort(([pathA, a], [pathB, b]) =>
      worst(b) - worst(a) || pathA.localeCompare(pathB)
    )

    for (const [filePath, fileMarkers] of files) {
      fileMarkers.sort((a, b) =>
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
        || a.startLineNumber - b.startLineNumber
        || a.startColumn - b.startColumn
      )

      const group = document.createElement('div')
      group.className = 'problems-file'
      if (collapsed.has(filePath)) group.classList.add('collapsed')

      const head = document.createElement('div')
      head.className = 'problems-file__head'
      const slash = filePath.lastIndexOf('/')
      head.innerHTML = '<svg class="icon icon--xs problems-chevron" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>'
      const icon = document.createElement('span')
      icon.className = FileIcons.getClassWithColor(filePath) ?? ''
      const name = document.createElement('span')
      name.className = 'problems-file__name'
      name.textContent = filePath.slice(slash + 1)
      const dir = document.createElement('span')
      dir.className = 'problems-file__dir'
      dir.textContent = slash >= 0 ? filePath.slice(0, slash) : ''
      const count = document.createElement('span')
      count.className = 'problems-file__count'
      count.textContent = String(fileMarkers.length)
      head.append(icon, name, dir, count)
      head.addEventListener('click', () => {
        if (collapsed.has(filePath)) collapsed.delete(filePath)
        else collapsed.add(filePath)
        group.classList.toggle('collapsed')
      })
      group.append(head)

      for (const marker of fileMarkers) {
        const row = document.createElement('div')
        row.className = 'problem-row'
        row.title = marker.message

        const message = document.createElement('span')
        message.className = 'problem-message'
        message.textContent = marker.message.split('\n')[0]

        const code = document.createElement('span')
        code.className = 'problem-code'
        code.textContent = markerCode(marker)

        const where = document.createElement('span')
        where.className = 'problem-where'
        where.textContent = `Ln ${marker.startLineNumber}, Col ${marker.startColumn}`

        row.append(severityIcon(marker.severity), message, code, where)
        row.addEventListener('click', () => {
          list.querySelector('.problem-row.selected')?.classList.remove('selected')
          row.classList.add('selected')
          openLocation(filePath, {
            startLineNumber: marker.startLineNumber,
            startColumn: marker.startColumn,
            endLineNumber: marker.endLineNumber,
            endColumn: marker.endColumn,
          })
        })
        group.append(row)
      }
      list.append(group)
    }
    list.scrollTop = scrollTop
  }

  const setVisible = (show: boolean) => {
    visible = show && !!getPluginId()
    panel.hidden = !visible
    problemsBtn.classList.toggle('active', visible)
    render()
  }

  const toggle = () => setVisible(!visible)

  problemsBtn.addEventListener('click', toggle)
  document.getElementById('problems-close-btn')!.addEventListener('click', () => setVisible(false))

  for (const button of filterButtons) {
    button.addEventListener('click', () => {
      filter = button.dataset.problemsFilter === 'errors' ? 'errors' : 'all'
      filterButtons.forEach(b => b.classList.toggle('active', b === button))
      render()
    })
  }

  // Ctrl+Shift+M, as in VS Code. Capture phase, so it wins over Monaco.
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'm') {
      e.preventDefault()
      e.stopPropagation()
      toggle()
    }
  }, true)

  // Drag the top edge to resize
  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = panel.offsetHeight
    const max = (panel.parentElement?.offsetHeight ?? 600) - 120
    resizer.classList.add('resizing')
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
    const move = (ev: MouseEvent) => {
      panel.style.height = `${Math.max(80, Math.min(max, startHeight + startY - ev.clientY))}px`
    }
    const up = () => {
      resizer.classList.remove('resizing')
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  })

  // Markers settle a moment after typing; batch redraws to one per frame.
  let pending = false
  monaco.editor.onDidChangeMarkers(() => {
    if (!visible || pending) return
    pending = true
    requestAnimationFrame(() => {
      pending = false
      render()
    })
  })

  return {
    toggle,
    /** The open plugin changed: redraw, or hide when none is open. */
    refresh: () => setVisible(visible),
  }
}
