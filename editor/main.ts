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
  getEditorPlugin,
  migrateLegacyPlugin,
  createPluginFile,
  getLanguageFromPath,
} from '@client/utils/pluginEditorStorage.ts'

// Import our refactored modules
import type { EditorState } from './types'
import { updateStatus, updateLanguageUI } from './utils'
import { initEsbuild, bundlePlugin, compileTypeScript } from './bundler'
import { initializeEditor, updateMonacoFileSystem, registerImportPathCompletion, registerAutoImportCompletion } from './monacoSetup'
import { renderFileTree } from './fileTree'
import {
  showContextMenu,
  showFolderContextMenu,
  showRootContextMenu,
  getContextMenuTarget,
  hideContextMenu,
  clearContextMenuTarget,
} from './contextMenu'
import {
  deleteFile,
  deleteFolder,
  renameFile,
  moveFileToDirectory,
  createFileInline,
  createFolderInline,
} from './fileOperations'
import {
  showNewPluginModal,
  hideNewPluginModal,
  showNewFileModal,
  hideNewFileModal,
  showFilePicker,
  closeFilePicker,
} from './modals'
import {
  refreshPluginList,
  savePlugin,
  deletePlugin,
  createNewPlugin,
} from './pluginManagement'

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

// Store completion provider disposers
let disposeImportPathProvider: (() => void) | null = null
let disposeAutoImportProvider: (() => void) | null = null

// File tree render wrapper
function renderCurrentFileTree() {
  if (!state.currentPlugin) return

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
function switchToFile(filePath: string) {
  if (!state.currentPlugin || !state.editor) return

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
  renderCurrentFileTree()
  updateStatus(`Editing: ${filePath}`, 'normal')
}

// Load plugin into editor
async function loadPlugin(pluginId: string) {
  let plugin = await getEditorPlugin(pluginId)
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

  updateLanguageUI(getLanguageFromPath(state.currentFilePath!))
  updateStatus(`Loaded: ${plugin.name}`, 'success')
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

    fileItem.classList.add('renaming')
    const input = fileItem.querySelector('.rename-input') as HTMLInputElement
    if (!input) return

    input.value = ''
    input.focus()

    const finishCreation = async () => {
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

    const folderNameSpan = folderItem.querySelector('.folder-name') as HTMLElement
    if (!folderNameSpan) return

    const input = document.createElement('input')
    input.type = 'text'
    input.value = ''
    input.className = 'rename-input'
    input.style.display = 'block'
    input.style.flex = '1'

    folderNameSpan.style.display = 'none'
    folderItem.appendChild(input)
    input.focus()

    const finishCreation = async () => {
      const newFolderName = input.value.trim()
      input.remove()
      folderNameSpan.style.display = ''

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

  state.currentPluginId = null
  state.editor.setValue('')

  const nameInput = document.getElementById('plugin-name') as HTMLInputElement
  nameInput.value = ''

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

// Event listeners setup
function setupEventListeners() {
  const pluginSelect = document.getElementById('plugin-select') as HTMLSelectElement
  pluginSelect.addEventListener('change', (e) => {
    const target = e.target as HTMLSelectElement
    if (target.value) {
      loadPlugin(target.value)
    }
  })

  const saveBtn = document.getElementById('save-btn')!
  saveBtn.addEventListener('click', saveCurrentPlugin)

  const newBtn = document.getElementById('new-btn')!
  newBtn.addEventListener('click', showNewPluginModal)

  const deleteBtn = document.getElementById('delete-btn')!
  deleteBtn.addEventListener('click', deleteCurrentPlugin)

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
}

// Initialize
async function init() {
  updateStatus('Initializing...', 'normal')

  const container = document.getElementById('editor-container')!
  state.editor = await initializeEditor(container, updateStatus, showFilePickerHandler, switchToFile)

  await initEsbuild(updateStatus)
  await refreshPluginList(null)
  setupEventListeners()

  // Check if there's a plugin parameter in the URL
  const urlParams = new URLSearchParams(window.location.search)
  const pluginIdFromUrl = urlParams.get('plugin')

  if (pluginIdFromUrl) {
    // Auto-load the plugin from URL parameter
    await loadPlugin(pluginIdFromUrl)
    const pluginSelect = document.getElementById('plugin-select') as HTMLSelectElement
    pluginSelect.value = pluginIdFromUrl
  }

  updateStatus('Ready', 'success')
}

init()
