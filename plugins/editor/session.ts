/**
 * The open plugin: its files, Monaco models, unsaved state, and loading,
 * switching, saving and closing it. Every other part of the editor works
 * through this module; it reaches back to them only through `sessionHooks`.
 */
import * as monaco from 'monaco-editor'
import type {IPosition, IRange} from 'monaco-editor'
import {getEditorPlugin, migrateLegacyPlugin} from '@client/utils/pluginEditorStorage.ts'
import type {PluginFile} from '@client/utils/pluginEditorStorage.ts'
import type {EditorState} from './types'
import {baselineOf, pathsCoveredBySave, structureChanged} from './savedBaseline'
import {updateStatus} from './utils'
import {bundlePlugin} from './bundler'
import {BUNDLE_MARKER_OWNER, bundleProblems} from './bundleProblems'
import {registerPluginFileLib, updateMonacoFileSystem} from './monaco/typings'
import {registerAutoImportCompletion} from './monaco/autoImportCompletion'
import {registerImportPathCompletion} from './monaco/importPathCompletion'
import {renderFileTree} from './fileTree'
import {showContextMenu, showFolderContextMenu} from './contextMenu'
import {deleteFile, moveFileToDirectory, renameFile} from './fileOperations'
import {adoptStoredPlugin, refreshPluginList, savePlugin, type PluginSummary} from './pluginManagement'
import {getDevServer} from './devServer'
import pluginApiTypes from '../types/index.d.ts?raw'
import {openDialog} from './dialogs'
import {renderWelcome, setWelcomeVisible} from './welcome'
import {setBreadcrumb, setHeaderPlugin, setSaveState} from './chrome'
import * as groups from './editorGroups'
import {emptyLayout, openTab, sanitizeLayout, type TabLayout} from './tabState'
import {moveFileHistory, recordVersions, type HistoryLimits} from './localHistory'
import {getEditorPrefs} from './monaco/themes'

/** What the open plugin tells the rest of the editor. Set once at startup. */
export const sessionHooks = {
  /** A plugin is being opened (its id), or the open one closed (null). */
  followPlugin: (_pluginId: string | null): void => {},
  /** A plugin finished loading. */
  pluginLoaded: (_pluginId: string): void => {},
  /** A save stored these files. */
  saved: async (_pluginId: string, _files: Record<string, PluginFile>): Promise<void> => {},
  refreshStatusBar: (): void => {},
  /** The active editor or the file it shows changed. */
  activeEditorChanged: (): void => {},
  /** A file's text changed (typing, the IDE, a replace). */
  contentChanged: (): void => {},
  /** Open the compare view for a file: against the saved version, or the latest older one. */
  compareFile: (_path: string, _start: 'saved' | 'previous'): void => {},
  /** More entries for a tab's context menu. */
  tabActions: (_path: string): Array<[string, () => void]> => [],
}

// Global editor state
export const state: EditorState = {
  editor: null,
  currentPluginId: null,
  currentFilePath: null,
  currentPlugin: null,
  editorModels: new Map(),
  modifiedFiles: new Set(),
  baseline: null,
  esbuildInitialized: false,
}

// Set while text from the IDE goes in, so it is not mirrored back.
let isReceivingFromIDE = false

// The open plugin's completion providers
let disposeImportPathProvider: (() => void) | null = null
let disposeAutoImportProvider: (() => void) | null = null

// Every plugin the editor can open, for the switcher and the welcome screen
let pluginList: PluginSummary[] = []

export function getPluginList(): readonly PluginSummary[] {
  return pluginList
}

export async function reloadPluginList() {
  pluginList = await refreshPluginList()
  renderWelcome(pluginList, requestOpenPlugin)
}

export function currentPluginLanguage(): 'typescript' | 'javascript' {
  return state.currentPlugin?.entryPoint.endsWith('.ts') ? 'typescript' : 'javascript'
}

/**
 * Unsaved work in the open plugin: edited files, or files and folders added,
 * removed, renamed or moved since it was loaded or saved.
 */
export function isPluginDirty(): boolean {
  if (!state.currentPlugin) return false
  return state.modifiedFiles.size > 0
    || structureChanged(state.currentPlugin.files, state.currentPlugin.folders, state.baseline)
}

/** "unsaved changes in 2 files", or "unsaved file changes" for structure-only edits. */
export function describeUnsaved(): string {
  const count = state.modifiedFiles.size
  if (count === 0) return 'unsaved file changes'
  return `unsaved changes in ${count === 1 ? '1 file' : `${count} files`}`
}

/** Header and save state follow the open plugin and its modified files. */
export function updateDirtyUI() {
  if (!state.currentPlugin) return
  setSaveState(isPluginDirty() ? 'dirty' : 'clean', state.modifiedFiles.size)
}

// Opening, reloading and taking IDE updates into the open plugin each await
// storage or a dialog. They run one at a time, so a second request cannot
// load over a first one halfway through, or patch a plugin being replaced.
let editorQueue: Promise<unknown> = Promise.resolve()

export function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = editorQueue.then(task)
  editorQueue = run.catch(error => console.error('[Editor]', error))
  return run
}

/**
 * Open a plugin from the switcher, the welcome screen or the IDE, asking
 * first when the open one has unsaved changes. Resolves false when the user
 * cancelled.
 */
export function requestOpenPlugin(pluginId: string, source: 'user' | 'ide' = 'user'): Promise<boolean> {
  return exclusive(() => openPlugin(pluginId, source))
}

async function openPlugin(pluginId: string, source: 'user' | 'ide'): Promise<boolean> {
  if (pluginId === state.currentPluginId) return true

  if (isPluginDirty() && state.currentPlugin) {
    const target = pluginList.find(p => p.id === pluginId)?.name ?? pluginId
    const { button } = await openDialog({
      title: 'Unsaved changes',
      message: source === 'ide'
        ? `Your IDE switched to ${target}, but ${state.currentPlugin.name} has ${describeUnsaved()}. Save them first?`
        : `${state.currentPlugin.name} has ${describeUnsaved()}. Save them before opening ${target}?`,
      buttons: [
        { id: 'discard', label: 'Discard', kind: 'danger', start: true },
        { id: 'cancel', label: 'Cancel' },
        { id: 'save', label: 'Save and open', kind: 'primary' },
      ],
    })
    if (button === 'save') {
      if (!(await saveCurrentPlugin())) return false // save failed; stay put
    } else if (button !== 'discard') {
      return false
    }
  }

  await loadPlugin(pluginId)

  if (source === 'user') {
    const devServer = getDevServer()
    if (devServer.getStatus() === 'connected') {
      devServer.sendPluginSelected(pluginId)
    }
  }
  return true
}

/** Keep ?plugin= in the address bar, so a reload reopens the same plugin. */
function syncUrl(pluginId: string | null) {
  const url = new URL(window.location.href)
  if (pluginId) url.searchParams.set('plugin', pluginId)
  else url.searchParams.delete('plugin')
  window.history.replaceState(null, '', url)
}

/** Back to the welcome screen with nothing open. */
export function closePlugin() {
  state.editorModels.forEach(model => model.dispose())
  state.editorModels.clear()
  monaco.editor.getModels().forEach(model => {
    const uriString = model.uri.toString()
    if (uriString.startsWith('file:///') && !uriString.includes('plugin-api')) {
      model.dispose()
    }
  })

  state.currentPluginId = null
  state.currentPlugin = null
  state.currentFilePath = null
  state.modifiedFiles.clear()
  state.baseline = null
  groups.resetLayout(emptyLayout())
  getDevServer().setCurrentPluginId(null)
  sessionHooks.followPlugin(null)

  showDisabledFileTree()
  setHeaderPlugin(null)
  setWelcomeVisible(true)
  syncUrl(null)
  sessionHooks.refreshStatusBar()
}

// File tree render wrapper
function showDisabledFileTree() {
  const fileList = document.getElementById('file-list')!
  fileList.innerHTML = '<div class="file-tree-disabled">No plugin loaded</div>'
}

/**
 * Redraw the file tree, the save state and the tabs (tabs of files that are
 * gone close). Called after every change to the open plugin's files.
 */
export function renderCurrentFileTree() {
  if (!state.currentPlugin) {
    showDisabledFileTree()
    return
  }
  updateDirtyUI()
  drawFileTree()
  groups.sync(path => tabExists(path))
}

function drawFileTree() {
  if (!state.currentPlugin) return
  renderFileTree(state.currentPlugin, state.currentFilePath, state.modifiedFiles, {
    onFileClick: (path) => switchToFile(path, undefined, 'active', true),
    onFileDoubleClick: (path) => {
      switchToFile(path)
      groups.pin(path)
    },
    onFileDelete: async (path) => {
      const success = await deleteFile(
        path,
        state.currentPlugin!,
        state.editorModels,
        updateStatus
      )
      if (success) renderCurrentFileTree()
    },
    onFolderContextMenu: showFolderContextMenu,
    onFileContextMenu: showContextMenu,
    onFileDrop: moveFileToDirectoryWrapper,
  })
}

/**
 * The Monaco model for one file of the open plugin. Typing in it writes
 * through to the plugin's files, marks the file modified and mirrors it to
 * the IDE.
 */
export function createFileModel(pluginId: string, filePath: string, file: PluginFile, registerLib = true): monaco.editor.ITextModel {
  const uri = monaco.Uri.parse(`file:///${pluginId}/${filePath}`)
  // Navigating to an import path can leave a model behind that is not ours;
  // it may be stale, so start fresh from the plugin's files.
  monaco.editor.getModel(uri)?.dispose()

  const model = monaco.editor.createModel(file.content, file.language, uri)
  state.editorModels.set(filePath, model)
  if (registerLib) registerPluginFileLib(pluginId, filePath, file)

  model.onDidChangeContent(() => {
    const current = state.currentPluginId === pluginId ? state.currentPlugin?.files[filePath] : undefined
    if (!current) return
    const content = model.getValue()
    current.content = content
    state.modifiedFiles.add(filePath)
    // An edited preview tab stays open
    if (!isReceivingFromIDE) groups.pin(filePath)
    renderCurrentFileTree()
    sessionHooks.contentChanged()

    // Mirror to the IDE, unless this change came from it
    if (!isReceivingFromIDE) {
      const devServer = getDevServer()
      if (devServer.getStatus() === 'connected') {
        devServer.sendFilePreview(pluginId, filePath, content)
      }
    }

    registerPluginFileLib(pluginId, filePath, current)

    // A bundle error here may be fixed now; the next bundle says again if not.
    if (monaco.editor.getModelMarkers({owner: BUNDLE_MARKER_OWNER, resource: model.uri}).length > 0) {
      monaco.editor.setModelMarkers(model, BUNDLE_MARKER_OWNER, [])
    }
  })
  return model
}

/**
 * Replace a model's text with what the IDE sent, keeping the cursor where it
 * was and without echoing the change back to the IDE.
 */
export function setModelFromIDE(model: monaco.editor.ITextModel, content: string) {
  if (model.getValue() === content) return
  const showing = groups.allEditors()
    .filter(editor => editor.getModel() === model)
    .map(editor => ({ editor, selection: editor.getSelection() }))
  isReceivingFromIDE = true
  try {
    model.setValue(content)
  } finally {
    isReceivingFromIDE = false
  }
  for (const { editor, selection } of showing) {
    if (selection) editor.setSelection(selection)
  }
}

function revealPosition(position?: IPosition | IRange) {
  const editor = groups.activeEditor()
  if (position === undefined || !editor) return
  if ("startLineNumber" in position) {
    editor.setPosition({lineNumber: position.startLineNumber, column: position.startColumn})
    editor.revealLineInCenter(position.startLineNumber)
  } else if ("lineNumber" in position) {
    editor.setPosition(position)
    editor.revealLineInCenter(position.lineNumber)
  }
}

// The read-only plugin API typings, shown when a definition jumps into them.
// They open in a tab of their own under this name.
export const API_TYPES_TAB = '@arkadia/plugin-api.d.ts'
const PLUGIN_API_URI = monaco.Uri.parse("file:plugin-api.ts")

function pluginApiModel(): monaco.editor.ITextModel {
  return monaco.editor.getModel(PLUGIN_API_URI)
    ?? monaco.editor.createModel(pluginApiTypes, "typescript", PLUGIN_API_URI)
}

function tabExists(path: string): boolean {
  return path === API_TYPES_TAB || !!state.currentPlugin?.files[path]
}

/** The model a tab shows, made on first use. */
function modelForTab(path: string): monaco.editor.ITextModel | null {
  if (path === API_TYPES_TAB) return pluginApiModel()
  const file = state.currentPlugin?.files[path]
  if (!file || !state.currentPluginId) return null
  const model = state.editorModels.get(path)
  return model && !model.isDisposed() ? model : createFileModel(state.currentPluginId, path, file)
}

/** "index.ts", with its folder when another open tab has the same name. */
function tabLabel(path: string): { name: string; detail?: string; readOnly?: boolean } {
  if (path === API_TYPES_TAB) return { name: 'plugin-api.d.ts', detail: 'read-only', readOnly: true }
  const slash = path.lastIndexOf('/')
  const name = path.slice(slash + 1)
  const clash = groups.getLayout().groups.some(group =>
    group.tabs.some(other => other !== path && other.slice(other.lastIndexOf('/') + 1) === name)
  )
  return { name, detail: clash && slash >= 0 ? path.slice(0, slash) : undefined }
}

const LAYOUT_KEY = (pluginId: string) => `plugin-editor-tabs:${pluginId}`

function storeLayout() {
  if (!state.currentPluginId) return
  try {
    localStorage.setItem(LAYOUT_KEY(state.currentPluginId), JSON.stringify(groups.getLayout()))
  } catch { /* storage full or blocked: tabs just won't come back */ }
}

function storedLayout(pluginId: string): unknown {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY(pluginId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** Something about the tabs changed: follow the active group's file everywhere. */
function onGroupsChanged() {
  state.editor = groups.activeEditor()
  const path = groups.activePath()
  state.currentFilePath = path && path !== API_TYPES_TAB ? path : null
  // The typings model declares the API a second time; keep it only while shown.
  if (!groups.isOpen(API_TYPES_TAB)) monaco.editor.getModel(PLUGIN_API_URI)?.dispose()
  if (state.currentPlugin) {
    drawFileTree()
    setBreadcrumb(path === API_TYPES_TAB ? 'plugin-api.d.ts' : path)
    storeLayout()
  }
  sessionHooks.refreshStatusBar()
  sessionHooks.activeEditorChanged()
}

/** Set up the editor groups in `host`; `createEditor` makes each group's Monaco editor. */
export function setupEditors(host: HTMLElement, createEditor: (container: HTMLElement) => monaco.editor.IStandaloneCodeEditor) {
  groups.setupEditorGroups(host, {
    resolveModel: modelForTab,
    isReadOnly: path => path === API_TYPES_TAB,
    isModified: path => state.modifiedFiles.has(path),
    tabLabel,
    tabActions: path => sessionHooks.tabActions(path),
    createEditor,
    onChange: onGroupsChanged,
  })
  state.editor = groups.activeEditor()
}

/**
 * Show a file of the open plugin (or the API typings) in the active group,
 * or with `target` 'side' in the group beside it, at `position` if given.
 * With `preview` (a single click, a search result, a jump to a definition)
 * it opens in the group's preview tab, when preview tabs are on.
 */
export function switchToFile(filePath: string, position?: IPosition | IRange, target: 'active' | 'side' = 'active', preview = false) {
  if (!state.currentPlugin || !state.currentPluginId) return
  const asPreview = preview && getEditorPrefs().previewTabs

  // The API typings, under the editor's own name or the npm package's
  if (filePath === API_TYPES_TAB || filePath.startsWith("@types") || filePath.startsWith("@arkadia/")) {
    groups.openFile(API_TYPES_TAB, target, asPreview)
    revealPosition(position)
    return
  }

  if (!state.currentPlugin.files[filePath]) {
    updateStatus(`File not found: ${filePath}`, 'error')
    return
  }

  groups.openFile(filePath, target, asPreview)
  revealPosition(position)
  updateStatus(`Editing: ${filePath}`, 'normal')
}

/** Show a file with `range` selected, as when following a search result. */
export function revealRange(filePath: string, range: IRange, preview = true) {
  switchToFile(filePath, range, 'active', preview)
  const editor = groups.activeEditor()
  if (!editor || editor.getModel() !== state.editorModels.get(filePath)) return
  editor.setSelection(range)
  editor.revealRangeInCenterIfOutsideViewport(range)
}

/** Each file of the open plugin with its model (made if missing), in path order. */
export function pluginModels(): Array<[string, monaco.editor.ITextModel]> {
  const plugin = state.currentPlugin
  const pluginId = state.currentPluginId
  if (!plugin || !pluginId) return []
  return Object.keys(plugin.files)
    .filter(path => !path.startsWith('__new_file_'))
    .sort()
    .map(path => {
      const model = state.editorModels.get(path)
      return [path, model && !model.isDisposed() ? model : createFileModel(pluginId, path, plugin.files[path])]
    })
}

/** Close a file's tabs in every group. */
export function closeFileTabs(filePath: string) {
  const layout = groups.getLayout()
  layout.groups.forEach((group, index) => {
    if (group.tabs.includes(filePath)) groups.closeFile(index, filePath)
  })
}

/** Split the active editor: its file opens in a second group beside it. */
export function splitEditor() {
  groups.splitRight()
}

/** The open tabs to restore for a plugin: what was open last time, with `openFile` shown. */
function initialLayout(pluginId: string, files: Record<string, PluginFile>, entryPoint: string, openFile?: string | null): TabLayout {
  const layout = sanitizeLayout(storedLayout(pluginId), path => !!files[path] || path === API_TYPES_TAB) ?? emptyLayout()
  if (openFile && files[openFile]) {
    openTab(layout.groups[layout.activeGroup], openFile)
  }
  if (!layout.groups.some(group => group.active)) {
    const first = files[entryPoint] ? entryPoint : Object.keys(files)[0]
    if (first) openTab(layout.groups[0], first)
    layout.activeGroup = 0
  }
  return layout
}

// Bumped by every load; a load that finds a newer one started gives way.
let loadGeneration = 0

/**
 * Load a plugin into the editor, dropping whatever is open. `openFile` keeps
 * a file open across a reload when the plugin still has it.
 */
export async function loadPlugin(pluginId: string, openFile?: string | null) {
  const generation = ++loadGeneration
  let plugin = await getEditorPlugin(pluginId)
  if (!plugin) {
    // Plugins added through "Wklej kod" (older builds) live only in the runtime
    // script store; give them an editor record on first open so they can be
    // edited like any other plugin.
    plugin = await adoptStoredPlugin(pluginId)
    if (plugin) {
      await reloadPluginList()
    }
  }
  if (generation !== loadGeneration) return
  if (!plugin) {
    updateStatus('Plugin not found', 'error')
    return
  }

  // Migrate legacy plugin if needed
  plugin = migrateLegacyPlugin(plugin)

  // Dispose old models
  state.editorModels.forEach(model => model.dispose())
  state.editorModels.clear()

  // Dispose Monaco models from previous plugin
  monaco.editor.getModels().forEach(model => {
    const uriString = model.uri.toString()
    if (uriString.startsWith('file:///') && !uriString.includes('plugin-api')) {
      model.dispose()
    }
  })

  state.currentPluginId = pluginId
  state.currentPlugin = plugin
  state.currentFilePath = null
  state.modifiedFiles.clear()
  state.baseline = baselineOf(plugin.files, plugin.folders)

  // Notify dev server about current plugin
  getDevServer().setCurrentPluginId(pluginId)
  sessionHooks.followPlugin(pluginId)

  setHeaderPlugin({ name: plugin.name, language: currentPluginLanguage() })
  setWelcomeVisible(false)
  syncUrl(pluginId)

  // Update Monaco's virtual file system
  updateMonacoFileSystem(pluginId, plugin.files)

  // Dispose old completion providers and register new ones
  if (disposeImportPathProvider) {
    disposeImportPathProvider()
  }
  if (disposeAutoImportProvider) {
    disposeAutoImportProvider()
  }
  disposeImportPathProvider = registerImportPathCompletion(pluginId, plugin.files)
  disposeAutoImportProvider = registerAutoImportCompletion(pluginId, plugin.files)

  // Create models for all files (updateMonacoFileSystem registered their libs)
  for (const [filePath, file] of Object.entries(plugin.files)) {
    createFileModel(pluginId, filePath, file, false)
  }

  // Reopen the tabs it had, then draw the tree
  groups.resetLayout(initialLayout(pluginId, plugin.files, plugin.entryPoint, openFile))
  renderCurrentFileTree()
  sessionHooks.refreshStatusBar()
  updateStatus(`Loaded: ${plugin.name}`, 'success')

  sessionHooks.pluginLoaded(pluginId)
}

// File operations wrappers
export function moveFileToDirectoryWrapper(sourcePath: string, targetDirectory: string) {
  if (!state.currentPlugin) return

  const success = moveFileToDirectory(
    sourcePath,
    targetDirectory,
    state.currentPlugin,
    state.currentPluginId!,
    state.editorModels,
    state.currentFilePath,
    updateStatus,
    renameFileWrapper
  )

  if (success) renderCurrentFileTree()
}

export function renameFileWrapper(oldPath: string, newPath: string): boolean {
  if (!state.currentPlugin) return false

  const success = renameFile(
    oldPath,
    newPath,
    state.currentPlugin,
    state.currentPluginId!,
    state.editorModels,
    state.currentFilePath,
    updateStatus,
    () => {} // its tabs follow below
  )

  if (success) {
    if (state.modifiedFiles.delete(oldPath)) state.modifiedFiles.add(newPath)
    void moveFileHistory(state.currentPluginId!, oldPath, newPath).catch(error => console.error('[Editor] history', error))
    groups.renameFile(oldPath, newPath)
    renderCurrentFileTree()
  }

  return success
}

/** The local history's limits, from the settings. */
export function historyLimits(): HistoryLimits {
  const prefs = getEditorPrefs()
  return {maxVersions: prefs.historyVersions, maxDays: prefs.historyDays}
}

/**
 * Bundle the open plugin, putting esbuild's errors on its files as markers
 * (they show in the Problems panel) and clearing the last bundle's.
 */
export async function bundleOpenPlugin(files: Record<string, PluginFile>, entryPoint: string): Promise<string> {
  const pluginId = state.currentPluginId
  for (const model of state.editorModels.values()) {
    if (!model.isDisposed()) monaco.editor.setModelMarkers(model, BUNDLE_MARKER_OWNER, [])
  }
  try {
    return await bundlePlugin(files, entryPoint)
  } catch (error) {
    if (pluginId && pluginId === state.currentPluginId) {
      const byPath = new Map<string, monaco.editor.IMarkerData[]>()
      for (const {path, ...range} of bundleProblems(error, entryPoint, p => state.editorModels.has(p))) {
        const markers = byPath.get(path) ?? []
        markers.push({...range, severity: monaco.MarkerSeverity.Error, source: 'esbuild'})
        byPath.set(path, markers)
      }
      for (const [path, markers] of byPath) {
        const model = state.editorModels.get(path)
        if (model && !model.isDisposed()) monaco.editor.setModelMarkers(model, BUNDLE_MARKER_OWNER, markers)
      }
    }
    throw error
  }
}

/**
 * Save plugin wrapper. Files already hold what the models show (each model
 * writes through on change), so nothing is read back from the editor: it may
 * be showing the read-only API typings rather than a plugin file.
 * Resolves false when the save failed.
 */
export async function saveCurrentPlugin(): Promise<boolean> {
  const plugin = state.currentPlugin
  if (!plugin) {
    updateStatus('No plugin loaded', 'error')
    return false
  }

  setSaveState('saving')
  try {
    const saved = await savePlugin(plugin, state.currentPluginId, bundleOpenPlugin, updateStatus)

    // Another plugin was opened while this one bundled; its state is not ours to touch.
    if (state.currentPlugin !== plugin) return true

    state.currentPluginId = saved.id
    // Only what the save really covered is clean: typing during the bundle stays modified.
    for (const path of pathsCoveredBySave(state.modifiedFiles, plugin.files, saved.files)) {
      state.modifiedFiles.delete(path)
    }
    state.baseline = baselineOf(saved.files, saved.folders)
    setHeaderPlugin({ name: plugin.name, language: currentPluginLanguage() })
    await reloadPluginList()
    renderCurrentFileTree()
    void recordVersions(saved.id, saved.files, historyLimits()).catch(error => console.error('[Editor] history', error))
    await sessionHooks.saved(saved.id, saved.files)
    return true
  } catch {
    // Error already reported by savePlugin; keep the Save button asking.
    if (state.currentPlugin === plugin) setSaveState('failed', state.modifiedFiles.size)
    return false
  }
}
