/**
 * Editor groups: one or two Monaco editors side by side, each with a strip
 * of tabs for the files open in it. The layout itself (tabState.ts) is plain
 * data; this module keeps the page and the editors in step with it.
 * session.ts owns the plugin and its models and drives this module through
 * `setupEditorGroups`' hooks.
 */
import * as monaco from 'monaco-editor'
import * as FileIcons from 'file-icons-js'
import {
  closeTab,
  dropEmptyGroups,
  emptyLayout,
  MAX_GROUPS,
  moveTab,
  openTab,
  renamePath,
  retainPaths,
  type TabLayout,
} from './tabState'

export interface EditorGroupsHooks {
  /** The model to show for a tab, or null when its file is gone. */
  resolveModel(path: string): monaco.editor.ITextModel | null
  isReadOnly(path: string): boolean
  isModified(path: string): boolean
  /** The shown file or the active group changed, or tabs were added, closed or moved. */
  onChange(): void
  createEditor(container: HTMLElement): monaco.editor.IStandaloneCodeEditor
  /** What a tab shows: the file name, and a hint (its folder) when names clash. */
  tabLabel(path: string): { name: string; detail?: string; readOnly?: boolean }
}

interface GroupView {
  root: HTMLElement
  tabList: HTMLElement
  host: HTMLElement
  empty: HTMLElement
  editor: monaco.editor.IStandaloneCodeEditor
  viewStates: Map<string, monaco.editor.ICodeEditorViewState | null>
  shown: string | null
}

const TAB_DRAG_TYPE = 'application/x-editor-tab'

let container: HTMLElement
let hooks: EditorGroupsHooks
let layout: TabLayout = emptyLayout()
const views: GroupView[] = []
/** Width of the first group, as a share of both, while split. */
let splitRatio = 0.5

let tabMenu: HTMLElement | null = null

// ── Setup ──────────────────────────────────────────────────────────────

export function setupEditorGroups(host: HTMLElement, groupHooks: EditorGroupsHooks) {
  container = host
  hooks = groupHooks
  container.classList.add('editor-groups')
  ensureViews()
  render()
}

function createView(index: number): GroupView {
  const root = document.createElement('div')
  root.className = 'editor-group'

  const strip = document.createElement('div')
  strip.className = 'editor-tabs'
  const tabList = document.createElement('div')
  tabList.className = 'editor-tabs-list'
  const actions = document.createElement('div')
  actions.className = 'editor-tabs-actions'
  strip.append(tabList, actions)

  const body = document.createElement('div')
  body.className = 'editor-group-body'
  const editorHost = document.createElement('div')
  editorHost.className = 'editor-host'
  const empty = document.createElement('div')
  empty.className = 'editor-empty'
  empty.innerHTML = '<div class="editor-empty__inner"><strong>No file open</strong><span>Pick a file from the tree, or press <kbd>Ctrl P</kbd></span></div>'
  body.append(editorHost, empty)
  root.append(strip, body)

  const editor = hooks.createEditor(editorHost)
  const view: GroupView = { root, tabList, host: editorHost, empty, editor, viewStates: new Map(), shown: null }

  editor.onDidFocusEditorWidget(() => activateGroup(views.indexOf(view)))
  root.addEventListener('mousedown', () => activateGroup(views.indexOf(view)), true)

  // Dropping on the strip's free space appends the tab to this group.
  tabList.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes(TAB_DRAG_TYPE)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    tabList.classList.add('drag-over')
  })
  tabList.addEventListener('dragleave', (e) => {
    if (!tabList.contains(e.relatedTarget as Node)) tabList.classList.remove('drag-over')
  })
  tabList.addEventListener('drop', (e) => {
    tabList.classList.remove('drag-over')
    const dragged = readDrag(e)
    if (!dragged) return
    e.preventDefault()
    moveTab(layout, dragged.group, dragged.path, views.indexOf(view))
    render()
  })

  // Dropping on the editor of the only group opens a split with the tab.
  body.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes(TAB_DRAG_TYPE)) return
    e.preventDefault()
    body.classList.add('drag-over')
  })
  body.addEventListener('dragleave', (e) => {
    if (!body.contains(e.relatedTarget as Node)) body.classList.remove('drag-over')
  })
  body.addEventListener('drop', (e) => {
    body.classList.remove('drag-over')
    const dragged = readDrag(e)
    if (!dragged) return
    e.preventDefault()
    const target = views.indexOf(view)
    if (target === dragged.group && layout.groups.length < MAX_GROUPS) {
      layout.groups.push({ tabs: [], active: null })
      moveTab(layout, dragged.group, dragged.path, layout.groups.length - 1)
    } else {
      moveTab(layout, dragged.group, dragged.path, target)
    }
    render()
  })

  // Split / close-group buttons
  const splitBtn = iconButton('Split editor right (Ctrl+\\)', '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 3v18"/>')
  splitBtn.classList.add('editor-split-btn')
  splitBtn.addEventListener('click', () => splitRight(views.indexOf(view)))
  const closeBtn = iconButton('Close group', '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>')
  closeBtn.classList.add('editor-close-group-btn')
  closeBtn.addEventListener('click', () => closeGroup(views.indexOf(view)))
  actions.append(splitBtn, closeBtn)

  root.dataset.group = String(index)
  return view
}

function iconButton(title: string, paths: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.className = 'icon-btn'
  button.title = title
  button.innerHTML = `<svg class="icon icon--sm" viewBox="0 0 24 24">${paths}</svg>`
  return button
}

function readDrag(e: DragEvent): { group: number; path: string } | null {
  const raw = e.dataTransfer?.getData(TAB_DRAG_TYPE)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed?.path === 'string' && typeof parsed?.group === 'number' ? parsed : null
  } catch {
    return null
  }
}

/** One view per group, in order; spare editors are disposed. */
function ensureViews() {
  while (views.length < layout.groups.length) views.push(createView(views.length))
  while (views.length > layout.groups.length) {
    const view = views.pop()!
    view.editor.dispose()
    view.root.remove()
  }
}

// ── Queries ────────────────────────────────────────────────────────────

export function activeEditor(): monaco.editor.IStandaloneCodeEditor | null {
  return views[layout.activeGroup]?.editor ?? null
}

/** The file shown in the active group. */
export function activePath(): string | null {
  return layout.groups[layout.activeGroup]?.active ?? null
}

export function allEditors(): monaco.editor.IStandaloneCodeEditor[] {
  return views.map(view => view.editor)
}

/** A copy of the layout, for storing. */
export function getLayout(): TabLayout {
  return JSON.parse(JSON.stringify(layout))
}

export function isOpen(path: string): boolean {
  return layout.groups.some(group => group.tabs.includes(path))
}

// ── Changes ────────────────────────────────────────────────────────────

/** Replace the whole layout (a plugin was opened or closed). */
export function resetLayout(next: TabLayout) {
  for (const view of views) {
    view.viewStates.clear()
    view.shown = null
  }
  layout = next
  dropEmptyGroups(layout)
  lastSignature = '' // the session follows even an identical layout of another plugin
  render()
}

/**
 * Show `path` in a group: the active one, or 'side' for the other one
 * (opening a split when there is none).
 */
export function openFile(path: string, target: 'active' | 'side' | number = 'active') {
  let index = typeof target === 'number' ? target : layout.activeGroup
  if (target === 'side') {
    if (layout.groups.length < MAX_GROUPS) layout.groups.push({ tabs: [], active: null })
    index = layout.activeGroup === 0 ? 1 : 0
  }
  index = Math.max(0, Math.min(index, layout.groups.length - 1))
  openTab(layout.groups[index], path)
  layout.activeGroup = index
  render()
}

/** The group showing this editor becomes the active one. */
export function activateEditor(editor: monaco.editor.ICodeEditor) {
  const index = views.findIndex(view => view.editor === editor)
  if (index >= 0) activateGroup(index)
}

function activateGroup(index: number) {
  if (index < 0 || index === layout.activeGroup || index >= layout.groups.length) return
  layout.activeGroup = index
  render()
}

export function closeFile(groupIndex: number, path: string) {
  const group = layout.groups[groupIndex]
  if (!group) return
  closeTab(group, path)
  views[groupIndex]?.viewStates.delete(path)
  dropEmptyGroups(layout)
  render()
}

function closeOthers(groupIndex: number, keep: string) {
  const group = layout.groups[groupIndex]
  if (!group) return
  group.tabs = group.tabs.filter(p => p === keep)
  group.active = keep
  layout.activeGroup = groupIndex
  render()
}

function closeToRight(groupIndex: number, path: string) {
  const group = layout.groups[groupIndex]
  if (!group) return
  const index = group.tabs.indexOf(path)
  const closed = group.tabs.splice(index + 1)
  if (group.active && closed.includes(group.active)) group.active = path
  render()
}

export function closeGroup(groupIndex: number) {
  const group = layout.groups[groupIndex]
  if (!group) return
  group.tabs = []
  group.active = null
  dropEmptyGroups(layout)
  render()
}

/** Open the active file of a group in a second group beside it. */
export function splitRight(groupIndex = layout.activeGroup) {
  const path = layout.groups[groupIndex]?.active
  if (!path) return
  if (layout.groups.length < MAX_GROUPS) layout.groups.push({ tabs: [], active: null })
  const target = groupIndex === 0 ? 1 : 0
  const from = views[groupIndex]
  openTab(layout.groups[target], path)
  layout.activeGroup = target
  render()
  // Same spot in the new editor
  const state = from?.editor.saveViewState()
  if (state) views[target]?.editor.restoreViewState(state)
  views[target]?.editor.focus()
}

export function renameFile(oldPath: string, newPath: string) {
  renamePath(layout, oldPath, newPath)
  for (const view of views) {
    if (view.viewStates.has(oldPath)) {
      view.viewStates.set(newPath, view.viewStates.get(oldPath)!)
      view.viewStates.delete(oldPath)
    }
    // The old model is gone; show the new one.
    if (view.shown === oldPath) view.shown = null
  }
  render()
}

/** Close tabs whose file is gone, then redraw (dirty marks may have changed). */
export function sync(exists: (path: string) => boolean) {
  retainPaths(layout, exists)
  render()
}

// ── Rendering ──────────────────────────────────────────────────────────

let lastSignature = ''

function render() {
  if (!container) return
  ensureViews()

  // Groups and the split handle, in order
  const children: HTMLElement[] = []
  views.forEach((view, index) => {
    if (index > 0) children.push(splitter())
    children.push(view.root)
  })
  if (children.some((child, i) => container.children[i] !== child) || container.children.length !== children.length) {
    container.replaceChildren(...children)
  }
  applySplitRatio()

  views.forEach((view, index) => {
    const group = layout.groups[index]
    view.root.dataset.group = String(index)
    view.root.classList.toggle('active', index === layout.activeGroup)
    view.root.classList.toggle('split', views.length > 1)
    renderTabs(view, index)
    showActive(view, group.active)
  })

  // Tell the session only when something it follows changed.
  const signature = JSON.stringify(layout)
  if (signature !== lastSignature) {
    lastSignature = signature
    hooks.onChange()
  }
}

function showActive(view: GroupView, path: string | null) {
  const model = path ? hooks.resolveModel(path) : null
  view.empty.hidden = !!model
  view.host.style.visibility = model ? '' : 'hidden'

  if (view.shown === path && view.editor.getModel() === model) return
  if (view.shown && view.editor.getModel()) {
    view.viewStates.set(view.shown, view.editor.saveViewState())
  }
  view.shown = path
  view.editor.setModel(model)
  if (!model || !path) return
  view.editor.updateOptions({ readOnly: hooks.isReadOnly(path) })
  const saved = view.viewStates.get(path)
  if (saved) view.editor.restoreViewState(saved)
}

let splitterEl: HTMLElement | null = null

function splitter(): HTMLElement {
  if (splitterEl) return splitterEl
  const handle = document.createElement('div')
  handle.className = 'editor-split-resizer'
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault()
    const rect = container.getBoundingClientRect()
    handle.classList.add('resizing')
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
    const move = (ev: MouseEvent) => {
      splitRatio = Math.min(0.85, Math.max(0.15, (ev.clientX - rect.left) / rect.width))
      applySplitRatio()
    }
    const up = () => {
      handle.classList.remove('resizing')
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  })
  handle.addEventListener('dblclick', () => {
    splitRatio = 0.5
    applySplitRatio()
  })
  splitterEl = handle
  return handle
}

function applySplitRatio() {
  if (views.length < 2) {
    views[0]?.root.style.removeProperty('flex')
    return
  }
  views[0].root.style.flex = `${splitRatio} 1 0`
  views[1].root.style.flex = `${1 - splitRatio} 1 0`
}

function renderTabs(view: GroupView, groupIndex: number) {
  const group = layout.groups[groupIndex]
  view.tabList.replaceChildren()

  for (const path of group.tabs) {
    const label = hooks.tabLabel(path)
    const tab = document.createElement('div')
    tab.className = 'editor-tab'
    tab.dataset.path = path
    tab.title = path
    tab.draggable = true
    if (path === group.active) tab.classList.add('active')
    if (hooks.isModified(path)) tab.classList.add('modified')
    if (label.readOnly) tab.classList.add('readonly')

    const icon = document.createElement('span')
    icon.className = `editor-tab__icon ${FileIcons.getClassWithColor(label.name) ?? ''}`

    const name = document.createElement('span')
    name.className = 'editor-tab__name'
    name.textContent = label.name

    tab.append(icon, name)
    if (label.detail) {
      const detail = document.createElement('span')
      detail.className = 'editor-tab__detail'
      detail.textContent = label.detail
      tab.append(detail)
    }

    const close = document.createElement('button')
    close.className = 'editor-tab__close'
    close.title = 'Close'
    close.innerHTML = '<span class="editor-tab__dot"></span><svg class="icon icon--xs" viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
    close.addEventListener('click', (e) => {
      e.stopPropagation()
      closeFile(groupIndex, path)
    })
    tab.append(close)

    tab.addEventListener('mousedown', (e) => {
      if (e.button === 1) e.preventDefault() // no autoscroll on middle click
    })
    tab.addEventListener('auxclick', (e) => {
      if (e.button === 1) {
        e.preventDefault()
        closeFile(groupIndex, path)
      }
    })
    tab.addEventListener('click', () => {
      openTab(group, path)
      layout.activeGroup = groupIndex
      render()
      view.editor.focus()
    })
    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      showTabMenu(e.clientX, e.clientY, groupIndex, path)
    })

    tab.addEventListener('dragstart', (e) => {
      e.dataTransfer!.effectAllowed = 'move'
      e.dataTransfer!.setData(TAB_DRAG_TYPE, JSON.stringify({ group: groupIndex, path }))
      tab.classList.add('dragging')
    })
    tab.addEventListener('dragend', () => tab.classList.remove('dragging'))
    tab.addEventListener('dragover', (e) => {
      if (!e.dataTransfer?.types.includes(TAB_DRAG_TYPE)) return
      e.preventDefault()
      e.stopPropagation()
      tab.classList.add('drop-before')
    })
    tab.addEventListener('dragleave', () => tab.classList.remove('drop-before'))
    tab.addEventListener('drop', (e) => {
      tab.classList.remove('drop-before')
      const dragged = readDrag(e)
      if (!dragged) return
      e.preventDefault()
      e.stopPropagation()
      moveTab(layout, dragged.group, dragged.path, groupIndex, group.tabs.indexOf(path))
      render()
    })

    view.tabList.append(tab)
  }

  view.tabList.querySelector<HTMLElement>('.editor-tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

// ── Tab context menu ───────────────────────────────────────────────────

function showTabMenu(x: number, y: number, groupIndex: number, path: string) {
  hideTabMenu()
  const group = layout.groups[groupIndex]
  const other = groupIndex === 0 ? 1 : 0
  const items: Array<[string, () => void] | null> = [
    ['Close', () => closeFile(groupIndex, path)],
    ['Close Others', () => closeOthers(groupIndex, path)],
    ['Close to the Right', () => closeToRight(groupIndex, path)],
    ['Close All', () => closeGroup(groupIndex)],
    null,
    layout.groups.length > 1
      ? [groupIndex === 0 ? 'Move to Right Group' : 'Move to Left Group', () => { moveTab(layout, groupIndex, path, other); render() }]
      : ['Split Right', () => { openTab(group, path); splitRight(groupIndex) }],
    ['Copy Path', () => { void navigator.clipboard?.writeText(path) }],
  ]

  const menu = document.createElement('div')
  menu.className = 'context-menu editor-tab-menu'
  for (const item of items) {
    const el = document.createElement('div')
    if (!item) {
      el.className = 'context-menu-separator'
    } else {
      el.className = 'context-menu-item'
      el.textContent = item[0]
      el.addEventListener('click', () => {
        hideTabMenu()
        item[1]()
      })
    }
    menu.append(el)
  }
  menu.style.left = `${x}px`
  menu.style.top = `${y}px`
  menu.style.display = 'block'
  document.body.append(menu)
  tabMenu = menu

  // Keep it on screen
  const rect = menu.getBoundingClientRect()
  if (rect.right > window.innerWidth) menu.style.left = `${Math.max(0, window.innerWidth - rect.width - 4)}px`
  if (rect.bottom > window.innerHeight) menu.style.top = `${Math.max(0, window.innerHeight - rect.height - 4)}px`

  setTimeout(() => {
    document.addEventListener('mousedown', onOutside, true)
    window.addEventListener('blur', hideTabMenu)
  }, 0)
}

function onOutside(e: MouseEvent) {
  if (tabMenu && !tabMenu.contains(e.target as Node)) hideTabMenu()
}

function hideTabMenu() {
  tabMenu?.remove()
  tabMenu = null
  document.removeEventListener('mousedown', onOutside, true)
  window.removeEventListener('blur', hideTabMenu)
}
