import * as monaco from 'monaco-editor'
import * as FileIcons from 'file-icons-js'

// Import Monaco workers
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

// Import file-icons CSS
import 'file-icons-js/css/style.css'

// Import storage utilities
import {
  createPluginFile,
  getEditorPlugin,
  getLanguageFromPath,
  migrateLegacyPlugin,
} from '@client/utils/pluginEditorStorage.ts'

// Import our refactored modules
import type {EditorState} from './types'
import type {EditorPluginData, PluginFile} from '@client/utils/pluginEditorStorage.ts'
import {baselineOf, pathsCoveredBySave, structureChanged} from './savedBaseline'
import {updateStatus} from './utils'
import {bundlePlugin, initEsbuild} from './bundler'
import {
  initializeEditor,
  registerAutoImportCompletion,
  registerImportPathCompletion,
  updateMonacoFileSystem,
  changeTheme,
  getSavedTheme,
  getEditorPrefs,
  applyInitialThemeFromCache
} from './monacoSetup'
import {renderFileTree} from './fileTree'
import {
  clearContextMenuTarget,
  getContextMenuTarget,
  hideContextMenu,
  showContextMenu,
  showFolderContextMenu,
  showRootContextMenu,
} from './contextMenu'
import {
  createFileInline,
  createFolderInline,
  deleteFile,
  deleteFolder,
  moveFileToDirectory,
  renameFile,
} from './fileOperations'
import {
  closeFilePicker,
  hideNewFileModal,
  hideNewPluginModal,
  showFilePicker,
  showNewFileModal,
  showNewPluginModal,
} from './modals'
import {
  adoptStoredPlugin,
  createNewPlugin,
  deletePlugin,
  downloadPlugin,
  refreshPluginList,
  savePlugin,
  uploadPlugin,
  type PluginSummary,
} from './pluginManagement'
import {publishToRegistry} from './registryPublish'
import { getDevServer, type DevServerStatus } from './devServer'
import pluginApiTypes from '../plugin-types/index.d.ts?raw'
import {IPosition, IRange} from "monaco-editor";
import {CodingAgentPanel} from './codingAgentPanel';
import {openDialog} from './dialogs'
import {createPopover, type Popover} from './popover'
import {setupPluginSwitcher} from './pluginSwitcher'
import {renderWelcome, setWelcomeVisible} from './welcome'
import {
  setBreadcrumb,
  setHeaderPlugin,
  setSaveState,
  setSettingsIdeStatus,
  setupSettings,
  setupStatusBar,
} from './chrome'

// Apply cached theme colors immediately to prevent flash of wrong colors
applyInitialThemeFromCache()

// Configure Monaco Environment for web workers
self.MonacoEnvironment = {
  getWorker(_: string, label: string) {
    switch (label) {
      case 'json':
        return new jsonWorker()
      case 'typescript':
      case 'javascript':
        return new tsWorker()
      default:
        return new editorWorker()
    }
  }
}

// Helper function to infer TypeScript type from JSON value
function inferJsonType(value: any): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    if (value.length === 0) return 'any[]'
    const itemTypes = value.map(item => inferJsonType(item))
    const uniqueTypes = [...new Set(itemTypes)]
    return uniqueTypes.length === 1 ? `${uniqueTypes[0]}[]` : '(' + uniqueTypes.join(' | ') + ')[]'
  }
  if (typeof value === 'object') {
    const props = Object.entries(value)
      .map(([key, val]) => `  ${JSON.stringify(key)}: ${inferJsonType(val)}`)
      .join(';\n')
    return `{\n${props}\n}`
  }
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'any'
}

// Global editor state
const state: EditorState = {
  editor: null,
  currentPluginId: null,
  currentFilePath: null,
  currentPlugin: null,
  editorModels: new Map(),
  modifiedFiles: new Set(),
  baseline: null,
  esbuildInitialized: false,
}

// Flag to prevent feedback loop when receiving preview from IDE
let isReceivingFromIDE = false

// Store completion provider disposers
let disposeImportPathProvider: (() => void) | null = null
let disposeAutoImportProvider: (() => void) | null = null

// Initialize coding agent panel
let agentPanel: CodingAgentPanel | null = null

// JS Preview panel state
let jsPreviewEditor: monaco.editor.IStandaloneCodeEditor | null = null
let jsPreviewVisible = false

// Every plugin the editor can open, for the switcher and the welcome screen
let pluginList: PluginSummary[] = []
let pluginSwitcher: Popover | null = null
let refreshStatusBar: () => void = () => {}

async function reloadPluginList() {
  pluginList = await refreshPluginList()
  renderWelcome(pluginList, requestOpenPlugin)
}

function currentPluginLanguage(): 'typescript' | 'javascript' {
  return state.currentPlugin?.entryPoint.endsWith('.ts') ? 'typescript' : 'javascript'
}

/**
 * Unsaved work in the open plugin: edited files, or files and folders added,
 * removed, renamed or moved since it was loaded or saved.
 */
function isPluginDirty(): boolean {
  if (!state.currentPlugin) return false
  return state.modifiedFiles.size > 0
    || structureChanged(state.currentPlugin.files, state.currentPlugin.folders, state.baseline)
}

/** "unsaved changes in 2 files", or "unsaved file changes" for structure-only edits. */
function describeUnsaved(): string {
  const count = state.modifiedFiles.size
  if (count === 0) return 'unsaved file changes'
  return `unsaved changes in ${count === 1 ? '1 file' : `${count} files`}`
}

/** Header and save state follow the open plugin and its modified files. */
function updateDirtyUI() {
  if (!state.currentPlugin) return
  setSaveState(isPluginDirty() ? 'dirty' : 'clean', state.modifiedFiles.size)
}

// Opening, reloading and taking IDE updates into the open plugin each await
// storage or a dialog. They run one at a time, so a second request cannot
// load over a first one halfway through, or patch a plugin being replaced.
let editorQueue: Promise<unknown> = Promise.resolve()

function exclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = editorQueue.then(task)
  editorQueue = run.catch(error => console.error('[Editor]', error))
  return run
}

/**
 * Open a plugin from the switcher, the welcome screen or the IDE, asking
 * first when the open one has unsaved changes. Resolves false when the user
 * cancelled.
 */
function requestOpenPlugin(pluginId: string, source: 'user' | 'ide' = 'user'): Promise<boolean> {
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
function closePlugin() {
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

  showDisabledFileTree()
  setHeaderPlugin(null)
  setWelcomeVisible(true)
  syncUrl(null)
  refreshStatusBar()
}

// File tree render wrapper
function showDisabledFileTree() {
  const fileList = document.getElementById('file-list')!
  fileList.innerHTML = '<div class="file-tree-disabled">No plugin loaded</div>'
}

function renderCurrentFileTree() {
  if (!state.currentPlugin) {
    showDisabledFileTree()
    return
  }

  updateDirtyUI()
  renderFileTree(state.currentPlugin, state.currentFilePath, state.modifiedFiles, {
    onFileClick: switchToFile,
    onFileDelete: (path) => {
      const success = deleteFile(
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

/** Put a file into Monaco's TypeScript view of the plugin, so imports of it resolve. */
function syncExtraLib(pluginId: string, filePath: string, file: PluginFile) {
  const uri = `file:///${pluginId}/${filePath}`
  if (file.language === 'typescript' || file.language === 'javascript') {
    monaco.typescript.typescriptDefaults.addExtraLib(file.content, uri)
    monaco.typescript.javascriptDefaults.addExtraLib(file.content, uri)
  } else if (file.language === 'json') {
    // A .d.ts beside the JSON declares it as a module, so TypeScript types
    // `import data from './x.json'` without validating the JSON itself.
    const dtsUri = uri.replace('.json', '.json.d.ts')
    let inferredType = 'any'
    try {
      inferredType = inferJsonType(JSON.parse(file.content || '{}'))
    } catch {
      // Invalid JSON while typing: fall back to any
    }
    const tsModuleContent = `declare const value: ${inferredType};
export default value;`
    monaco.typescript.typescriptDefaults.addExtraLib(tsModuleContent, dtsUri)
    monaco.typescript.javascriptDefaults.addExtraLib(tsModuleContent, dtsUri)
  }
}

/**
 * The Monaco model for one file of the open plugin. Typing in it writes
 * through to the plugin's files, marks the file modified and mirrors it to
 * the IDE.
 */
function createFileModel(pluginId: string, filePath: string, file: PluginFile, registerLib = true): monaco.editor.ITextModel {
  const uri = monaco.Uri.parse(`file:///${pluginId}/${filePath}`)
  // Navigating to an import path can leave a model behind that is not ours;
  // it may be stale, so start fresh from the plugin's files.
  monaco.editor.getModel(uri)?.dispose()

  const model = monaco.editor.createModel(file.content, file.language, uri)
  state.editorModels.set(filePath, model)
  if (registerLib) syncExtraLib(pluginId, filePath, file)

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

    syncExtraLib(pluginId, filePath, current)
  })
  return model
}

/**
 * Replace a model's text with what the IDE sent, keeping the cursor where it
 * was and without echoing the change back to the IDE.
 */
function setModelFromIDE(model: monaco.editor.ITextModel, content: string) {
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
function switchToFile(filePath: string, position?: IPosition | IRange) {
  if (!state.currentPlugin || !state.currentPluginId || !state.editor) return

  if (filePath.startsWith("@types")) {
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
async function loadPlugin(pluginId: string, openFile?: string | null) {
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
  refreshStatusBar()
  updateStatus(`Loaded: ${plugin.name}`, 'success')

  // Notify agent panel of plugin change
  if (agentPanel) {
    agentPanel.onPluginChanged(pluginId)
  }
}

// File operations wrappers
function moveFileToDirectoryWrapper(sourcePath: string, targetDirectory: string) {
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

function renameFileWrapper(oldPath: string, newPath: string): boolean {
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

// Rename UI handling
function startRename(filePath: string) {
  const fileItem = document.querySelector(`.file-item[data-path="${filePath}"]`) as HTMLElement
  if (!fileItem) return

  fileItem.classList.add('renaming')
  const input = fileItem.querySelector('.rename-input') as HTMLInputElement
  if (!input) return

  const parts = filePath.split('/')
  const fileName = parts[parts.length - 1]
  const dir = parts.slice(0, -1).join('/')

  input.value = fileName
  input.focus()

  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex > 0) {
    input.setSelectionRange(0, dotIndex)
  } else {
    input.select()
  }

  const finishRename = async () => {
    const newName = input.value.trim()
    fileItem.classList.remove('renaming')

    if (!newName || newName === fileName) return

    const newPath = dir ? `${dir}/${newName}` : newName

    if (state.currentPlugin && state.currentPlugin.files[newPath]) {
      updateStatus('File already exists', 'error')
      return
    }

    renameFileWrapper(filePath, newPath)
  }

  input.onblur = finishRename
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      input.blur()
    } else if (e.key === 'Escape') {
      fileItem.classList.remove('renaming')
      input.value = fileName
    }
  }
}

// New file creation UI handling
function startNewFileCreation(folderPath: string) {
  if (!state.currentPlugin) return

  // Create a temporary unique marker for the new file
  const tempId = `__new_file_${Date.now()}__`
  const tempPath = folderPath ? `${folderPath}/${tempId}` : tempId

  // Temporarily add to plugin files just for rendering
  state.currentPlugin.files[tempPath] = createPluginFile(tempPath, '')

  renderCurrentFileTree()

  setTimeout(() => {
    const fileItem = document.querySelector(`.file-item[data-path="${tempPath}"]`) as HTMLElement
    if (!fileItem) return

    const input = fileItem.querySelector('.rename-input') as HTMLInputElement
    if (!input) return

    input.focus()

    input.onblur = async () => {
      const newName = input.value.trim()
      fileItem.classList.remove('renaming')

      // Remove the temporary file
      delete state.currentPlugin!.files[tempPath]

      if (!newName) {
        // User cancelled, just re-render
        renderCurrentFileTree()
        return
      }

      const newPath = folderPath ? `${folderPath}/${newName}` : newName

      if (state.currentPlugin!.files[newPath]) {
        updateStatus('File already exists', 'error')
        renderCurrentFileTree()
        return
      }

      // Create the actual file
      state.currentPlugin!.files[newPath] = createPluginFile(newPath, '')
      renderCurrentFileTree()

      // Open the newly created file
      switchToFile(newPath)
      updateStatus(`Created: ${newPath}`, 'success')
    }
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        input.blur()
      } else if (e.key === 'Escape') {
        input.value = ''
        input.blur()
      }
    }
  }, 50)
}

// New folder creation UI handling
function startNewFolderCreation(basePath: string) {
  if (!state.currentPlugin) return

  // Initialize folders array if needed
  if (!state.currentPlugin.folders) {
    state.currentPlugin.folders = []
  }

  // Create a temporary unique marker for the new folder
  const tempId = `__new_folder_${Date.now()}__`
  const tempPath = basePath ? `${basePath}${tempId}` : tempId

  // Temporarily add to folders array
  state.currentPlugin.folders.push(tempPath)

  renderCurrentFileTree()

  setTimeout(() => {
    const folderItem = document.querySelector(`.folder-item[data-path="${tempPath}"]`) as HTMLElement
    if (!folderItem) return

    const input = folderItem.querySelector('.rename-input') as HTMLInputElement
    if (!input) return

    input.focus()

    const finishCreation = async () => {
      const newFolderName = input.value.trim()

      // Remove the temporary folder
      const tempIndex = state.currentPlugin!.folders!.indexOf(tempPath)
      if (tempIndex > -1) {
        state.currentPlugin!.folders!.splice(tempIndex, 1)
      }

      if (!newFolderName) {
        // User cancelled, just re-render
        renderCurrentFileTree()
        return
      }

      const newFolderPath = basePath ? `${basePath}${newFolderName}` : newFolderName

      if (state.currentPlugin!.folders!.includes(newFolderPath)) {
        updateStatus('Folder already exists', 'error')
        renderCurrentFileTree()
        return
      }

      // Create the actual folder
      state.currentPlugin!.folders!.push(newFolderPath)
      renderCurrentFileTree()
      updateStatus(`Created folder: ${newFolderPath}`, 'success')
    }

    input.onblur = finishCreation
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        input.blur()
      } else if (e.key === 'Escape') {
        input.value = ''
        input.blur()
      }
    }
  }, 100)
}

// Folder rename UI handling
function startFolderRename(folderPath: string, currentFolderName: string) {
  const folderItem = document.querySelector(`.folder-item[data-path="${folderPath}"]`) as HTMLElement
  if (!folderItem) return

  const folderNameSpan = folderItem.querySelector('.folder-name') as HTMLElement
  if (!folderNameSpan) return

  const input = document.createElement('input')
  input.type = 'text'
  input.value = currentFolderName
  input.className = 'rename-input'
  input.style.display = 'block'
  input.style.flex = '1'

  folderNameSpan.style.display = 'none'
  folderItem.appendChild(input)
  input.focus()
  input.select()

  const finishRename = async () => {
    const newFolderName = input.value.trim()
    input.remove()
    folderNameSpan.style.display = ''

    // If name hasn't changed, just return without doing anything
    if (newFolderName === currentFolderName) {
      return
    }

    // If empty, remove the folder (this handles newly created folders that were cancelled)
    if (!newFolderName) {
      if (!state.currentPlugin || !state.currentPlugin.folders) return
      const index = state.currentPlugin.folders.indexOf(folderPath)
      if (index > -1) {
        state.currentPlugin.folders.splice(index, 1)
      }
      renderCurrentFileTree()
      return
    }

    if (!state.currentPlugin) return

    const parts = folderPath.split('/')
    const basePath = parts.slice(0, -1).join('/')
    const newFolderPath = basePath ? `${basePath}/${newFolderName}` : newFolderName

    // Update folders array
    if (state.currentPlugin.folders) {
      const index = state.currentPlugin.folders.indexOf(folderPath)
      if (index > -1) {
        state.currentPlugin.folders[index] = newFolderPath
      }

      state.currentPlugin.folders = state.currentPlugin.folders.map(folder => {
        if (folder.startsWith(folderPath + '/')) {
          return folder.replace(folderPath, newFolderPath)
        }
        return folder
      })
    }

    // Rename all files in the folder
    const filesToRename = Object.keys(state.currentPlugin.files).filter(path =>
      path.startsWith(folderPath + '/')
    )

    filesToRename.forEach(oldPath => {
      const relativePath = oldPath.substring(folderPath.length + 1)
      const newPath = `${newFolderPath}/${relativePath}`

      state.currentPlugin!.files[newPath] = {
        ...state.currentPlugin!.files[oldPath],
        path: newPath,
        language: getLanguageFromPath(newPath)
      }
      delete state.currentPlugin!.files[oldPath]
    })

    renderCurrentFileTree()
    updateStatus(`Folder renamed to ${newFolderName}`, 'success')
  }

  input.onblur = finishRename
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      input.blur()
    } else if (e.key === 'Escape') {
      input.value = currentFolderName
      input.blur()
    }
  }
}

// Context menu action handler
function handleContextMenuAction(action: string) {
  const target = getContextMenuTarget()
  if (!target || !state.currentPlugin) return

  hideContextMenu()

  switch (action) {
    case 'rename':
      if (target.isFolder) {
        const parts = target.path.split('/')
        const folderName = parts[parts.length - 1]
        startFolderRename(target.path, folderName)
      } else {
        startRename(target.path)
      }
      break
    case 'delete':
      if (target.isFolder) {
        const success = deleteFolder(
          target.path,
          state.currentPlugin,
          state.editorModels,
          state.modifiedFiles,
          state.currentFilePath,
          updateStatus,
          switchToFile
        )
        if (success) renderCurrentFileTree()
      } else {
        const success = deleteFile(
          target.path,
          state.currentPlugin,
          state.editorModels,
          state.currentFilePath,
          updateStatus,
          switchToFile
        )
        if (success) renderCurrentFileTree()
      }
      break
    case 'new-file':
      if (target.isFolder || target.path === '') {
        createFileInline(target.path, state.currentPlugin, updateStatus, renderCurrentFileTree, startNewFileCreation)
      } else {
        const parts = target.path.split('/')
        const dir = parts.slice(0, -1).join('/')
        createFileInline(dir, state.currentPlugin, updateStatus, renderCurrentFileTree, startNewFileCreation)
      }
      break
    case 'new-folder':
      let folderBase = ''
      if (target.isFolder || target.path === '') {
        folderBase = target.path ? target.path + '/' : ''
      } else {
        const parts = target.path.split('/')
        const dir = parts.slice(0, -1).join('/')
        folderBase = dir ? dir + '/' : ''
      }
      createFolderInline(folderBase, state.currentPlugin, updateStatus, renderCurrentFileTree, startNewFolderCreation)
      break
  }

  clearContextMenuTarget()
}

// New file modal handling
async function createNewFile() {
  if (!state.currentPlugin) return

  const pathInput = document.getElementById('new-file-path') as HTMLInputElement
  const filePath = pathInput.value.trim()

  if (!filePath) {
    alert('Please enter a file path')
    return
  }

  if (state.currentPlugin.files && state.currentPlugin.files[filePath]) {
    alert('File already exists')
    return
  }

  state.currentPlugin.files[filePath] = createPluginFile(filePath, '')

  renderCurrentFileTree()
  switchToFile(filePath)
  hideNewFileModal()
  updateStatus(`Created: ${filePath}`, 'success')
}

/**
 * Save plugin wrapper. Files already hold what the models show (each model
 * writes through on change), so nothing is read back from the editor: it may
 * be showing the read-only API typings rather than a plugin file.
 * Resolves false when the save failed.
 */
async function saveCurrentPlugin(): Promise<boolean> {
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
    return true
  } catch {
    // Error already reported by savePlugin; keep the Save button asking.
    if (state.currentPlugin === plugin) setSaveState('failed', state.modifiedFiles.size)
    return false
  }
}

// Delete plugin wrapper
async function deleteCurrentPlugin() {
  if (!state.currentPluginId || !state.currentPlugin) {
    updateStatus('No plugin selected', 'error')
    return
  }

  const files = Object.keys(state.currentPlugin.files).length
  const { button } = await openDialog({
    title: 'Delete plugin',
    message: `Delete ${state.currentPlugin.name} and its ${files === 1 ? 'file' : `${files} files`}? ` +
      'It is also removed from the game client. Download a ZIP first if you might want it back.',
    buttons: [
      { id: 'cancel', label: 'Cancel' },
      { id: 'delete', label: 'Delete', kind: 'danger' },
    ],
  })
  if (button !== 'delete') return

  await deletePlugin(state.currentPluginId, updateStatus)
  closePlugin()
  await reloadPluginList()
}

// Rename plugin: the name lives in the plugin record, so renaming saves it
async function renameCurrentPlugin() {
  if (!state.currentPlugin) return

  const { button, value } = await openDialog({
    title: 'Rename plugin',
    message: '',
    input: { value: state.currentPlugin.name, placeholder: 'Plugin name' },
    buttons: [
      { id: 'cancel', label: 'Cancel' },
      { id: 'rename', label: 'Rename', kind: 'primary' },
    ],
  })
  const name = value.trim()
  if (button !== 'rename' || !name || name === state.currentPlugin.name) return

  const previous = state.currentPlugin.name
  state.currentPlugin.name = name
  if (!(await saveCurrentPlugin()) && state.currentPlugin.name === name) {
    // Save failed: put the old name back so the header does not lie.
    state.currentPlugin.name = previous
    setHeaderPlugin({ name: previous, language: currentPluginLanguage() })
  }
}

// Create new plugin wrapper
async function createNewPluginHandler() {
  try {
    const pluginData = await createNewPlugin(bundlePlugin)

    hideNewPluginModal()
    await reloadPluginList()
    await loadPlugin(pluginData.id)
  } catch (error) {
    updateStatus((error as Error).message, 'error')
    ;(document.getElementById('new-plugin-name') as HTMLInputElement).focus()
  }
}

// Download plugin wrapper
async function downloadCurrentPlugin() {
  if (!state.currentPluginId) {
    updateStatus('No plugin selected', 'error')
    return
  }

  await downloadPlugin(state.currentPluginId, updateStatus)
}

// Publish plugin to the registry wrapper
async function publishCurrentPlugin() {
  if (!state.currentPluginId) {
    updateStatus('No plugin selected', 'error')
    return
  }

  await publishToRegistry(state.currentPluginId, updateStatus)
}

// Upload plugin wrapper
async function uploadPluginFromFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.zip'

  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return

    const pluginData = await uploadPlugin(file, bundlePlugin, updateStatus)
    if (pluginData) {
      await reloadPluginList()
      await loadPlugin(pluginData.id)
    }
  }

  input.click()
}

// JS Preview panel functions
function initJsPreviewEditor() {
  if (jsPreviewEditor) return

  const container = document.getElementById('js-preview-editor')!
  jsPreviewEditor = monaco.editor.create(container, {
    value: '// Compiled JavaScript will appear here\n// Click "Refresh" or edit TypeScript code to see the output',
    language: 'javascript',
    readOnly: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    wordWrap: 'on',
    theme: getSavedTheme(),
    fontSize: getEditorPrefs().fontSize,
    lineNumbers: 'on',
    folding: true,
  })
}

function toggleJsPreview() {
  const panel = document.getElementById('js-preview-panel')!
  jsPreviewVisible = !jsPreviewVisible

  document.getElementById('toggle-js-preview-btn')!.classList.toggle('active', jsPreviewVisible)

  if (jsPreviewVisible) {
    panel.style.display = 'flex'
    if (!jsPreviewEditor) {
      initJsPreviewEditor()
    }
    refreshJsPreview()
  } else {
    panel.style.display = 'none'
  }
}

async function refreshJsPreview() {
  if (!jsPreviewEditor || !state.currentPlugin) {
    if (jsPreviewEditor) {
      jsPreviewEditor.setValue('// No plugin loaded')
    }
    return
  }

  try {
    // Bundle the entire plugin to get the compiled output
    const filesRecord: Record<string, import('../src/client/utils/pluginEditorStorage').PluginFile> = {}
    for (const [path, file] of Object.entries(state.currentPlugin.files)) {
      filesRecord[path] = file
    }

    const compiled = await bundlePlugin(filesRecord, state.currentPlugin.entryPoint)
    jsPreviewEditor.setValue(compiled)
    updateStatus('JS preview updated', 'success')
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    jsPreviewEditor.setValue(`// Compilation error:\n// ${errorMessage}`)
    updateStatus('JS preview compilation failed', 'error')
  }
}

async function copyJsPreview() {
  if (!jsPreviewEditor) return

  const code = jsPreviewEditor.getValue()
  try {
    await navigator.clipboard.writeText(code)
    updateStatus('Copied to clipboard', 'success')
  } catch (error) {
    updateStatus(`Failed to copy to clipboard ${error.message}`, 'error')
  }
}

// File picker
function renderFilePickerList(filter: string) {
  if (!state.currentPlugin) return

  const list = document.getElementById('file-picker-list')!
  const files = Object.keys(state.currentPlugin.files).sort()

  const filteredFiles = filter
    ? files.filter(f => f.toLowerCase().includes(filter.toLowerCase()))
    : files

  list.innerHTML = ''

  filteredFiles.forEach((filePath, index) => {
    const item = document.createElement('div')
    item.className = 'file-picker-item'

    const iconClass = FileIcons.getClassWithColor(filePath)
    const icon = document.createElement('span')
    icon.className = iconClass
    item.appendChild(icon)

    const text = document.createElement('span')
    text.textContent = filePath
    item.appendChild(text)

    item.addEventListener('click', () => {
      switchToFile(filePath)
      closeFilePicker()
    })

    if (index === 0) {
      item.classList.add('selected')
    }

    list.appendChild(item)
  })

  if (filteredFiles.length === 0) {
    list.innerHTML = '<div class="file-picker-empty">No files found</div>'
  }
}

function showFilePickerHandler() {
  showFilePicker()
  renderFilePickerList('')

  const modal = document.getElementById('file-picker-modal')!
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeFilePicker()
    }
  }

  const handleClick = (e: MouseEvent) => {
    if (e.target === modal) {
      closeFilePicker()
    }
  }

  document.addEventListener('keydown', handleKeyDown)
  modal.addEventListener('click', handleClick)

  const cleanup = () => {
    document.removeEventListener('keydown', handleKeyDown)
    modal.removeEventListener('click', handleClick)
  }

  ;(modal as any)._cleanup = cleanup
}

// Dev server UI functions
function updateDevServerUI(status: DevServerStatus, message?: string) {
  const indicator = document.getElementById('dev-server-indicator')!
  const text = document.getElementById('dev-server-text')!
  const connectBtn = document.getElementById('dev-server-connect')!
  const disconnectBtn = document.getElementById('dev-server-disconnect')!
  const connectionStatus = document.getElementById('dev-server-connection-status')!

  indicator.className = status
  setSettingsIdeStatus(status, {
    connected: 'Connected',
    connecting: 'Connecting…',
    error: 'Connection error',
    disconnected: 'Not connected',
  }[status] ?? 'Not connected')

  switch (status) {
    case 'connected':
      text.textContent = 'IDE: Connected'
      connectBtn.style.display = 'none'
      disconnectBtn.style.display = 'inline-block'
      connectionStatus.textContent = message || 'Connected to dev server'
      connectionStatus.className = 'success'
      connectionStatus.style.display = 'block'
      break
    case 'connecting':
      text.textContent = 'IDE: Connecting...'
      connectBtn.style.display = 'none'
      disconnectBtn.style.display = 'none'
      connectionStatus.textContent = 'Connecting...'
      connectionStatus.className = 'info'
      connectionStatus.style.display = 'block'
      break
    case 'error':
      text.textContent = 'IDE: Error'
      connectBtn.style.display = 'inline-block'
      disconnectBtn.style.display = 'none'
      connectionStatus.textContent = message || 'Connection error'
      connectionStatus.className = 'error'
      connectionStatus.style.display = 'block'
      break
    case 'disconnected':
    default:
      text.textContent = 'IDE: Disconnected'
      connectBtn.style.display = 'inline-block'
      disconnectBtn.style.display = 'none'
      if (message) {
        connectionStatus.textContent = message
        connectionStatus.className = 'info'
        connectionStatus.style.display = 'block'
      } else {
        connectionStatus.style.display = 'none'
      }
      break
  }
}

function showDevServerModal() {
  const modal = document.getElementById('dev-server-modal')!
  const devServer = getDevServer()
  const config = devServer.getConfig()

  // Populate form with current config
  const hostInput = document.getElementById('dev-server-host') as HTMLInputElement
  const portInput = document.getElementById('dev-server-port') as HTMLInputElement
  const autoReconnectCheck = document.getElementById('dev-server-auto-reconnect') as HTMLInputElement

  hostInput.value = config.host
  portInput.value = config.port.toString()
  autoReconnectCheck.checked = config.autoReconnect

  // Update UI based on current status
  updateDevServerUI(devServer.getStatus())

  modal.style.display = 'flex'
}

function hideDevServerModal() {
  const modal = document.getElementById('dev-server-modal')!
  modal.style.display = 'none'
}

/**
 * The IDE saved some files of the open plugin. Those files take the IDE's
 * text and count as saved; every other file, saved or not, is left alone.
 */
function takeFileUpdateFromIDE(stored: EditorPluginData, paths: string[]) {
  const plugin = state.currentPlugin!
  const pluginId = state.currentPluginId!
  for (const path of paths) {
    const file = stored.files[path]
    if (!file) continue
    const open = plugin.files[path]
    if (open) {
      const model = state.editorModels.get(path)
      if (model) setModelFromIDE(model, file.content)
      open.content = file.content
    } else {
      plugin.files[path] = { ...file }
      createFileModel(pluginId, path, plugin.files[path])
    }
    state.modifiedFiles.delete(path)
    state.baseline?.paths.add(path)
  }
  plugin.compiled = stored.compiled
  plugin.lastCompiledAt = stored.lastCompiledAt
  plugin.updatedAt = stored.updatedAt
  renderCurrentFileTree()
  updateStatus(`Plugin updated from IDE: ${stored.name}`, 'success')
}

/**
 * The IDE replaced the whole open plugin. With nothing unsaved here it just
 * reloads; otherwise the user picks between the IDE's version and their own.
 */
async function takeFullSyncFromIDE(stored: EditorPluginData) {
  const plugin = state.currentPlugin!
  if (isPluginDirty()) {
    const { button } = await openDialog({
      title: 'Full sync from IDE',
      message: `Your IDE sent all of ${stored.name}, but ${plugin.name} has ${describeUnsaved()} here. ` +
        'Keeping them leaves them unsaved; saving then overwrites what the IDE sent.',
      buttons: [
        { id: 'ide', label: 'Use IDE version', kind: 'danger', start: true },
        { id: 'keep', label: 'Keep my changes', kind: 'primary' },
      ],
    })
    if (state.currentPlugin !== plugin) return
    if (button !== 'ide') {
      // Storage now holds the IDE's copy: whatever differs from it is unsaved.
      for (const [path, file] of Object.entries(plugin.files)) {
        if (stored.files[path]?.content !== file.content) state.modifiedFiles.add(path)
      }
      state.baseline = baselineOf(stored.files, stored.folders)
      renderCurrentFileTree()
      return
    }
  }
  await loadPlugin(stored.id, state.currentFilePath)
  updateStatus(`Plugin synced from IDE: ${stored.name}`, 'success')
}

function setupDevServer() {
  const devServer = getDevServer()

  // Set the bundler function for compiling TypeScript
  devServer.setBundlePlugin(bundlePlugin)

  // Set up status change callback
  devServer.setOnStatusChange((status, message) => {
    updateDevServerUI(status, message)

    // Close modal on successful connection
    if (status === 'connected') {
      hideDevServerModal()
    }
  })

  // The IDE wrote a plugin to storage. Fold it into the open copy rather
  // than swapping the copy out, so browser edits it did not touch survive.
  devServer.setOnPluginUpdate((pluginId, plugin, changed) => {
    console.log('[DevServer] Plugin updated:', pluginId)
    void exclusive(async () => {
      if (state.currentPluginId === pluginId && state.currentPlugin) {
        if (changed === 'all') await takeFullSyncFromIDE(plugin)
        else takeFileUpdateFromIDE(plugin, changed)
      }
      // Refresh plugin list in case a new plugin was added
      await reloadPluginList()
    })
  })

  // Set up reload request callback
  devServer.setOnReloadRequest((pluginId) => {
    console.log('[DevServer] Reload requested for plugin:', pluginId)
    void exclusive(async () => {
      if (state.currentPluginId !== pluginId || !state.currentPlugin) return
      if (isPluginDirty()) {
        const { button } = await openDialog({
          title: 'Reload from IDE',
          message: `Your IDE asked to reload ${state.currentPlugin.name}, which has ${describeUnsaved()} here. Reloading drops them.`,
          buttons: [
            { id: 'reload', label: 'Reload', kind: 'danger', start: true },
            { id: 'keep', label: 'Keep my changes', kind: 'primary' },
          ],
        })
        if (button !== 'reload' || state.currentPluginId !== pluginId) return
      }
      await loadPlugin(pluginId, state.currentFilePath)
    })
  })

  // Set up plugin selected from IDE callback
  devServer.setOnPluginSelectedFromIDE(async (pluginId) => {
    console.log('[DevServer] IDE selected plugin:', pluginId)

    // If this is already the current plugin, do nothing
    if (state.currentPluginId === pluginId) {
      return
    }

    if (!(await requestOpenPlugin(pluginId, 'ide'))) return

    updateStatus(`Switched to plugin from IDE: ${pluginId}`, 'success')
  })

  // Set up file focused from IDE callback
  devServer.setOnFileFocusedFromIDE((filePath) => {
    console.log('[DevServer] IDE focused file:', filePath)

    // Check if this file exists in the current plugin
    if (!state.currentPlugin?.files[filePath]) {
      console.log('[DevServer] File not found in current plugin:', filePath)
      return
    }

    // Switch to this file
    switchToFile(filePath)
  })

  // Live sync as the IDE types, without saving: the browser shows the
  // IDE's unsaved buffer, so the file reads as modified here too.
  devServer.setOnFilePreview((pluginId, files) => {
    if (state.currentPluginId !== pluginId) return
    for (const file of files) {
      const model = state.editorModels.get(file.path)
      if (model) setModelFromIDE(model, file.content)
    }
  })

  // Initialize UI
  updateDevServerUI(devServer.getStatus())
}

// Event listeners setup
function setupEventListeners() {
  pluginSwitcher = setupPluginSwitcher({
    getPlugins: () => pluginList,
    getCurrentId: () => state.currentPluginId,
    onPick: (id) => { requestOpenPlugin(id) },
    onNew: showNewPluginModal,
    onImport: uploadPluginFromFile,
  })

  const saveBtn = document.getElementById('save-btn')!
  saveBtn.addEventListener('click', saveCurrentPlugin)

  // Plugin actions (⋯)
  const actionsMenu = createPopover(
    document.getElementById('actions-btn')!,
    document.getElementById('actions-menu')!,
    { align: 'right' }
  )
  const actions: Record<string, () => void> = {
    rename: renameCurrentPlugin,
    download: downloadCurrentPlugin,
    publish: publishCurrentPlugin,
    delete: deleteCurrentPlugin,
  }
  document.getElementById('actions-menu')!.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>('.menu-item')
    const action = item?.dataset.action
    if (!action) return
    actionsMenu.close()
    actions[action]?.()
  })

  // Welcome screen
  document.getElementById('welcome-new-btn')!.addEventListener('click', showNewPluginModal)
  document.getElementById('welcome-import-btn')!.addEventListener('click', uploadPluginFromFile)
  document.getElementById('welcome-all-btn')!.addEventListener('click', () => pluginSwitcher?.open())

  // Settings (theme, font size, minimap, IDE)
  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement
  themeSelect.value = getSavedTheme()
  setupSettings(
    () => [state.editor, jsPreviewEditor].filter((e): e is monaco.editor.IStandaloneCodeEditor => !!e),
    (theme) => changeTheme(theme),
    showDevServerModal
  )

  // Toggle agent panel
  const toggleAgentBtn = document.getElementById('toggle-agent-btn')!
  toggleAgentBtn.addEventListener('click', () => {
    if (agentPanel) {
      agentPanel.toggle()
    }
  })

  // Toggle JS preview panel
  const toggleJsPreviewBtn = document.getElementById('toggle-js-preview-btn')!
  toggleJsPreviewBtn.addEventListener('click', toggleJsPreview)

  const jsPreviewCloseBtn = document.getElementById('js-preview-close-btn')!
  jsPreviewCloseBtn.addEventListener('click', () => {
    jsPreviewVisible = false
    document.getElementById('js-preview-panel')!.style.display = 'none'
    toggleJsPreviewBtn.classList.remove('active')
  })

  const jsPreviewRefreshBtn = document.getElementById('js-preview-refresh-btn')!
  jsPreviewRefreshBtn.addEventListener('click', refreshJsPreview)

  const jsPreviewCopyBtn = document.getElementById('js-preview-copy-btn')!
  jsPreviewCopyBtn.addEventListener('click', copyJsPreview)

  // New plugin modal
  const newPluginCancel = document.getElementById('new-plugin-cancel')!
  newPluginCancel.addEventListener('click', hideNewPluginModal)

  const newPluginCreate = document.getElementById('new-plugin-create')!
  newPluginCreate.addEventListener('click', createNewPluginHandler)

  const newPluginName = document.getElementById('new-plugin-name') as HTMLInputElement
  newPluginName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      createNewPluginHandler()
    }
  })

  // New file modal
  const addFileBtn = document.getElementById('add-file-btn')!
  addFileBtn.addEventListener('click', () => {
    if (!state.currentPlugin) {
      updateStatus('No plugin loaded', 'error')
      return
    }
    showNewFileModal()
  })

  const newFileCancel = document.getElementById('new-file-cancel')!
  newFileCancel.addEventListener('click', hideNewFileModal)

  const newFileCreate = document.getElementById('new-file-create')!
  newFileCreate.addEventListener('click', createNewFile)

  const newFilePath = document.getElementById('new-file-path') as HTMLInputElement
  newFilePath.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      createNewFile()
    }
  })

  // File list context menu for empty space
  const fileList = document.getElementById('file-list')!
  fileList.addEventListener('contextmenu', (e) => {
    const target = e.target as HTMLElement
    const isFileItem = target.closest('.file-item, .folder-item')

    if (!isFileItem) {
      e.preventDefault()
      e.stopPropagation()
      showRootContextMenu(e.clientX, e.clientY)
    }
  })

  // File list drag and drop support
  fileList.addEventListener('dragover', (e) => {
    const target = e.target as HTMLElement
    if (target.id === 'file-list' || (!target.closest('.file-item') && !target.closest('.folder-item'))) {
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'move'
      fileList.classList.add('drag-over-root')
    }
  })

  fileList.addEventListener('dragleave', (e) => {
    const target = e.target as HTMLElement
    if (target.id === 'file-list') {
      fileList.classList.remove('drag-over-root')
    }
  })

  fileList.addEventListener('drop', (e) => {
    const target = e.target as HTMLElement
    if (target.id === 'file-list' || (!target.closest('.file-item') && !target.closest('.folder-item'))) {
      e.preventDefault()
      e.stopPropagation()
      fileList.classList.remove('drag-over-root')

      const sourceFilePath = e.dataTransfer!.getData('text/plain')
      if (sourceFilePath) {
        moveFileToDirectoryWrapper(sourceFilePath, '')
      }
    }
  })

  // Context menu event handlers
  const contextMenu = document.getElementById('context-menu')
  if (!contextMenu) {
    console.error('Context menu element not found!')
    return
  }

  contextMenu.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (target.classList.contains('context-menu-item')) {
      const action = target.dataset.action
      if (action) {
        handleContextMenuAction(action)
      }
    }
  })

  // Close context menu on outside click
  document.addEventListener('contextmenu', (e) => {
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return
    }

    const menu = document.getElementById('context-menu')!
    if (menu.style.display === 'block') {
      menu.style.display = 'none'
    }
  })

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      saveCurrentPlugin()
    }
  })

  // Ctrl+O: switch plugin. Capture phase, so it wins over Monaco and the
  // browser's own "open file".
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'o') {
      e.preventDefault()
      e.stopPropagation()
      pluginSwitcher?.open()
    }
  }, true)

  // Warn before closing window/tab with unsaved changes
  window.addEventListener('beforeunload', (e) => {
    if (isPluginDirty()) {
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
  })

  // File picker input
  const filePickerInput = document.getElementById('file-picker-input') as HTMLInputElement
  filePickerInput.addEventListener('input', (e) => {
    const filter = (e.target as HTMLInputElement).value
    renderFilePickerList(filter)
  })

  filePickerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const firstItem = document.querySelector('.file-picker-item') as HTMLElement
      if (firstItem) {
        firstItem.click()
      }
    }
  })

  // File tree resizer
  const fileTree = document.getElementById('file-tree')!
  const resizer = document.getElementById('file-tree-resizer')!
  let isResizing = false
  let startX = 0
  let startWidth = 0

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true
    startX = e.clientX
    startWidth = fileTree.offsetWidth
    resizer.classList.add('resizing')
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  })

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return

    const delta = e.clientX - startX
    const newWidth = startWidth + delta

    // Apply min/max constraints
    const minWidth = 150
    const maxWidth = 600
    const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth))

    fileTree.style.width = `${constrainedWidth}px`
  })

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false
      resizer.classList.remove('resizing')
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  })

  // Agent panel resizer
  const agentPanelElement = document.getElementById('agent-panel')!
  const agentResizer = document.getElementById('agent-resizer')!
  let isResizingAgent = false
  let startAgentX = 0
  let startAgentWidth = 0

  agentResizer.addEventListener('mousedown', (e) => {
    isResizingAgent = true
    startAgentX = e.clientX
    startAgentWidth = agentPanelElement.offsetWidth
    agentResizer.classList.add('resizing')
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  })

  document.addEventListener('mousemove', (e) => {
    if (!isResizingAgent) return

    // For right-side panel, moving mouse left increases width
    const delta = startAgentX - e.clientX
    const newWidth = startAgentWidth + delta

    // Apply min/max constraints
    const minWidth = 300
    const maxWidth = 800
    const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth))

    agentPanelElement.style.width = `${constrainedWidth}px`
  })

  document.addEventListener('mouseup', () => {
    if (isResizingAgent) {
      isResizingAgent = false
      agentResizer.classList.remove('resizing')
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  })

  // JS Preview panel resizer
  const jsPreviewPanelElement = document.getElementById('js-preview-panel')!
  const jsPreviewResizer = document.getElementById('js-preview-resizer')!
  let isResizingJsPreview = false
  let startJsPreviewX = 0
  let startJsPreviewWidth = 0

  jsPreviewResizer.addEventListener('mousedown', (e) => {
    isResizingJsPreview = true
    startJsPreviewX = e.clientX
    startJsPreviewWidth = jsPreviewPanelElement.offsetWidth
    jsPreviewResizer.classList.add('resizing')
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
    e.preventDefault()
  })

  document.addEventListener('mousemove', (e) => {
    if (!isResizingJsPreview) return

    // For right-side panel, moving mouse left increases width
    const delta = startJsPreviewX - e.clientX
    const newWidth = startJsPreviewWidth + delta

    // Apply min/max constraints
    const minWidth = 200
    const maxWidth = 800
    const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth))

    jsPreviewPanelElement.style.width = `${constrainedWidth}px`
  })

  document.addEventListener('mouseup', () => {
    if (isResizingJsPreview) {
      isResizingJsPreview = false
      jsPreviewResizer.classList.remove('resizing')
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  })

  // Dev server modal event listeners
  const devServerStatus = document.getElementById('dev-server-status')!
  devServerStatus.addEventListener('click', showDevServerModal)

  const devServerCancel = document.getElementById('dev-server-cancel')!
  devServerCancel.addEventListener('click', hideDevServerModal)

  const devServerConnect = document.getElementById('dev-server-connect')!
  devServerConnect.addEventListener('click', () => {
    const devServer = getDevServer()
    const hostInput = document.getElementById('dev-server-host') as HTMLInputElement
    const portInput = document.getElementById('dev-server-port') as HTMLInputElement
    const autoReconnectCheck = document.getElementById('dev-server-auto-reconnect') as HTMLInputElement

    devServer.setConfig({
      host: hostInput.value || 'localhost',
      port: parseInt(portInput.value) || 9877,
      autoReconnect: autoReconnectCheck.checked,
    })

    devServer.connect()
  })

  const devServerDisconnect = document.getElementById('dev-server-disconnect')!
  devServerDisconnect.addEventListener('click', () => {
    const devServer = getDevServer()
    devServer.disconnect()
  })

  // Close modal on backdrop click
  const devServerModal = document.getElementById('dev-server-modal')!
  devServerModal.addEventListener('click', (e) => {
    if (e.target === devServerModal) {
      hideDevServerModal()
    }
  })
}

// Initialize
async function init() {
  updateStatus('Initializing...', 'normal')

  const container = document.getElementById('editor-container')!
  state.editor = await initializeEditor(container, updateStatus, showFilePickerHandler, switchToFile)

  // Initialize agent panel
  agentPanel = new CodingAgentPanel(() => ({
    plugin: state.currentPlugin,
    pluginId: state.currentPluginId,
    editor: state.editor,
    editorModels: state.editorModels,
    modifiedFiles: state.modifiedFiles,
    currentFilePath: state.currentFilePath,
    updateStatus,
    renderFileTree: renderCurrentFileTree,
    switchToFile
  }))

  refreshStatusBar = setupStatusBar(
    state.editor,
    () => state.currentPluginId,
    (filePath, position) => switchToFile(filePath, position)
  )

  await initEsbuild(updateStatus)
  await reloadPluginList()
  setupEventListeners()
  setupDevServer()

  // ?plugin=<id> opens that plugin; without it the welcome screen shows.
  const urlParams = new URLSearchParams(window.location.search)
  const pluginIdFromUrl = urlParams.get('plugin')

  if (pluginIdFromUrl && pluginList.some(p => p.id === pluginIdFromUrl)) {
    await loadPlugin(pluginIdFromUrl)
  } else {
    closePlugin()
  }

  updateStatus('Ready', 'success')
}

init()
