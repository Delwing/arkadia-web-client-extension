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
import {updateLanguageUI, updateStatus} from './utils'
import {bundlePlugin, compileTypeScript, initEsbuild} from './bundler'
import {
  initializeEditor,
  registerAutoImportCompletion,
  registerImportPathCompletion,
  updateMonacoFileSystem,
  changeTheme,
  getSavedTheme,
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
import {adoptStoredPlugin, createNewPlugin, deletePlugin, downloadPlugin, refreshPluginList, savePlugin, uploadPlugin,} from './pluginManagement'
import { getDevServer, type DevServerStatus } from './devServer'
import pluginApiTypes from '../plugin-types/index.d.ts?raw'
import {IPosition, IRange} from "monaco-editor";
import {CodingAgentPanel} from './codingAgentPanel';

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

// Switch to a different file in the editor
function switchToFile(filePath: string, position?: IPosition | IRange) {

  if (!state.currentPlugin || !state.editor) return

    if (filePath.startsWith("@types")) {
      const model = monaco.editor.createModel(
          pluginApiTypes,
          "typescript",
          monaco.Uri.parse("file:plugin-api.ts")
      )
      state.editor.updateOptions({readOnly: true})
        state.editor.setModel(model)
      state.editor.onDidChangeModel(() => {
        model.dispose()
      })

      if (position !== undefined) {
        if ("startLineNumber" in position) {
          state.editor.setPosition({lineNumber: position.startLineNumber, column: position.startColumn})
          state.editor.revealLineInCenter(position.startLineNumber)
        } else if ("lineNumber" in position) {
          state.editor.setPosition(position)
          state.editor.revealLineInCenter(position.lineNumber)
        }
      }
        return;
    }


  state.editor.updateOptions({readOnly: false})

  // Save current file content before switching
  if (state.currentFilePath && state.editorModels.has(state.currentFilePath)) {
    const model = state.editorModels.get(state.currentFilePath)!
    const newContent = model.getValue()
    state.currentPlugin.files[state.currentFilePath].content = newContent

    // Update Monaco's virtual file system
    const uri = `file:///${state.currentPluginId}/${state.currentFilePath}`
    monaco.typescript.typescriptDefaults.addExtraLib(newContent, uri)
    monaco.typescript.javascriptDefaults.addExtraLib(newContent, uri)
  }

  state.currentFilePath = filePath
  const file = state.currentPlugin.files[filePath]

  if (!file) {
    updateStatus(`File not found: ${filePath}`, 'error')
    return
  }

  // Get or create model for this file
  let model = state.editorModels.get(filePath)
  if (!model) {
    const uri = monaco.Uri.parse(`file:///${state.currentPluginId}/${filePath}`)
    const existingModel = monaco.editor.getModel(uri)

    // If Monaco has a model but it's not in our editorModels map, dispose it
    // because it might be stale (created when navigating to old import paths)
    if (existingModel) {
      existingModel.dispose()
    }

    // Always create a fresh model with content from plugin.files
    model = monaco.editor.createModel(file.content, file.language, uri)

    state.editorModels.set(filePath, model)

    // Add the file to Monaco's virtual file system immediately
    const fileUri = `file:///${state.currentPluginId}/${filePath}`
    if (file.language === 'typescript' || file.language === 'javascript') {
      monaco.typescript.typescriptDefaults.addExtraLib(file.content, fileUri)
      monaco.typescript.javascriptDefaults.addExtraLib(file.content, fileUri)
    } else if (file.language === 'json') {
      // For JSON files, create a TypeScript declaration module with .d.ts extension
      const dtsUri = fileUri.replace('.json', '.json.d.ts')
      try {
        const jsonContent = JSON.parse(file.content || '{}')
        const inferredType = inferJsonType(jsonContent)
        const tsModuleContent = `declare const value: ${inferredType};
export default value;`
        monaco.typescript.typescriptDefaults.addExtraLib(tsModuleContent, dtsUri)
        monaco.typescript.javascriptDefaults.addExtraLib(tsModuleContent, dtsUri)
      } catch {
        const tsModuleContent = `declare const value: any;
export default value;`
        monaco.typescript.typescriptDefaults.addExtraLib(tsModuleContent, dtsUri)
        monaco.typescript.javascriptDefaults.addExtraLib(tsModuleContent, dtsUri)
      }
    }

    // Listen for content changes
    const capturedFilePath = filePath
    const capturedPluginId = state.currentPluginId
    model.onDidChangeContent(() => {
      if (state.currentPlugin?.files?.[capturedFilePath]) {
        const content = model.getValue()
        state.currentPlugin.files[capturedFilePath].content = content

        // Mark file as modified
        state.modifiedFiles.add(capturedFilePath)
        renderCurrentFileTree()

        // Send preview to IDE (if not receiving from IDE to prevent loop)
        if (!isReceivingFromIDE && capturedPluginId) {
          const devServer = getDevServer()
          if (devServer.getStatus() === 'connected') {
            devServer.sendFilePreview(capturedPluginId, capturedFilePath, content)
          }
        }

        // Update Monaco's virtual file system (for JS/TS/JSON files)
        const fileLanguage = state.currentPlugin.files[capturedFilePath].language
        const uri = `file:///${capturedPluginId}/${capturedFilePath}`

        if (fileLanguage === 'typescript' || fileLanguage === 'javascript') {
          monaco.typescript.typescriptDefaults.addExtraLib(content, uri)
          monaco.typescript.javascriptDefaults.addExtraLib(content, uri)
        } else if (fileLanguage === 'json') {
          // For JSON files, create a TypeScript module
          try {
            const jsonContent = JSON.parse(content || '{}')
            const inferredType = inferJsonType(jsonContent)
            const tsModuleContent = `const value: ${inferredType} = ${content || '{}'};
export default value;`
            monaco.typescript.typescriptDefaults.addExtraLib(tsModuleContent, uri)
            monaco.typescript.javascriptDefaults.addExtraLib(tsModuleContent, uri)
          } catch {
            const tsModuleContent = `const value: any = {};
export default value;`
            monaco.typescript.typescriptDefaults.addExtraLib(tsModuleContent, uri)
            monaco.typescript.javascriptDefaults.addExtraLib(tsModuleContent, uri)
          }
        }
      }
    })
  }

  state.editor.setModel(model)

  if (position !== undefined) {
    if ("startLineNumber" in position) {
      state.editor.setPosition({lineNumber: position.startLineNumber, column: position.startColumn})
      state.editor.revealLineInCenter(position.startLineNumber)
    } else if ("lineNumber" in position) {
      state.editor.setPosition(position)
      state.editor.revealLineInCenter(position.lineNumber)
    }
  }

  renderCurrentFileTree()
  updateStatus(`Editing: ${filePath}`, 'normal')
}

// Load plugin into editor
async function loadPlugin(pluginId: string) {
  let plugin = await getEditorPlugin(pluginId)
  if (!plugin) {
    // Plugins added through "Wklej kod" (older builds) live only in the runtime
    // script store; give them an editor record on first open so they can be
    // edited like any other plugin.
    plugin = await adoptStoredPlugin(pluginId)
    if (plugin) {
      await refreshPluginList(pluginId)
    }
  }
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
  state.currentFilePath = plugin.entryPoint
  state.modifiedFiles.clear()

  // Notify dev server about current plugin
  getDevServer().setCurrentPluginId(pluginId)

  const nameInput = document.getElementById('plugin-name') as HTMLInputElement
  nameInput.value = plugin.name

  const langSelect = document.getElementById('language-select') as HTMLSelectElement
  langSelect.value = getLanguageFromPath(state.currentFilePath!)

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

  // Create models for all files
  for (const [filePath, file] of Object.entries(plugin.files)) {
    const uri = monaco.Uri.parse(`file:///${pluginId}/${filePath}`)
    const model = monaco.editor.createModel(file.content, file.language, uri)
    state.editorModels.set(filePath, model)

    // Attach content change listener
    const capturedFilePath = filePath
    const capturedPluginId = pluginId
    model.onDidChangeContent(() => {
      if (state.currentPlugin?.files?.[capturedFilePath]) {
        const content = model.getValue()
        state.currentPlugin.files[capturedFilePath].content = content
        state.modifiedFiles.add(capturedFilePath)
        renderCurrentFileTree()

        // Send preview to IDE (if not receiving from IDE to prevent loop)
        if (!isReceivingFromIDE && capturedPluginId) {
          const devServer = getDevServer()
          if (devServer.getStatus() === 'connected') {
            devServer.sendFilePreview(capturedPluginId, capturedFilePath, content)
          }
        }

        // Update Monaco's virtual file system
        const fileLanguage = state.currentPlugin.files[capturedFilePath].language
        const uri = `file:///${capturedPluginId}/${capturedFilePath}`

        if (fileLanguage === 'typescript' || fileLanguage === 'javascript') {
          monaco.typescript.typescriptDefaults.addExtraLib(content, uri)
          monaco.typescript.javascriptDefaults.addExtraLib(content, uri)
        } else if (fileLanguage === 'json') {
          // For JSON files, create a TypeScript declaration module with .d.ts extension
          const dtsUri = uri.replace('.json', '.json.d.ts')
          try {
            const jsonContent = JSON.parse(content || '{}')
            const inferredType = inferJsonType(jsonContent)
            const tsModuleContent = `declare const value: ${inferredType};
export default value;`
            monaco.typescript.typescriptDefaults.addExtraLib(tsModuleContent, dtsUri)
            monaco.typescript.javascriptDefaults.addExtraLib(tsModuleContent, dtsUri)
          } catch {
            const tsModuleContent = `declare const value: any;
export default value;`
            monaco.typescript.typescriptDefaults.addExtraLib(tsModuleContent, dtsUri)
            monaco.typescript.javascriptDefaults.addExtraLib(tsModuleContent, dtsUri)
          }
        }
      }
    })
  }

  // Render file tree
  renderCurrentFileTree()

  // Load the entry point file
  switchToFile(state.currentFilePath!)

  const language = getLanguageFromPath(state.currentFilePath!)
  // Only update language UI for JS/TS files
  if (language === 'javascript' || language === 'typescript') {
    updateLanguageUI(language)
  }
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

  const uri = `file:///${filePath}`
  monaco.typescript.typescriptDefaults.addExtraLib('', uri)
  monaco.typescript.javascriptDefaults.addExtraLib('', uri)

  renderCurrentFileTree()
  switchToFile(filePath)
  hideNewFileModal()
  updateStatus(`Created: ${filePath}`, 'success')
}

// Save plugin wrapper
async function saveCurrentPlugin() {
  if (!state.currentPlugin || !state.editor) {
    updateStatus('No plugin loaded', 'error')
    return
  }

  // Update current file content before saving
  if (state.currentFilePath && state.currentPlugin.files[state.currentFilePath]) {
    state.currentPlugin.files[state.currentFilePath].content = state.editor.getValue()
  }

  try {
    const result = await savePlugin(
      state.currentPlugin,
      state.currentPluginId,
      state.editor.getValue(),
      state.modifiedFiles,
      bundlePlugin,
      updateStatus
    )

    state.currentPluginId = result.id

    // Refresh plugin list
    await refreshPluginList(state.currentPluginId)

    // Select the saved plugin
    const pluginSelect = document.getElementById('plugin-select') as HTMLSelectElement
    pluginSelect.value = result.id

    renderCurrentFileTree()
  } catch {
    // Error already handled by savePlugin
  }
}

// Delete plugin wrapper
async function deleteCurrentPlugin() {
  if (!state.currentPluginId || !state.editor) {
    updateStatus('No plugin selected', 'error')
    return
  }

  await deletePlugin(state.currentPluginId, updateStatus)

  // Clear all editor models
  state.editorModels.forEach(model => model.dispose())
  state.editorModels.clear()

  // Dispose Monaco models
  monaco.editor.getModels().forEach(model => {
    const uriString = model.uri.toString()
    if (uriString.startsWith('file:///') && !uriString.includes('plugin-api')) {
      model.dispose()
    }
  })

  // Clear state
  state.currentPluginId = null
  state.currentPlugin = null
  state.currentFilePath = null
  state.modifiedFiles.clear()

  state.editor.setValue('')

  const nameInput = document.getElementById('plugin-name') as HTMLInputElement
  nameInput.value = ''

  // Show disabled file tree
  showDisabledFileTree()

  await refreshPluginList(null)
}

// Create new plugin wrapper
async function createNewPluginHandler() {
  try {
    const pluginData = await createNewPlugin(bundlePlugin)

    hideNewPluginModal()
    await refreshPluginList(pluginData.id)
    await loadPlugin(pluginData.id)

    const pluginSelect = document.getElementById('plugin-select') as HTMLSelectElement
    pluginSelect.value = pluginData.id
  } catch (error) {
    alert((error as Error).message)
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
      await refreshPluginList(pluginData.id)
      await loadPlugin(pluginData.id)

      const pluginSelect = document.getElementById('plugin-select') as HTMLSelectElement
      pluginSelect.value = pluginData.id
    }
  }

  input.click()
}

// Manual compile button
async function manualCompile() {
  if (!state.editor) return

  const source = state.editor.getValue()
  try {
    updateStatus('Compiling TypeScript...', 'normal')
    const compiled = await compileTypeScript(source)
    const compileStatus = document.getElementById('compile-status')!
    compileStatus.textContent = '✓ Compiled successfully'
    setTimeout(() => compileStatus.textContent = '', 3000)
    updateStatus('TypeScript compiled successfully', 'success')
    console.log('Compiled JavaScript:', compiled)
  } catch (error) {
    updateStatus('Compilation failed: ' + (error as Error).message, 'error')
  }
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
    fontSize: 13,
    lineNumbers: 'on',
    folding: true,
  })
}

function toggleJsPreview() {
  const panel = document.getElementById('js-preview-panel')!
  jsPreviewVisible = !jsPreviewVisible

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
    item.style.cssText = `
      padding: 8px 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      border-radius: 3px;
      font-size: 13px;
    `

    const iconClass = FileIcons.getClassWithColor(filePath)
    const icon = document.createElement('span')
    icon.className = iconClass
    item.appendChild(icon)

    const text = document.createElement('span')
    text.textContent = filePath
    item.appendChild(text)

    item.addEventListener('mouseenter', () => {
      item.style.background = '#2a2d2e'
    })
    item.addEventListener('mouseleave', () => {
      item.style.background = ''
    })

    item.addEventListener('click', () => {
      switchToFile(filePath)
      closeFilePicker()
    })

    if (index === 0) {
      item.style.background = '#2a2d2e'
    }

    list.appendChild(item)
  })

  if (filteredFiles.length === 0) {
    list.innerHTML = '<div style="padding: 12px; color: #999; text-align: center;">No files found</div>'
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

  // Set up plugin update callback
  devServer.setOnPluginUpdate(async (pluginId, plugin) => {
    console.log('[DevServer] Plugin updated:', pluginId)

    // If this is the currently loaded plugin, update it
    if (state.currentPluginId === pluginId) {
      // Update the in-memory plugin data
      state.currentPlugin = plugin

      // Track which files were updated from IDE
      const updatedFromIDE = new Set<string>()

      // Update editor models with new file contents
      for (const [filePath, file] of Object.entries(plugin.files)) {
        const model = state.editorModels.get(filePath)
        if (model) {
          const currentValue = model.getValue()
          if (currentValue !== file.content) {
            updatedFromIDE.add(filePath)
            model.setValue(file.content)
          }
        }
      }

      // Clear modified status for files updated from IDE
      // (the model change listener would have re-added them)
      for (const filePath of updatedFromIDE) {
        state.modifiedFiles.delete(filePath)
      }

      // Re-render file tree
      renderCurrentFileTree()
      updateStatus(`Plugin updated from IDE: ${plugin.name}`, 'success')
    }

    // Refresh plugin list in case a new plugin was added
    await refreshPluginList(state.currentPluginId)
  })

  // Set up reload request callback
  devServer.setOnReloadRequest((pluginId) => {
    console.log('[DevServer] Reload requested for plugin:', pluginId)
    if (state.currentPluginId === pluginId) {
      loadPlugin(pluginId)
    }
  })

  // Set up plugin selected from IDE callback
  devServer.setOnPluginSelectedFromIDE(async (pluginId) => {
    console.log('[DevServer] IDE selected plugin:', pluginId)

    // If this is already the current plugin, do nothing
    if (state.currentPluginId === pluginId) {
      return
    }

    // Warn if there are unsaved changes
    if (state.modifiedFiles.size > 0) {
      const confirmed = confirm(
        'IDE wants to switch plugins. You have unsaved changes. Continue? All unsaved changes will be lost.'
      )
      if (!confirmed) {
        return
      }
    }

    // Load the plugin
    await loadPlugin(pluginId)

    // Update the dropdown
    const pluginSelect = document.getElementById('plugin-select') as HTMLSelectElement
    pluginSelect.value = pluginId

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

  // Set up file saved from IDE callback (clears modified status)
  devServer.setOnFileSavedFromIDE((pluginId, filePaths) => {
    if (state.currentPluginId !== pluginId) {
      return
    }

    // Clear modified status for files that were saved in IDE
    for (const filePath of filePaths) {
      state.modifiedFiles.delete(filePath)
    }
    renderCurrentFileTree()
  })

  // Set up file preview callback (live sync as you type, without saving)
  devServer.setOnFilePreview((pluginId, files) => {
    // Only process if this is the current plugin
    if (state.currentPluginId !== pluginId) {
      return
    }

    // Set flag to prevent sending preview back to IDE
    isReceivingFromIDE = true

    for (const file of files) {
      const model = state.editorModels.get(file.path)
      if (model) {
        const currentValue = model.getValue()
        // Only update if content is different
        if (currentValue !== file.content) {
          // Preserve cursor position
          const position = state.editor?.getPosition()
          const selection = state.editor?.getSelection()

          // Update model content directly (this won't trigger save to IndexedDB)
          model.setValue(file.content)

          // Restore cursor position if editing the same file
          if (state.currentFilePath === file.path && state.editor) {
            if (selection) {
              state.editor.setSelection(selection)
            } else if (position) {
              state.editor.setPosition(position)
            }
          }
        }
      }
    }

    isReceivingFromIDE = false
  })

  // Initialize UI
  updateDevServerUI(devServer.getStatus())
}

// Event listeners setup
function setupEventListeners() {
  const pluginSelect = document.getElementById('plugin-select') as HTMLSelectElement
  pluginSelect.addEventListener('change', (e) => {
    const target = e.target as HTMLSelectElement
    if (target.value) {
      // Warn if there are unsaved changes
      if (state.modifiedFiles.size > 0) {
        const confirmed = confirm(
          'You have unsaved changes. Are you sure you want to switch plugins? All unsaved changes will be lost.'
        )
        if (!confirmed) {
          // Revert the dropdown selection
          target.value = state.currentPluginId || ''
          return
        }
      }
      loadPlugin(target.value)

      // Notify IDE about plugin selection
      const devServer = getDevServer()
      if (devServer.getStatus() === 'connected') {
        devServer.sendPluginSelected(target.value)
      }
    }
  })

  const saveBtn = document.getElementById('save-btn')!
  saveBtn.addEventListener('click', saveCurrentPlugin)

  const newBtn = document.getElementById('new-btn')!
  newBtn.addEventListener('click', showNewPluginModal)

  const deleteBtn = document.getElementById('delete-btn')!
  deleteBtn.addEventListener('click', deleteCurrentPlugin)

  const downloadBtn = document.getElementById('download-btn')!
  downloadBtn.addEventListener('click', downloadCurrentPlugin)

  const uploadBtn = document.getElementById('upload-btn')!
  uploadBtn.addEventListener('click', uploadPluginFromFile)

  const compileBtn = document.getElementById('compile-btn')!
  compileBtn.addEventListener('click', manualCompile)

  const langSelect = document.getElementById('language-select') as HTMLSelectElement
  langSelect.addEventListener('change', (e) => {
    const target = e.target as HTMLSelectElement
    const language = target.value as 'javascript' | 'typescript'
    const currentModel = state.editor!.getModel()

    if (currentModel) {
      const currentValue = currentModel.getValue()
      currentModel.dispose()

      const extension = language === 'typescript' ? 'ts' : 'js'
      const uri = monaco.Uri.parse(`file:///plugin.${extension}`)
      const newModel = monaco.editor.createModel(currentValue, language, uri)

      state.editor!.setModel(newModel)
    }

    updateLanguageUI(language)
  })

  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement
  themeSelect.value = getSavedTheme()
  themeSelect.addEventListener('change', (e) => {
    const target = e.target as HTMLSelectElement
    changeTheme(target.value)
    // Also update JS preview editor theme
    if (jsPreviewEditor) {
      monaco.editor.setTheme(target.value)
    }
  })

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

  // Warn before closing window/tab with unsaved changes
  window.addEventListener('beforeunload', (e) => {
    if (state.modifiedFiles.size > 0) {
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

  await initEsbuild(updateStatus)
  await refreshPluginList(null)
  setupEventListeners()
  setupDevServer()

  // Check if there's a plugin parameter in the URL
  const urlParams = new URLSearchParams(window.location.search)
  const pluginIdFromUrl = urlParams.get('plugin')

  if (pluginIdFromUrl) {
    // Auto-load the plugin from URL parameter
    await loadPlugin(pluginIdFromUrl)
    const pluginSelect = document.getElementById('plugin-select') as HTMLSelectElement
    pluginSelect.value = pluginIdFromUrl
  } else {
    // Show disabled state if no plugin is loaded
    showDisabledFileTree()
  }

  updateStatus('Ready', 'success')
}

init()
