/**
 * Search across the open plugin's files (Ctrl+Shift+F): the sidebar's second
 * view, beside Files. It searches the editor's models, so unsaved edits are
 * found too, and can replace every match (undoable per file with Ctrl+Z).
 */
import * as monaco from 'monaco-editor'
import * as FileIcons from 'file-icons-js'
import {confirmDialog} from './dialogs'
import {matchPreview, patternError, replacementFor, type SearchOptions} from './searchText'

export interface SearchPanelOptions {
  /** Every file of the open plugin with its model, in path order; empty when none is open. */
  getModels: () => Array<[string, monaco.editor.ITextModel]>
  openMatch: (filePath: string, range: monaco.IRange) => void
  /** Text selected in the active editor, to search for when opened. */
  getSelection: () => string
  updateStatus: (message: string, type: 'normal' | 'success' | 'error') => void
}

/** Monaco's own word separators, for "whole word". */
const WORD_SEPARATORS = '`~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?'
/** Stop listing after this many matches; the summary says so. */
const MATCH_LIMIT = 2000

interface FileMatches {
  path: string
  model: monaco.editor.ITextModel
  matches: monaco.editor.FindMatch[]
}

export function setupSearchPanel({getModels, openMatch, getSelection, updateStatus}: SearchPanelOptions) {
  const view = document.getElementById('search-view')!
  const fileList = document.getElementById('file-list')!
  const treeActions = document.getElementById('file-tree-actions')!
  const input = document.getElementById('search-input') as HTMLInputElement
  const replaceInput = document.getElementById('replace-input') as HTMLInputElement
  const replaceAllBtn = document.getElementById('replace-all-btn') as HTMLButtonElement
  const summary = document.getElementById('search-summary')!
  const results = document.getElementById('search-results')!
  const viewButtons = [...document.querySelectorAll<HTMLButtonElement>('.sidebar-view')]
  const optionButtons = [...view.querySelectorAll<HTMLButtonElement>('[data-search-option]')]

  const options: SearchOptions = {matchCase: false, wholeWord: false, regex: false}
  const collapsed = new Set<string>()
  let visible = false
  let found: FileMatches[] = []

  // ── Searching ────────────────────────────────────────────────────────

  const search = (): FileMatches[] => {
    const query = input.value
    if (!query || patternError(query, options)) return []
    const out: FileMatches[] = []
    let total = 0
    for (const [path, model] of getModels()) {
      if (model.isDisposed()) continue
      const matches = model.findMatches(
        query, false, options.regex, options.matchCase,
        options.wholeWord ? WORD_SEPARATORS : null, false, MATCH_LIMIT - total
      )
      if (matches.length === 0) continue
      out.push({path, model, matches})
      total += matches.length
      if (total >= MATCH_LIMIT) break
    }
    return out
  }

  const render = () => {
    if (!visible) return
    found = search()
    const scrollTop = results.scrollTop
    results.replaceChildren()

    const query = input.value
    const error = query ? patternError(query, options) : null
    const total = found.reduce((sum, f) => sum + f.matches.length, 0)
    summary.classList.toggle('error', !!error)
    summary.textContent = error
      ? error
      : !query ? ''
      : total === 0 ? 'No results'
      : `${total >= MATCH_LIMIT ? `${MATCH_LIMIT}+` : total} ${total === 1 ? 'result' : 'results'} in ${found.length} ${found.length === 1 ? 'file' : 'files'}`
    replaceAllBtn.disabled = total === 0

    for (const {path, model, matches} of found) {
      const group = document.createElement('div')
      group.className = 'search-file'
      if (collapsed.has(path)) group.classList.add('collapsed')

      const head = document.createElement('div')
      head.className = 'search-file__head'
      head.title = path
      head.innerHTML = '<svg class="icon icon--xs search-chevron" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>'
      const slash = path.lastIndexOf('/')
      const icon = document.createElement('span')
      icon.className = FileIcons.getClassWithColor(path) ?? ''
      const name = document.createElement('span')
      name.className = 'search-file__name'
      name.textContent = path.slice(slash + 1)
      const dir = document.createElement('span')
      dir.className = 'search-file__dir'
      dir.textContent = slash >= 0 ? path.slice(0, slash) : ''
      const count = document.createElement('span')
      count.className = 'search-file__count'
      count.textContent = String(matches.length)
      head.append(icon, name, dir, count)
      head.addEventListener('click', () => {
        if (collapsed.has(path)) collapsed.delete(path)
        else collapsed.add(path)
        group.classList.toggle('collapsed')
      })
      group.append(head)

      for (const {range} of matches) {
        const line = model.getLineContent(range.startLineNumber)
        const endColumn = range.endLineNumber === range.startLineNumber ? range.endColumn : line.length + 1
        const preview = matchPreview(line, range.startColumn, endColumn)

        const row = document.createElement('div')
        row.className = 'search-match'
        row.title = `Ln ${range.startLineNumber}, Col ${range.startColumn}`
        const before = document.createElement('span')
        before.textContent = preview.before
        const hit = document.createElement('mark')
        hit.textContent = preview.match
        const after = document.createElement('span')
        after.textContent = preview.after
        row.append(before, hit, after)
        row.addEventListener('click', () => {
          results.querySelector('.search-match.selected')?.classList.remove('selected')
          row.classList.add('selected')
          openMatch(path, range)
        })
        group.append(row)
      }
      results.append(group)
    }
    results.scrollTop = scrollTop
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  /** Search again shortly (typing, edits); a burst of changes searches once. */
  const schedule = (delay = 150) => {
    if (!visible) return
    clearTimeout(timer)
    timer = setTimeout(render, delay)
  }

  // ── Replacing ────────────────────────────────────────────────────────

  const replaceAll = async () => {
    const query = input.value
    const matches = search()
    const total = matches.reduce((sum, f) => sum + f.matches.length, 0)
    if (total === 0) return
    if (total >= MATCH_LIMIT) {
      updateStatus(`Over ${MATCH_LIMIT} matches; narrow the search before replacing`, 'error')
      return
    }
    const fileCount = matches.length
    const ok = await confirmDialog(
      'Replace all',
      `Replace ${total} ${total === 1 ? 'match' : 'matches'} of "${query}" in ${fileCount} ${fileCount === 1 ? 'file' : 'files'} with "${replaceInput.value}"? Ctrl+Z in each file undoes it.`,
      'Replace',
      'primary'
    )
    if (!ok) return

    for (const {model, matches: fileMatches} of matches) {
      if (model.isDisposed()) continue
      model.pushStackElement()
      model.pushEditOperations([], fileMatches.map(({range}) => ({
        range,
        text: replacementFor(model.getValueInRange(range), query, replaceInput.value, options),
      })), () => null)
      model.pushStackElement()
    }
    updateStatus(`Replaced ${total} ${total === 1 ? 'match' : 'matches'} in ${fileCount} ${fileCount === 1 ? 'file' : 'files'}`, 'success')
    render()
  }

  // ── Showing ──────────────────────────────────────────────────────────

  const showView = (which: 'files' | 'search') => {
    visible = which === 'search'
    view.hidden = !visible
    fileList.hidden = visible
    treeActions.hidden = visible
    viewButtons.forEach(b => b.classList.toggle('active', b.dataset.view === which))
    if (visible) render()
  }

  /** Open Search with the editor's selection (one line of it) as the query. */
  const focusSearch = () => {
    const selected = getSelection()
    if (selected && !selected.includes('\n')) input.value = selected
    showView('search')
    input.focus()
    input.select()
  }

  viewButtons.forEach(b => b.addEventListener('click', () => {
    if (b.dataset.view === 'search') focusSearch()
    else showView('files')
  }))

  optionButtons.forEach(b => b.addEventListener('click', () => {
    const key = b.dataset.searchOption as keyof SearchOptions
    options[key] = !options[key]
    b.classList.toggle('active', options[key])
    render()
    input.focus()
  }))

  input.addEventListener('input', () => schedule())
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      render()
      results.querySelector<HTMLElement>('.search-match')?.click()
    } else if (e.key === 'Escape') {
      showView('files')
    }
  })
  replaceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      void replaceAll()
    }
  })
  replaceAllBtn.addEventListener('click', () => void replaceAll())

  // Ctrl+Shift+F searches, Ctrl+Shift+E back to the files. Capture phase, so it wins over Monaco.
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey) return
    const key = e.key.toLowerCase()
    if (key === 'f') {
      e.preventDefault()
      e.stopPropagation()
      focusSearch()
    } else if (key === 'e') {
      e.preventDefault()
      e.stopPropagation()
      showView('files')
    }
  }, true)

  return {
    /** A file's text changed: refresh the results if they show. */
    contentChanged: () => schedule(300),
    /** Another plugin opened, or none: start over in the file list. */
    reset: () => {
      found = []
      collapsed.clear()
      results.replaceChildren()
      summary.textContent = ''
      showView('files')
    },
  }
}
