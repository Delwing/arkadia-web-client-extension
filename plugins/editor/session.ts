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

/** What the open plugin tells the rest of the editor. Set once at startup. */
export const sessionHooks = {
  /** A plugin is being opened (its id), or the open one closed (null). */
  followPlugin: (_pluginId: string | null): void => {},
  /** A plugin finished loading. */
  pluginLoaded: (_pluginId: string): void => {},
  /** A save stored these files. */
  saved: async (_pluginId: string, _files: Record<string, PluginFile>): Promise<void> => {},
  refreshStatusBar: (): void => {},
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
  state.editor?.setValue('')
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

export function renderCurrentFileTree() {
  if (!state.currentPlugin) {
    showDisabledFileTree()
    return
  }

  updateDirtyUI()
  renderFileTree(state.currentPlugin, state.currentFilePath, state.modifiedFiles, {
    onFileClick: switchToFile,
    onFileDelete: async (path) => {
      const success = await deleteFile(
        path,
        state.currentPlugin!,
        state.editorModels,
        state.currentFilePath,
        updateStatus,
        switchToFile
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
    renderCurrentFileTree()

    // Mirror to the IDE, unless this change came from it
    if (!isReceivingFromIDE) {
      const devServer = getDevServer()
      if (devServer.getStatus() === 'connected') {
        devServer.sendFilePreview(pluginId, filePath, content)
      }
    }

    registerPluginFileLib(pluginId, filePath, current)
  })
  return model
}

/**
 * Replace a model's text with what the IDE sent, keeping the cursor where it
 * was and without echoing the change back to the IDE.
 */
export function setModelFromIDE(model: monaco.editor.ITextModel, content: string) {
  if (model.getValue() === content) return
  const shown = state.editor?.getModel() === model
  const selection = shown ? state.editor!.getSelection() : null
  isReceivingFromIDE = true
  try {
    model.setValue(content)
  } finally {
    isReceivingFromIDE = false
  }
  if (selection) state.editor!.setSelection(selection)
}

function revealPosition(position?: IPosition | IRange) {
  if (position === undefined || !state.editor) return
  if ("startLineNumber" in position) {
    state.editor.setPosition({lineNumber: position.startLineNumber, column: position.startColumn})
    state.editor.revealLineInCenter(position.startLineNumber)
  } else if ("lineNumber" in position) {
    state.editor.setPosition(position)
    state.editor.revealLineInCenter(position.lineNumber)
  }
}

// The read-only plugin API typings, shown when a definition jumps into them
const PLUGIN_API_URI = monaco.Uri.parse("file:plugin-api.ts")

function showPluginApiTypes(position?: IPosition | IRange) {
  if (!state.editor) return
  const model = monaco.editor.getModel(PLUGIN_API_URI)
    ?? monaco.editor.createModel(pluginApiTypes, "typescript", PLUGIN_API_URI)
  state.editor.updateOptions({readOnly: true})
  if (state.editor.getModel() !== model) {
    state.editor.setModel(model)
    const sub = state.editor.onDidChangeModel(() => {
      sub.dispose()
      model.dispose()
    })
  }
  revealPosition(position)
}

// Switch to a different file in the editor
export function switchToFile(filePath: string, position?: IPosition | IRange) {
  if (!state.currentPlugin || !state.currentPluginId || !state.editor) return

  // The API typings, under the editor's own name or the npm package's
  if (filePath.startsWith("@types") || filePath.startsWith("@arkadia/")) {
    showPluginApiTypes(position)
    return
  }

  const file = state.currentPlugin.files[filePath]
  if (!file) {
    updateStatus(`File not found: ${filePath}`, 'error')
    return
  }

  state.editor.updateOptions({readOnly: false})
  state.currentFilePath = filePath

  const model = state.editorModels.get(filePath) ?? createFileModel(state.currentPluginId, filePath, file)
  state.editor.setModel(model)
  revealPosition(position)

  renderCurrentFileTree()
  setBreadcrumb(filePath)
  updateStatus(`Editing: ${filePath}`, 'normal')
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
  state.currentFilePath = openFile && plugin.files[openFile] ? openFile : plugin.entryPoint
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

  // Render file tree
  renderCurrentFileTree()

  switchToFile(state.currentFilePath!)
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
    switchToFile
  )

  if (success) {
    // Only update currentFilePath if the renamed file was the currently open file
    if (state.currentFilePath === oldPath) {
      state.currentFilePath = newPath
    }
    renderCurrentFileTree()
  }

  return success
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
    const saved = await savePlugin(plugin, state.currentPluginId, bundlePlugin, updateStatus)

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
    await sessionHooks.saved(saved.id, saved.files)
    return true
  } catch {
    // Error already reported by savePlugin; keep the Save button asking.
    if (state.currentPlugin === plugin) setSaveState('failed', state.modifiedFiles.size)
    return false
  }
}
