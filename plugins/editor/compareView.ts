/**
 * Compare a file with its saved version or an older one from the local
 * history: a diff in place of the editors, the versions listed beside it.
 * The right side is the live file and stays editable; "Restore" puts an old
 * version back as one edit, so Ctrl+Z undoes it.
 */
import * as monaco from 'monaco-editor'
import * as FileIcons from 'file-icons-js'
import {listVersions} from './localHistory'
import {formatAgo} from './utils'
import {getEditorPrefs, getSavedTheme} from './monaco/themes'

export interface CompareViewOptions {
  getPluginId: () => string | null
  /** The live model of a plugin file. */
  getModel: (path: string) => monaco.editor.ITextModel | null
  /** The file as last saved, and when; null for a file never saved. */
  loadSaved: (pluginId: string, path: string) => Promise<{ content: string; time: number } | null>
  /** A version was put back into the file. */
  onRestored: (path: string, label: string) => void
  /** The view closed and the editors show again. */
  onClosed: () => void
}

interface Version {
  label: string
  time: number | null
  content: string
}

/** Which version to show first: the saved one, or the latest that differs from the file. */
export type CompareStart = 'saved' | 'previous'

export function setupCompareView({getPluginId, getModel, loadSaved, onRestored, onClosed}: CompareViewOptions) {
  const view = document.getElementById('compare-view')!
  const groupsHost = document.getElementById('editor-groups')!
  const list = document.getElementById('compare-versions')!
  const diffHost = document.getElementById('compare-diff')!
  const title = document.getElementById('compare-title')!
  const subtitle = document.getElementById('compare-subtitle')!
  const restoreBtn = document.getElementById('compare-restore-btn') as HTMLButtonElement
  const layoutButtons = [...view.querySelectorAll<HTMLButtonElement>('[data-compare-layout]')]

  let diffEditor: monaco.editor.IStandaloneDiffEditor | null = null
  let original: monaco.editor.ITextModel | null = null
  let live: monaco.editor.ITextModel | null = null
  let livePath: string | null = null
  let versions: Version[] = []
  let selected = 0
  let sideBySide = true
  let listeners: monaco.IDisposable[] = []
  /** Bumped by every open, so a slow load for an earlier one is dropped. */
  let generation = 0
  let modelCount = 0

  const ensureEditor = () => {
    if (diffEditor) return diffEditor
    diffEditor = monaco.editor.createDiffEditor(diffHost, {
      automaticLayout: true,
      originalEditable: false,
      readOnly: false,
      renderSideBySide: sideBySide,
      useInlineViewWhenSpaceIsLimited: true,
      theme: getSavedTheme(),
      fontSize: getEditorPrefs().fontSize,
      minimap: {enabled: false},
      renderOverviewRuler: true,
      ignoreTrimWhitespace: false,
      // Its per-change revert arrows draw from the last diff while a new
      // version loads and throw; Restore covers putting text back.
      renderGutterMenu: false,
    })
    return diffEditor
  }

  const describe = (version: Version) =>
    version.label === 'Last saved'
      ? 'the saved version'
      : `the version from ${version.time ? new Date(version.time).toLocaleString() : 'earlier'}`

  const renderList = () => {
    list.replaceChildren()
    if (versions.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'compare-empty'
      empty.textContent = 'Not saved yet, so there is nothing to compare with.'
      list.append(empty)
      return
    }
    const current = live?.getValue()
    versions.forEach((version, index) => {
      const item = document.createElement('button')
      item.className = 'compare-version'
      if (index === selected) item.classList.add('selected')
      const label = document.createElement('span')
      label.className = 'compare-version__label'
      label.textContent = version.label
      const when = document.createElement('span')
      when.className = 'compare-version__time'
      when.textContent = version.time ? new Date(version.time).toLocaleString() : ''
      item.append(label, when)
      if (version.content === current) {
        const same = document.createElement('span')
        same.className = 'compare-version__same'
        same.textContent = 'same as now'
        item.append(same)
      }
      item.addEventListener('click', () => select(index))
      list.append(item)
    })
  }

  const renderHeader = () => {
    const version = versions[selected]
    const modified = !!version && live?.getValue() !== version.content
    subtitle.textContent = version
      ? `${describe(version)} ↔ the file now${modified ? '' : ' (no differences)'}`
      : 'the file now'
    restoreBtn.disabled = !version || !modified
  }

  /**
   * A fresh model per version: swapping the text of the one shown leaves the
   * diff's gutter drawing stale line numbers for a moment, and Monaco throws.
   */
  const showVersion = (index: number) => {
    if (!live || !diffEditor) return
    const previous = original
    original = monaco.editor.createModel(versions[index]?.content ?? '', live.getLanguageId(),
      monaco.Uri.parse(`inmemory://history/${++modelCount}/${livePath}`))
    diffEditor.setModel({original, modified: live})
    previous?.dispose()
  }

  const select = (index: number) => {
    selected = index
    showVersion(index)
    renderList()
    renderHeader()
  }

  const close = () => {
    generation++
    if (view.hidden) return
    listeners.forEach(l => l.dispose())
    listeners = []
    diffEditor?.setModel(null)
    original?.dispose()
    original = null
    live = null
    livePath = null
    view.hidden = true
    groupsHost.hidden = false
    onClosed()
  }

  /** Open the comparison for a plugin file. */
  const open = async (path: string, start: CompareStart = 'saved') => {
    const pluginId = getPluginId()
    const model = getModel(path)
    if (!pluginId || !model) return
    close()
    const opened = ++generation

    const [saved, history] = await Promise.all([
      loadSaved(pluginId, path),
      listVersions(pluginId, path).catch(() => []),
    ])
    if (opened !== generation || model.isDisposed()) return

    // The saved text first, then older versions (the saved one listed once)
    versions = []
    if (saved) versions.push({label: 'Last saved', time: history.find(v => v.content === saved.content)?.time ?? saved.time, content: saved.content})
    let skippedSaved = false
    for (const version of history) {
      if (saved && !skippedSaved && version.content === saved.content) {
        skippedSaved = true
        continue
      }
      versions.push({label: formatAgo(version.time, true), time: version.time, content: version.content})
    }

    const current = model.getValue()
    selected = start === 'previous' ? Math.max(0, versions.findIndex(v => v.content !== current)) : 0

    live = model
    livePath = path

    const slash = path.lastIndexOf('/')
    title.replaceChildren()
    const icon = document.createElement('span')
    icon.className = FileIcons.getClassWithColor(path) ?? ''
    const name = document.createElement('strong')
    name.textContent = path.slice(slash + 1)
    const dir = document.createElement('span')
    dir.className = 'compare-title__dir'
    dir.textContent = slash >= 0 ? path.slice(0, slash) : ''
    title.append(icon, name, dir)

    groupsHost.hidden = true
    view.hidden = false
    const editor = ensureEditor()
    editor.updateOptions({fontSize: getEditorPrefs().fontSize})
    showVersion(selected)
    listeners = [
      model.onDidChangeContent(() => {
        renderHeader()
        renderList()
      }),
      model.onWillDispose(close),
    ]
    renderList()
    renderHeader()
    editor.getModifiedEditor().focus()
  }

  restoreBtn.addEventListener('click', () => {
    const version = versions[selected]
    if (!live || !version || !livePath) return
    live.pushStackElement()
    live.pushEditOperations([], [{range: live.getFullModelRange(), text: version.content}], () => null)
    live.pushStackElement()
    onRestored(livePath, describe(version))
    // The button disables itself now; keep the keyboard in the view
    diffEditor?.getModifiedEditor().focus()
  })

  document.getElementById('compare-close-btn')!.addEventListener('click', close)
  document.getElementById('compare-prev-btn')!.addEventListener('click', () => diffEditor?.goToDiff('previous'))
  document.getElementById('compare-next-btn')!.addEventListener('click', () => diffEditor?.goToDiff('next'))
  layoutButtons.forEach(button => button.addEventListener('click', () => {
    sideBySide = button.dataset.compareLayout === 'side'
    layoutButtons.forEach(b => b.classList.toggle('active', b === button))
    diffEditor?.updateOptions({renderSideBySide: sideBySide})
  }))
  // Escape closes, unless Monaco used it first (closing find or suggestions)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.defaultPrevented && !view.hidden && !document.querySelector('.modal-overlay.active')) close()
  })

  return {
    open,
    close,
    isOpen: () => !view.hidden,
  }
}
