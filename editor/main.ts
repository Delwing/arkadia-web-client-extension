import * as monaco from 'monaco-editor'
import * as esbuild from 'esbuild-wasm'
import * as FileIcons from 'file-icons-js'

// Import Monaco workers using Vite's worker syntax
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

// Import Plugin API type definitions as raw string
import pluginApiTypes from './plugin-api.d.ts?raw'

// Import file-icons CSS
import 'file-icons-js/css/style.css'

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

// Import editor storage (this is the only shared code)
import type { EditorPluginData, PluginFile } from '../src/client/utils/pluginEditorStorage'
import {
  storeEditorPlugin,
  getEditorPlugin,
  deleteEditorPlugin,
  getAllEditorPlugins,
  generateEditorPluginId,
  migrateLegacyPlugin,
  createPluginFile,
  getLanguageFromPath,
} from '../src/client/utils/pluginEditorStorage'

// Import plugin storage to sync compiled JS
import {
  storePluginScript,
  updatePluginScript,
  deletePluginScript,
} from '../src/client/utils/pluginStorage'

let editor: monaco.editor.IStandaloneCodeEditor
let currentPluginId: string | null = null
let currentFilePath: string | null = null
let currentPlugin: EditorPluginData | null = null
let editorModels: Map<string, monaco.editor.ITextModel> = new Map()
let esbuildInitialized = false

// Initialize esbuild WASM
async function initEsbuild() {
  if (esbuildInitialized) return
  try {
    await esbuild.initialize({
      wasmURL: 'https://unpkg.com/esbuild-wasm@0.27.0/esbuild.wasm',
    })
    esbuildInitialized = true
    updateStatus('esbuild initialized', 'success')
  } catch (error) {
    console.error('Failed to initialize esbuild:', error)
    updateStatus('Failed to initialize esbuild', 'error')
  }
}

// Status bar updates
function updateStatus(message: string, type: 'normal' | 'success' | 'error' = 'normal') {
  const statusBar = document.getElementById('status-bar')!
  const statusText = document.getElementById('status-text')!
  statusText.textContent = message

  statusBar.className = ''
  if (type === 'success') statusBar.classList.add('success')
  if (type === 'error') statusBar.classList.add('error')
}

// Bundle plugin files into single JavaScript output
async function bundlePlugin(files: Record<string, PluginFile>, entryPoint: string): Promise<string> {
  if (!esbuildInitialized) {
    await initEsbuild()
  }

  try {
    // Create a virtual file system plugin for esbuild
    const virtualFsPlugin: esbuild.Plugin = {
      name: 'virtual-fs',
      setup(build) {
        // Intercept imports starting with ./ or ../
        build.onResolve({ filter: /^\./ }, args => {
          // Resolve relative paths
          const dir = args.importer ? args.importer.substring(0, args.importer.lastIndexOf('/')) : ''
          let resolved = args.path

          if (resolved.startsWith('./')) {
            resolved = dir ? `${dir}/${resolved.substring(2)}` : resolved.substring(2)
          } else if (resolved.startsWith('../')) {
            const parts = dir.split('/').filter(p => p)
            const upCount = (resolved.match(/\.\.\//g) || []).length
            const remainingPath = resolved.replace(/\.\.\//g, '')
            const newParts = parts.slice(0, parts.length - upCount)
            resolved = newParts.length ? `${newParts.join('/')}/${remainingPath}` : remainingPath
          }

          // Add extension if missing
          if (!resolved.endsWith('.ts') && !resolved.endsWith('.js')) {
            if (files[`${resolved}.ts`]) {
              resolved = `${resolved}.ts`
            } else if (files[`${resolved}.js`]) {
              resolved = `${resolved}.js`
            }
          }

          return {
            path: resolved,
            namespace: 'plugin-vfs'
          }
        })

        // Load files from virtual file system
        build.onLoad({ filter: /.*/, namespace: 'plugin-vfs' }, args => {
          const file = files[args.path]

          if (!file) {
            return {
              errors: [{
                text: `File not found: ${args.path}`,
                location: null
              }]
            }
          }

          return {
            contents: file.content,
            loader: file.language === 'typescript' ? 'ts' : 'js'
          }
        })

        // Handle entry point resolution
        build.onResolve({ filter: /^entry$/ }, () => {
          return {
            path: entryPoint,
            namespace: 'plugin-vfs'
          }
        })
      }
    }

    // Bundle using esbuild
    const result = await esbuild.build({
      stdin: {
        contents: `export * from 'entry'`,
        resolveDir: '/',
        loader: 'js'
      },
      bundle: true,
      format: 'esm',
      target: 'es2020',
      write: false,
      plugins: [virtualFsPlugin],
    })

    if (result.outputFiles && result.outputFiles.length > 0) {
      return result.outputFiles[0].text
    }

    throw new Error('No output generated')
  } catch (error) {
    console.error('Bundle failed:', error)
    throw error
  }
}

// Compile TypeScript to JavaScript (legacy single-file support)
async function compileTypeScript(source: string): Promise<string> {
  if (!esbuildInitialized) {
    await initEsbuild()
  }

  try {
    const result = await esbuild.transform(source, {
      loader: 'ts',
      target: 'es2020',
      format: 'esm',
    })
    return result.code
  } catch (error) {
    console.error('TypeScript compilation failed:', error)
    throw error
  }
}

// Build tree structure from flat file list
interface TreeNode {
  name: string
  path: string
  isDirectory: boolean
  children: TreeNode[]
  file?: PluginFile
}

function buildFileTree(files: Record<string, PluginFile>, folders: string[] = []): TreeNode {
  const root: TreeNode = {
    name: '',
    path: '',
    isDirectory: true,
    children: []
  }

  // First, create all folder nodes from the folders array
  folders.forEach(folderPath => {
    const parts = folderPath.split('/')
    let currentNode = root

    parts.forEach((part, index) => {
      const pathSoFar = parts.slice(0, index + 1).join('/')
      let childNode = currentNode.children.find(n => n.name === part)

      if (!childNode) {
        childNode = {
          name: part,
          path: pathSoFar,
          isDirectory: true,
          children: []
        }
        currentNode.children.push(childNode)
      }

      currentNode = childNode
    })
  })

  // Then add files (this will also create parent directories as needed)
  const sortedFiles = Object.values(files).sort((a, b) => a.path.localeCompare(b.path))

  sortedFiles.forEach(file => {
    const parts = file.path.split('/')
    let currentNode = root

    parts.forEach((part, index) => {
      const isLastPart = index === parts.length - 1
      const pathSoFar = parts.slice(0, index + 1).join('/')

      let childNode = currentNode.children.find(n => n.name === part)

      if (!childNode) {
        childNode = {
          name: part,
          path: pathSoFar,
          isDirectory: !isLastPart,
          children: [],
          file: isLastPart ? file : undefined
        }
        currentNode.children.push(childNode)
      }

      currentNode = childNode
    })
  })

  return root
}

// Render a tree node recursively
function renderTreeNode(node: TreeNode, container: HTMLElement, totalFiles: number) {
  if (node.isDirectory) {
    // Render folder
    const folderDiv = document.createElement('div')
    folderDiv.className = 'file-tree-item'

    const folderItem = document.createElement('div')
    folderItem.className = 'folder-item'
    folderItem.dataset.path = node.path // Add data-path for folder rename

    const toggle = document.createElement('span')
    toggle.className = 'folder-toggle expanded'
    toggle.textContent = '▶'

    const folderIcon = document.createElement('span')
    folderIcon.className = 'folder-icon'
    folderIcon.textContent = '📁'

    const folderName = document.createElement('span')
    folderName.className = 'folder-name'
    folderName.textContent = node.name

    folderItem.appendChild(toggle)
    folderItem.appendChild(folderIcon)
    folderItem.appendChild(folderName)

    const childrenContainer = document.createElement('div')
    childrenContainer.className = 'folder-children expanded'

    // Toggle folder on click
    folderItem.onclick = (e) => {
      e.stopPropagation()
      const isExpanded = childrenContainer.classList.toggle('expanded')
      toggle.classList.toggle('expanded', isExpanded)
    }

    // Context menu for folders
    folderItem.oncontextmenu = (e) => {
      e.preventDefault()
      e.stopPropagation()
      showFolderContextMenu(e.clientX, e.clientY, node.path)
    }

    folderDiv.appendChild(folderItem)
    folderDiv.appendChild(childrenContainer)
    container.appendChild(folderDiv)

    // Render children
    node.children.forEach(child => renderTreeNode(child, childrenContainer, totalFiles))
  } else {
    // Render file
    const fileItem = document.createElement('div')
    fileItem.className = 'file-item'
    fileItem.dataset.path = node.path
    if (node.path === currentFilePath) {
      fileItem.classList.add('active')
    }

    const icon = document.createElement('span')
    icon.className = `file-icon ${FileIcons.getClassWithColor(node.name)}`
    // Remove default emoji styling since file-icons provides its own
    icon.style.fontSize = '14px'

    const fileName = document.createElement('span')
    fileName.className = 'file-name'
    fileName.textContent = node.name

    const renameInput = document.createElement('input')
    renameInput.className = 'rename-input'
    renameInput.type = 'text'
    renameInput.value = node.name

    const deleteBtn = document.createElement('button')
    deleteBtn.className = 'file-delete'
    deleteBtn.textContent = '×'
    deleteBtn.title = 'Delete file'
    deleteBtn.onclick = (e) => {
      e.stopPropagation()
      deleteFile(node.path)
    }

    fileItem.appendChild(icon)
    fileItem.appendChild(fileName)
    fileItem.appendChild(renameInput)
    if (totalFiles > 1) { // Don't show delete for last file
      fileItem.appendChild(deleteBtn)
    }

    fileItem.onclick = () => switchToFile(node.path)

    // Context menu support
    fileItem.oncontextmenu = (e) => {
      console.log('File item context menu triggered for:', node.path)
      e.preventDefault()
      e.stopPropagation()
      showContextMenu(e.clientX, e.clientY, node.path, node.name)
      return false
    }

    console.log('Attached context menu handler to:', node.path)
    container.appendChild(fileItem)
  }
}

// Render file tree
function renderFileTree(plugin: EditorPluginData) {
  const fileList = document.getElementById('file-list')!
  fileList.innerHTML = ''

  const totalFiles = Object.keys(plugin.files).length
  const tree = buildFileTree(plugin.files, plugin.folders || [])

  // Render root's children directly (skip root node itself)
  tree.children.forEach(child => renderTreeNode(child, fileList, totalFiles))
}

// Update Monaco's virtual file system for IntelliSense
function updateMonacoFileSystem(plugin: EditorPluginData) {
  // Get all existing extra libs
  const existingLibs = monaco.languages.typescript.typescriptDefaults.getExtraLibs()

  // Remove old plugin files (but keep plugin-api.d.ts)
  Object.keys(existingLibs).forEach(path => {
    if (path.startsWith('file:///') && !path.includes('plugin-api')) {
      monaco.languages.typescript.typescriptDefaults.addExtraLib('', path)
      monaco.languages.typescript.javascriptDefaults.addExtraLib('', path)
    }
  })

  // Add all current plugin files to Monaco's type system
  Object.values(plugin.files).forEach(file => {
    const uri = `file:///${file.path}`
    monaco.languages.typescript.typescriptDefaults.addExtraLib(file.content, uri)
    monaco.languages.typescript.javascriptDefaults.addExtraLib(file.content, uri)
  })
}

// Switch to a different file in the editor
function switchToFile(filePath: string) {
  if (!currentPlugin) return

  // Save current file content before switching
  if (currentFilePath && editorModels.has(currentFilePath)) {
    const model = editorModels.get(currentFilePath)!
    const newContent = model.getValue()
    currentPlugin.files[currentFilePath].content = newContent

    // Update Monaco's virtual file system with new content
    const uri = `file:///${currentFilePath}`
    monaco.languages.typescript.typescriptDefaults.addExtraLib(newContent, uri)
    monaco.languages.typescript.javascriptDefaults.addExtraLib(newContent, uri)
  }

  currentFilePath = filePath
  const file = currentPlugin.files[filePath]

  if (!file) {
    updateStatus(`File not found: ${filePath}`, 'error')
    return
  }

  // Get or create model for this file
  let model = editorModels.get(filePath)
  if (!model) {
    const uri = monaco.Uri.parse(`file:///${filePath}`)
    model = monaco.editor.createModel(file.content, file.language, uri)
    editorModels.set(filePath, model)

    // Listen for content changes to update virtual FS
    model.onDidChangeContent(() => {
      if (currentFilePath && currentPlugin?.files?.[currentFilePath]) {
        const content = model.getValue()
        currentPlugin.files[currentFilePath].content = content

        // Update Monaco's virtual file system
        const uri = `file:///${currentFilePath}`
        monaco.languages.typescript.typescriptDefaults.addExtraLib(content, uri)
        monaco.languages.typescript.javascriptDefaults.addExtraLib(content, uri)
      }
    })
  }

  editor.setModel(model)
  renderFileTree(currentPlugin)
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
  editorModels.forEach(model => model.dispose())
  editorModels.clear()

  currentPluginId = pluginId
  currentPlugin = plugin
  currentFilePath = plugin.entryPoint

  const nameInput = document.getElementById('plugin-name') as HTMLInputElement
  nameInput.value = plugin.name

  // Update language selector based on entry point
  const langSelect = document.getElementById('language-select') as HTMLSelectElement
  langSelect.value = getLanguageFromPath(currentFilePath)

  // Update Monaco's virtual file system for IntelliSense
  updateMonacoFileSystem(plugin)

  // Render file tree
  renderFileTree(plugin)

  // Load the entry point file
  switchToFile(currentFilePath)

  updateLanguageUI(getLanguageFromPath(currentFilePath))
  updateStatus(`Loaded: ${plugin.name}`, 'success')
}

// Update localStorage list
function updateLocalStorageList(pluginId: string) {
  const storedScriptsRaw = localStorage.getItem('stored_scripts')
  let storedScripts: string[] = []

  if (storedScriptsRaw) {
    try {
      storedScripts = JSON.parse(storedScriptsRaw)
    } catch (e) {
      console.error('Failed to parse stored_scripts from localStorage', e)
    }
  }

  if (!storedScripts.includes(pluginId)) {
    storedScripts.push(pluginId)
    localStorage.setItem('stored_scripts', JSON.stringify(storedScripts))
  }
}

// Remove from localStorage list
function removeFromLocalStorageList(pluginId: string) {
  const storedScriptsRaw = localStorage.getItem('stored_scripts')
  if (!storedScriptsRaw) return

  try {
    const storedScripts: string[] = JSON.parse(storedScriptsRaw)
    const filtered = storedScripts.filter(id => id !== pluginId)
    localStorage.setItem('stored_scripts', JSON.stringify(filtered))
  } catch (e) {
    console.error('Failed to update stored_scripts in localStorage', e)
  }
}

// Add new file to current plugin
function showNewFileModal() {
  if (!currentPlugin) {
    updateStatus('No plugin loaded', 'error')
    return
  }

  const modal = document.getElementById('new-file-modal')!
  modal.classList.add('active')

  const pathInput = document.getElementById('new-file-path') as HTMLInputElement
  pathInput.value = ''
  pathInput.focus()
}

function hideNewFileModal() {
  const modal = document.getElementById('new-file-modal')!
  modal.classList.remove('active')
}

async function createNewFile() {
  if (!currentPlugin) return

  const pathInput = document.getElementById('new-file-path') as HTMLInputElement
  const filePath = pathInput.value.trim()

  if (!filePath) {
    alert('Please enter a file path')
    return
  }

  // Check if file already exists
  if (currentPlugin.files && currentPlugin.files[filePath]) {
    alert('File already exists')
    return
  }

  // Create new file
  currentPlugin.files[filePath] = createPluginFile(filePath, '')

  // Add to Monaco's virtual file system
  const uri = `file:///${filePath}`
  monaco.languages.typescript.typescriptDefaults.addExtraLib('', uri)
  monaco.languages.typescript.javascriptDefaults.addExtraLib('', uri)

  // Update UI
  renderFileTree(currentPlugin)
  switchToFile(filePath)
  hideNewFileModal()
  updateStatus(`Created: ${filePath}`, 'success')
}

// Delete file from current plugin
async function deleteFile(filePath: string) {
  if (!currentPlugin) return

  const fileCount = Object.keys(currentPlugin.files).length
  if (fileCount <= 1) {
    updateStatus('Cannot delete the last file', 'error')
    return
  }

  if (!confirm(`Delete file "${filePath}"?`)) return

  // Delete file
  delete currentPlugin.files[filePath]

  // Dispose model
  const model = editorModels.get(filePath)
  if (model) {
    model.dispose()
    editorModels.delete(filePath)
  }

  // Switch to another file if this was the current file
  if (currentFilePath === filePath) {
    const remainingFiles = Object.keys(currentPlugin.files)
    if (remainingFiles.length > 0) {
      switchToFile(remainingFiles[0])
      if (!currentPlugin.entryPoint || currentPlugin.entryPoint === filePath) {
        currentPlugin.entryPoint = remainingFiles[0]
      }
    }
  }

  renderFileTree(currentPlugin)
  updateStatus(`Deleted: ${filePath}`, 'success')
}

// Show context menu
let contextMenuTarget: { path: string; name: string; isFolder?: boolean } | null = null

function showContextMenu(x: number, y: number, filePath: string, fileName: string) {
  console.log('showContextMenu called:', { x, y, filePath, fileName })
  const contextMenu = document.getElementById('context-menu')
  if (!contextMenu) {
    console.error('Context menu element not found in showContextMenu!')
    return
  }

  contextMenuTarget = { path: filePath, name: fileName, isFolder: false }

  // Show all menu items for file context menu
  const renameItem = contextMenu.querySelector('[data-action="rename"]') as HTMLElement
  const deleteItem = contextMenu.querySelector('[data-action="delete"]') as HTMLElement
  const separator = contextMenu.querySelector('.context-menu-separator') as HTMLElement

  if (renameItem) renameItem.style.display = 'block'
  if (deleteItem) deleteItem.style.display = 'block'
  if (separator) separator.style.display = 'block'

  // Position menu
  contextMenu.style.left = `${x}px`
  contextMenu.style.top = `${y}px`
  contextMenu.style.display = 'block'
  console.log('Context menu displayed at:', contextMenu.style.left, contextMenu.style.top)

  // Close menu when clicking outside
  const closeMenu = (e: MouseEvent) => {
    if (!contextMenu.contains(e.target as Node)) {
      contextMenu.style.display = 'none'
      contextMenuTarget = null
      document.removeEventListener('click', closeMenu)
    }
  }

  setTimeout(() => document.addEventListener('click', closeMenu), 0)
}

// Show folder context menu
function showFolderContextMenu(x: number, y: number, folderPath: string) {
  const contextMenu = document.getElementById('context-menu')!
  contextMenuTarget = { path: folderPath, name: folderPath, isFolder: true }

  // Show all menu items for folder context menu
  const renameItem = contextMenu.querySelector('[data-action="rename"]') as HTMLElement
  const deleteItem = contextMenu.querySelector('[data-action="delete"]') as HTMLElement
  const separator = contextMenu.querySelector('.context-menu-separator') as HTMLElement

  if (renameItem) renameItem.style.display = 'block'
  if (deleteItem) deleteItem.style.display = 'block'
  if (separator) separator.style.display = 'block'

  // Position menu
  contextMenu.style.left = `${x}px`
  contextMenu.style.top = `${y}px`
  contextMenu.style.display = 'block'

  // Close menu when clicking outside
  const closeMenu = (e: MouseEvent) => {
    if (!contextMenu.contains(e.target as Node)) {
      contextMenu.style.display = 'none'
      contextMenuTarget = null
      document.removeEventListener('click', closeMenu)
    }
  }

  setTimeout(() => document.addEventListener('click', closeMenu), 0)
}

// Show root context menu (empty space in file tree)
function showRootContextMenu(x: number, y: number) {
  const contextMenu = document.getElementById('context-menu')!
  contextMenuTarget = { path: '', name: '', isFolder: true }

  // Hide rename and delete for root/empty space context menu
  const renameItem = contextMenu.querySelector('[data-action="rename"]') as HTMLElement
  const deleteItem = contextMenu.querySelector('[data-action="delete"]') as HTMLElement
  const separator = contextMenu.querySelector('.context-menu-separator') as HTMLElement

  if (renameItem) renameItem.style.display = 'none'
  if (deleteItem) deleteItem.style.display = 'none'
  if (separator) separator.style.display = 'none'

  // Position menu
  contextMenu.style.left = `${x}px`
  contextMenu.style.top = `${y}px`
  contextMenu.style.display = 'block'

  // Close menu when clicking outside
  const closeMenu = (e: MouseEvent) => {
    if (!contextMenu.contains(e.target as Node)) {
      contextMenu.style.display = 'none'
      contextMenuTarget = null
      document.removeEventListener('click', closeMenu)
    }
  }

  setTimeout(() => document.addEventListener('click', closeMenu), 0)
}

// Handle context menu actions
function handleContextMenuAction(action: string) {
  const contextMenu = document.getElementById('context-menu')!
  contextMenu.style.display = 'none'

  if (!contextMenuTarget || !currentPlugin) return

  switch (action) {
    case 'rename':
      if (!contextMenuTarget.isFolder) {
        startRename(contextMenuTarget.path, contextMenuTarget.name)
      }
      break
    case 'delete':
      if (!contextMenuTarget.isFolder) {
        deleteFile(contextMenuTarget.path)
      }
      break
    case 'new-file':
      if (contextMenuTarget.isFolder || contextMenuTarget.path === '') {
        // For folders or root, create file inline in that location
        createFileInline(contextMenuTarget.path)
      } else {
        // For files, create sibling file
        const parts = contextMenuTarget.path.split('/')
        const dir = parts.slice(0, -1).join('/')
        createFileInline(dir)
      }
      break
    case 'new-folder':
      // Create a placeholder file in the new folder
      let folderBase = ''
      if (contextMenuTarget.isFolder || contextMenuTarget.path === '') {
        // For folders or root, create subfolder inside
        folderBase = contextMenuTarget.path ? contextMenuTarget.path + '/' : ''
      } else {
        // For files, create sibling folder
        const parts = contextMenuTarget.path.split('/')
        const dir = parts.slice(0, -1).join('/')
        folderBase = dir ? dir + '/' : ''
      }
      createFolderInline(folderBase)
      break
  }

  contextMenuTarget = null
}

// Start inline rename
function startRename(filePath: string, currentName: string) {
  const fileItem = document.querySelector(`.file-item[data-path="${filePath}"]`) as HTMLElement
  if (!fileItem) return

  fileItem.classList.add('renaming')
  const input = fileItem.querySelector('.rename-input') as HTMLInputElement
  if (!input) return

  // Get just the filename without path
  const parts = filePath.split('/')
  const fileName = parts[parts.length - 1]
  const dir = parts.slice(0, -1).join('/')

  input.value = fileName
  input.focus()

  // Select filename without extension
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

    // Check if file already exists
    if (currentPlugin && currentPlugin.files[newPath]) {
      updateStatus('File already exists', 'error')
      return
    }

    await renameFile(filePath, newPath)
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

// Rename file
async function renameFile(oldPath: string, newPath: string) {
  if (!currentPlugin) return

  const file = currentPlugin.files[oldPath]
  if (!file) {
    updateStatus(`File not found: ${oldPath}`, 'error')
    return
  }

  // Create new file with new path
  currentPlugin.files[newPath] = {
    ...file,
    path: newPath,
    language: getLanguageFromPath(newPath)
  }

  // Delete old file
  delete currentPlugin.files[oldPath]

  // Handle editor model
  const model = editorModels.get(oldPath)
  if (model) {
    model.dispose()
    editorModels.delete(oldPath)
  }

  // Update Monaco virtual file system
  monaco.languages.typescript.typescriptDefaults.addExtraLib('', `file:///${oldPath}`)
  monaco.languages.typescript.javascriptDefaults.addExtraLib('', `file:///${oldPath}`)
  monaco.languages.typescript.typescriptDefaults.addExtraLib(file.content, `file:///${newPath}`)
  monaco.languages.typescript.javascriptDefaults.addExtraLib(file.content, `file:///${newPath}`)

  // Update entry point if necessary
  if (currentPlugin.entryPoint === oldPath) {
    currentPlugin.entryPoint = newPath
  }

  // Switch to new file if it was the current file
  if (currentFilePath === oldPath) {
    currentFilePath = newPath
    switchToFile(newPath)
  }

  renderFileTree(currentPlugin)
  updateStatus(`Renamed: ${oldPath} → ${newPath}`, 'success')
}

// Show new file modal with default folder
function showNewFileModalInFolder(basePath: string) {
  const modal = document.getElementById('new-file-modal')!
  const input = document.getElementById('new-file-path') as HTMLInputElement

  // Get directory path (without filename)
  const parts = basePath.split('/')
  const dir = parts.slice(0, -1).join('/')

  input.value = dir ? `${dir}/newFile.ts` : 'newFile.ts'
  modal.classList.add('active')
  input.focus()

  // Select just the 'newFile' part
  const fileName = dir ? `${dir}/newFile` : 'newFile'
  const selectionStart = dir ? dir.length + 1 : 0
  input.setSelectionRange(selectionStart, fileName.length)
}

// Create file inline in tree
function createFileInline(folderPath: string = '') {
  if (!currentPlugin) return

  // Create a temporary file entry for inline editing
  const tempPath = folderPath ? `${folderPath}/newFile.ts` : 'newFile.ts'

  // Check if already exists
  if (currentPlugin.files[tempPath]) {
    updateStatus('File already exists', 'error')
    return
  }

  // Create the file
  currentPlugin.files[tempPath] = createPluginFile(tempPath, '')

  // Render tree
  renderFileTree(currentPlugin)

  // Start rename immediately to let user type the name
  setTimeout(() => {
    startRename(tempPath, tempPath.split('/').pop() || 'newFile.ts')
  }, 50)
}

// Create folder inline in tree
function createFolderInline(basePath: string = '') {
  if (!currentPlugin) return

  // Initialize folders array if it doesn't exist
  if (!currentPlugin.folders) {
    currentPlugin.folders = []
  }

  const folderName = 'newFolder'
  const folderPath = basePath ? `${basePath}${folderName}` : folderName

  // Check if folder already exists
  if (currentPlugin.folders.includes(folderPath)) {
    updateStatus('Folder already exists', 'error')
    return
  }

  // Add the folder to the folders array
  currentPlugin.folders.push(folderPath)

  // Render tree to show the folder
  renderFileTree(currentPlugin)

  // Rename the folder
  // Use longer timeout to ensure DOM is fully updated
  setTimeout(() => {
    startFolderRename(folderPath, folderName)
  }, 100)
}

// Start folder rename - renames the folder component in the path
function startFolderRename(folderPath: string, currentFolderName: string) {
  // The folderPath is now the actual folder path, not a file path
  console.log('startFolderRename called with:', { folderPath, currentFolderName })
  console.log('Looking for folder with selector:', `.folder-item[data-path="${folderPath}"]`)

  const allFolders = document.querySelectorAll('.folder-item[data-path]')
  console.log('All folders in tree:', Array.from(allFolders).map(f => (f as HTMLElement).dataset.path))

  const allFiles = document.querySelectorAll('.file-item[data-path]')
  console.log('All files in tree:', Array.from(allFiles).map(f => (f as HTMLElement).dataset.path))

  const folderItem = document.querySelector(`.folder-item[data-path="${folderPath}"]`) as HTMLElement
  if (!folderItem) {
    console.error('Folder item not found:', folderPath)
    console.error('Available folders:', Array.from(allFolders).map(f => (f as HTMLElement).dataset.path))
    return
  }

  // Create inline input for renaming
  const folderNameSpan = folderItem.querySelector('.folder-name') as HTMLElement
  if (!folderNameSpan) return

  const originalText = folderNameSpan.textContent || currentFolderName

  const input = document.createElement('input')
  input.type = 'text'
  input.value = currentFolderName
  input.className = 'rename-input'
  input.style.display = 'block'
  input.style.flex = '1'
  input.style.background = '#3c3c3c'
  input.style.border = '1px solid #007acc'
  input.style.color = '#cccccc'
  input.style.padding = '2px 4px'
  input.style.fontSize = '13px'
  input.style.outline = 'none'

  folderNameSpan.style.display = 'none'
  folderItem.appendChild(input)
  input.focus()
  input.select()

  const finishRename = async () => {
    const newFolderName = input.value.trim()
    input.remove()
    folderNameSpan.style.display = ''

    if (!newFolderName || newFolderName === currentFolderName) {
      // If cancelled or unchanged, remove the folder from folders array
      if (!currentPlugin || !currentPlugin.folders) return
      const index = currentPlugin.folders.indexOf(folderPath)
      if (index > -1) {
        currentPlugin.folders.splice(index, 1)
      }
      renderFileTree(currentPlugin)
      return
    }

    if (!currentPlugin) return

    // Calculate the new folder path
    const parts = folderPath.split('/')
    const basePath = parts.slice(0, -1).join('/')
    const newFolderPath = basePath ? `${basePath}/${newFolderName}` : newFolderName

    // Update the folder in the folders array
    if (currentPlugin.folders) {
      const index = currentPlugin.folders.indexOf(folderPath)
      if (index > -1) {
        currentPlugin.folders[index] = newFolderPath
      }

      // Also update any subfolders
      currentPlugin.folders = currentPlugin.folders.map(folder => {
        if (folder.startsWith(folderPath + '/')) {
          return folder.replace(folderPath, newFolderPath)
        }
        return folder
      })
    }

    // Rename all files in the folder
    const filesToRename = Object.keys(currentPlugin.files).filter(path =>
      path.startsWith(folderPath + '/')
    )

    filesToRename.forEach(oldPath => {
      const relativePath = oldPath.substring(folderPath.length + 1)
      const newPath = `${newFolderPath}/${relativePath}`

      currentPlugin.files[newPath] = {
        ...currentPlugin.files[oldPath],
        path: newPath,
        language: getLanguageFromPath(newPath)
      }
      delete currentPlugin.files[oldPath]
    })

    renderFileTree(currentPlugin)
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

// Save current plugin
async function savePlugin() {
  if (!currentPlugin) {
    updateStatus('No plugin loaded', 'error')
    return
  }

  const nameInput = document.getElementById('plugin-name') as HTMLInputElement
  const name = nameInput.value.trim()

  if (!name) {
    updateStatus('Please enter a plugin name', 'error')
    return
  }

  // Update current file content before saving
  if (currentFilePath && currentPlugin.files[currentFilePath]) {
    currentPlugin.files[currentFilePath].content = editor.getValue()
  }

  const now = Date.now()
  const isNewPlugin = !currentPluginId

  let compiled: string

  // Bundle/compile based on file structure
  if (Object.keys(currentPlugin.files).length > 0) {
    try {
      updateStatus('Bundling plugin...', 'normal')
      compiled = await bundlePlugin(currentPlugin.files, currentPlugin.entryPoint)
      const compileStatus = document.getElementById('compile-status')!
      compileStatus.textContent = '✓ Bundled'
      setTimeout(() => compileStatus.textContent = '', 3000)
    } catch (error) {
      updateStatus('Bundling failed: ' + (error as Error).message, 'error')
      console.error(error)
      return
    }
  } else {
    updateStatus('No files to save', 'error')
    return
  }

  // Create basic metadata from the plugin name
  const metadata = {
    name: name,
    version: '1.0.0',
    author: 'Plugin Editor',
    description: `Created with Plugin Editor`
  }

  // Update plugin data
  currentPlugin.id = currentPluginId || generateEditorPluginId(name)
  currentPlugin.name = name
  currentPlugin.compiled = compiled
  currentPlugin.metadata = metadata
  currentPlugin.updatedAt = now
  currentPlugin.lastCompiledAt = now

  if (!currentPlugin.createdAt) {
    currentPlugin.createdAt = now
  }

  // Store in editor database
  await storeEditorPlugin(currentPlugin)

  // Sync compiled JS to plugin storage (so it can be loaded by the main app)
  if (currentPluginId) {
    await updatePluginScript(currentPlugin.id, compiled, metadata)
  } else {
    await storePluginScript(currentPlugin.id, compiled, metadata)
  }

  // Update localStorage list so Scripts UI can see it
  if (isNewPlugin) {
    updateLocalStorageList(currentPlugin.id)
    // Trigger a storage event change to notify the system
    localStorage.setItem('stored_scripts_updated', Date.now().toString())
  }

  currentPluginId = currentPlugin.id

  // Refresh plugin list
  await refreshPluginList()

  // Select the saved plugin
  const pluginSelect = document.getElementById('plugin-select') as HTMLSelectElement
  pluginSelect.value = currentPlugin.id

  updateStatus(`Saved: ${name}`, 'success')
}

// Delete current plugin
async function deleteCurrentPlugin() {
  if (!currentPluginId) {
    updateStatus('No plugin selected', 'error')
    return
  }

  const plugin = await getEditorPlugin(currentPluginId)
  if (!plugin) return

  if (!confirm(`Delete plugin "${plugin.name}"?`)) return

  // Delete from editor storage
  await deleteEditorPlugin(currentPluginId)

  // Delete from plugin storage
  await deletePluginScript(currentPluginId)

  // Remove from localStorage list
  removeFromLocalStorageList(currentPluginId)

  // Trigger a storage event change to notify the system
  localStorage.setItem('stored_scripts_updated', Date.now().toString())

  currentPluginId = null
  editor.setValue('')

  const nameInput = document.getElementById('plugin-name') as HTMLInputElement
  nameInput.value = ''

  await refreshPluginList()
  updateStatus('Plugin deleted', 'success')
}

// Create new plugin
function showNewPluginModal() {
  const modal = document.getElementById('new-plugin-modal')!
  modal.classList.add('active')

  const nameInput = document.getElementById('new-plugin-name') as HTMLInputElement
  nameInput.value = ''

  const langSelect = document.getElementById('new-plugin-language') as HTMLSelectElement
  langSelect.value = 'typescript'

  nameInput.focus()
}

function hideNewPluginModal() {
  const modal = document.getElementById('new-plugin-modal')!
  modal.classList.remove('active')
}

async function createNewPlugin() {
  const nameInput = document.getElementById('new-plugin-name') as HTMLInputElement
  const langSelect = document.getElementById('new-plugin-language') as HTMLSelectElement

  const name = nameInput.value.trim()
  if (!name) {
    alert('Please enter a plugin name')
    return
  }

  const language = langSelect.value as 'javascript' | 'typescript'

  // Template code
  const jsTemplate = `export async function init(api) {
  return {
    name: "${name}",
    version: "1.0.0",
    author: "Your Name",
    description: "Plugin description"
  };
}

export async function destroy() {
  // Cleanup code here
}
`

  const tsTemplate = `// Type definitions are available globally when editing

/**
 * Initialize the plugin
 * @param api - The Plugin API providing access to game client functionality
 * @returns Plugin information
 */
export async function init(api: PluginApi): Promise<PluginInfo> {
  // Your plugin initialization code here

  return {
    name: "${name}",
    version: "1.0.0",
    author: "Your Name",
    description: "Plugin description"
  };
}

/**
 * Optional cleanup when plugin is unloaded
 */
export async function destroy(): Promise<void> {
  // Cleanup code here
}
`

  const source = language === 'typescript' ? tsTemplate : jsTemplate
  const extension = language === 'typescript' ? 'ts' : 'js'
  const entryPoint = `index.${extension}`

  // Create files map
  const files: Record<string, PluginFile> = {
    [entryPoint]: {
      path: entryPoint,
      content: source,
      language,
    }
  }

  // Bundle the plugin
  const compiled = await bundlePlugin(files, entryPoint)

  // Create basic metadata
  const metadata = {
    name: name,
    version: '1.0.0',
    author: 'Plugin Editor',
    description: `Created with Plugin Editor`
  }

  const now = Date.now()
  const pluginData: EditorPluginData = {
    id: generateEditorPluginId(name),
    name,
    files,
    entryPoint,
    compiled,
    metadata,
    createdAt: now,
    updatedAt: now,
    lastCompiledAt: now,
  }

  await storeEditorPlugin(pluginData)
  await storePluginScript(pluginData.id, compiled, metadata)

  // Add to localStorage list so Scripts UI can see it
  updateLocalStorageList(pluginData.id)

  // Trigger a storage event change to notify the system
  localStorage.setItem('stored_scripts_updated', Date.now().toString())

  hideNewPluginModal()
  await refreshPluginList()
  await loadPlugin(pluginData.id)

  const pluginSelect = document.getElementById('plugin-select') as HTMLSelectElement
  pluginSelect.value = pluginData.id
}

// Refresh plugin list dropdown
async function refreshPluginList() {
  const plugins = await getAllEditorPlugins()
  const select = document.getElementById('plugin-select') as HTMLSelectElement

  // Save current selection
  const currentValue = select.value

  // Clear and rebuild
  select.innerHTML = '<option value="">Select Plugin...</option>'

  plugins
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach(plugin => {
      const option = document.createElement('option')
      option.value = plugin.id

      // Display file count if multi-file plugin
      const fileCount = plugin.files ? Object.keys(plugin.files).length : 1
      const fileInfo = fileCount > 1 ? ` [${fileCount} files]` : ''
      const lang = plugin.files
        ? (plugin.entryPoint?.endsWith('.ts') ? 'TS' : 'JS')
        : (plugin.language === 'typescript' ? 'TS' : 'JS')

      option.textContent = `${plugin.name} (${lang})${fileInfo}`
      select.appendChild(option)
    })

  // Restore selection if still valid
  if (currentValue && plugins.some(p => p.id === currentValue)) {
    select.value = currentValue
  }
}

// Update UI based on language
function updateLanguageUI(language: 'javascript' | 'typescript') {
  const compileBtn = document.getElementById('compile-btn')!
  compileBtn.style.display = language === 'typescript' ? 'block' : 'none'
}

// Manual compile button
async function manualCompile() {
  const source = editor.getValue()
  try {
    updateStatus('Compiling TypeScript...', 'normal')
    const compiled = await compileTypeScript(source)
    const compileStatus = document.getElementById('compile-status')!
    compileStatus.textContent = '✓ Compiled successfully'
    setTimeout(() => compileStatus.textContent = '', 3000)
    updateStatus('TypeScript compiled successfully', 'success')

    // Show compiled output in console
    console.log('Compiled JavaScript:', compiled)
  } catch (error) {
    updateStatus('Compilation failed: ' + (error as Error).message, 'error')
  }
}

// Configure TypeScript compiler options and load type definitions
function setupTypeScriptEnvironment() {
  // Configure TypeScript compiler options
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    noEmit: true,
    esModuleInterop: true,
    jsx: monaco.languages.typescript.JsxEmit.React,
    allowJs: true,
    typeRoots: ['node_modules/@types'],
  })

  // Also configure JavaScript defaults with same options
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    allowNonTsExtensions: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    noEmit: true,
    esModuleInterop: true,
    jsx: monaco.languages.typescript.JsxEmit.React,
    allowJs: true,
    typeRoots: ['node_modules/@types'],
    checkJs: true, // Enable type checking in JS files
  })

  // Enable diagnostics for TypeScript - explicitly enable semantic validation
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: [], // Don't ignore any diagnostics
  })

  // Enable diagnostics for JavaScript - explicitly enable semantic validation
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: [],
  })

  // Set eager model sync to ensure semantic tokens are updated quickly
  monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true)
  monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true)

  // Enable semantic tokens for better syntax highlighting
  monaco.languages.typescript.typescriptDefaults.setWorkerOptions({
    customWorkerPath: undefined,
  })

  // Add Plugin API type definitions (imported as raw string)
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    pluginApiTypes,
    'file:///node_modules/@types/plugin-api/index.d.ts'
  )

  monaco.languages.typescript.javascriptDefaults.addExtraLib(
    pluginApiTypes,
    'file:///node_modules/@types/plugin-api/index.d.ts'
  )
}

// Define custom theme with enhanced syntax highlighting
function defineCustomTheme() {
  monaco.editor.defineTheme('plugin-theme', {
    base: 'vs-dark',
    inherit: true,
    rules: [

    ],
    colors: {
      'editor.background': '#1E1E1E',
      'editor.foreground': '#D4D4D4',
      'editor.lineHighlightBackground': '#2A2A2A',
      'editorCursor.foreground': '#FFFFFF',
      'editor.selectionBackground': '#264F78',
    }
  })
}

// Initialize Monaco Editor
async function initEditor() {
  const container = document.getElementById('editor-container')!

  // Setup TypeScript environment first
  setupTypeScriptEnvironment()

  // Define custom theme
  defineCustomTheme()

  // Create a model with a proper URI including file extension
  const uri = monaco.Uri.parse('file:///plugin.ts')
  const model = monaco.editor.createModel('', 'typescript', uri)

  editor = monaco.editor.create(container, {
    model: model,
    theme: 'vs-dark',
    automaticLayout: true,
    minimap: { enabled: true },
    fontSize: 14,
    tabSize: 2,
    fontLigatures: true,
    quickSuggestions: true,
    suggestOnTriggerCharacters: true,
    "semanticHighlighting.enabled": true,
  })

  // Add command to switch between files via command palette
  editor.addAction({
    id: 'switch-file',
    label: 'Go to File...',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP],
    precondition: undefined,
    keybindingContext: undefined,
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 1.5,
    run: function(ed) {
      showFilePicker()
    }
  })

  // Register a custom token provider for better syntax highlighting
  // This adds colors for properties and methods which aren't in default Monaco
  setupCustomTokenColors()

  updateStatus('Editor initialized', 'success')
}

// Setup custom token colors for properties and methods using decorations with TypeScript worker
function setupCustomTokenColors() {
  console.log('Setting up custom token colors using decorations + TypeScript AST')

  let currentDecorationIds: string[] = []

  // Apply decorations whenever the model content changes
  const applyDecorations = async (model: monaco.editor.ITextModel) => {
    const text = model.getValue()
    const lines = text.split('\n')

    const propertyDecorations: monaco.editor.IModelDeltaDecoration[] = []
    const methodDecorations: monaco.editor.IModelDeltaDecoration[] = []
    const functionDecorations: monaco.editor.IModelDeltaDecoration[] = []
    const keywordDecorations: monaco.editor.IModelDeltaDecoration[] = []
    const paramDecorations: monaco.editor.IModelDeltaDecoration[] = []
    const stringDecorations: monaco.editor.IModelDeltaDecoration[] = []
    const numberDecorations: monaco.editor.IModelDeltaDecoration[] = []

    // Try to get TypeScript worker for more accurate classification
    let tsClient: any = null
    try {
      const worker = await monaco.languages.typescript.getTypeScriptWorker()
      tsClient = await worker(model.uri)
    } catch (err) {
      console.log('TypeScript worker not available, using syntax-based detection')
    }

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex]

      // 0. Find strings and color them orange/brown
      const stringRegex = /(["'`])(?:(?=(\\?))\2.)*?\1/g
      let stringMatch

      while ((stringMatch = stringRegex.exec(line)) !== null) {
        const stringValue = stringMatch[0]
        const startCol = stringMatch.index + 1 // +1 for Monaco 1-based indexing
        const endCol = startCol + stringValue.length

        const decoration: monaco.editor.IModelDeltaDecoration = {
          range: new monaco.Range(lineIndex + 1, startCol, lineIndex + 1, endCol),
          options: {
            inlineClassName: 'string-highlight'
          }
        }

        stringDecorations.push(decoration)
      }

      // 0.5. Find numbers and color them light green (but skip if inside strings)
      const numberRegex = /\b\d+\.?\d*\b/g
      let numberMatch

      while ((numberMatch = numberRegex.exec(line)) !== null) {
        const numberValue = numberMatch[0]

        // Check if this number is inside a string
        const beforeMatch = line.substring(0, numberMatch.index)
        const quoteCount = (beforeMatch.match(/["'`]/g) || []).length
        if (quoteCount % 2 !== 0) continue // Inside a string, skip

        const startCol = numberMatch.index + 1
        const endCol = startCol + numberValue.length

        const decoration: monaco.editor.IModelDeltaDecoration = {
          range: new monaco.Range(lineIndex + 1, startCol, lineIndex + 1, endCol),
          options: {
            inlineClassName: 'number-highlight'
          }
        }

        numberDecorations.push(decoration)
      }

      // 1. Find keywords and color them blue
      const keywords = [
        'export', 'import', 'from', 'as', 'default',
        'async', 'await',
        'function', 'const', 'let', 'var',
        'return', 'yield',
        'if', 'else', 'switch', 'case', 'break', 'continue',
        'for', 'while', 'do',
        'try', 'catch', 'finally', 'throw',
        'new', 'delete', 'typeof', 'instanceof', 'in', 'of',
        'class', 'extends', 'implements', 'interface', 'type',
        'public', 'private', 'protected', 'static', 'readonly',
        'this', 'super',
        'true', 'false', 'null', 'undefined',
        'void', 'never', 'any', 'unknown',
        'enum', 'namespace', 'module',
        'get', 'set',
        'abstract', 'constructor'
      ]

      const keywordRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g')
      let keywordMatch

      while ((keywordMatch = keywordRegex.exec(line)) !== null) {
        const keyword = keywordMatch[1]
        const startCol = keywordMatch.index + 1 // +1 for Monaco 1-based indexing
        const endCol = startCol + keyword.length

        const decoration: monaco.editor.IModelDeltaDecoration = {
          range: new monaco.Range(lineIndex + 1, startCol, lineIndex + 1, endCol),
          options: {
            inlineClassName: 'keyword-highlight'
          }
        }

        keywordDecorations.push(decoration)
      }

      // 1. Find member access patterns (api.output, obj.method())
      const memberRegex = /\.(\w+)/g
      let match

      while ((match = memberRegex.exec(line)) !== null) {
        const memberName = match[1]
        const startCol = match.index + 2 // +1 for dot, +1 for Monaco 1-based indexing
        const endCol = startCol + memberName.length

        let isMethod = false

        // Try to use TypeScript worker for accurate detection
        if (tsClient) {
          try {
            // Calculate absolute position in the document
            let absolutePosition = 0
            for (let i = 0; i < lineIndex; i++) {
              absolutePosition += lines[i].length + 1 // +1 for newline
            }
            absolutePosition += match.index + 1 // +1 to point to the member name

            const quickInfo = await tsClient.getQuickInfoAtPosition(
              model.uri.toString(),
              absolutePosition
            )

            if (quickInfo && quickInfo.displayParts) {
              const displayText = quickInfo.displayParts.map((p: any) => p.text).join('')
              // Check if it's a function/method signature
              isMethod = displayText.includes('=>') ||
                        displayText.includes('function') ||
                        displayText.match(/\(.*\):/) !== null
            }
          } catch (err) {
            // Fallback to syntax-based detection
          }
        }

        // Fallback: check if followed by parentheses
        if (!tsClient || !isMethod) {
          const afterMember = line.substring(match.index + match[0].length).trimStart()
          isMethod = afterMember.startsWith('(')
        }

        const decoration: monaco.editor.IModelDeltaDecoration = {
          range: new monaco.Range(lineIndex + 1, startCol, lineIndex + 1, endCol),
          options: {
            inlineClassName: isMethod ? 'method-highlight' : 'property-highlight'
          }
        }

        if (isMethod) {
          methodDecorations.push(decoration)
        } else {
          propertyDecorations.push(decoration)
        }
      }

      // 2. Find function declarations and standalone function calls
      // Function declarations: function foo(), const foo = function(), const foo = () =>
      const functionDeclRegex = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:function|async\s+function|\(.*?\)\s*=>))/g
      let funcDeclMatch

      while ((funcDeclMatch = functionDeclRegex.exec(line)) !== null) {
        const funcName = funcDeclMatch[1] || funcDeclMatch[2]
        if (!funcName) continue

        const funcNameIndex = funcDeclMatch[0].indexOf(funcName)
        const startCol = funcDeclMatch.index + funcNameIndex + 1 // +1 for Monaco 1-based indexing
        const endCol = startCol + funcName.length

        const decoration: monaco.editor.IModelDeltaDecoration = {
          range: new monaco.Range(lineIndex + 1, startCol, lineIndex + 1, endCol),
          options: {
            inlineClassName: 'function-highlight'
          }
        }

        functionDecorations.push(decoration)
      }

      // 3. Find standalone function calls (not member access): functionName()
      // Match identifier followed by '(' but not preceded by '.'
      const functionCallRegex = /(?<![.\w])(\w+)\s*\(/g
      let funcCallMatch

      while ((funcCallMatch = functionCallRegex.exec(line)) !== null) {
        const funcName = funcCallMatch[1]

        // Skip keywords
        const keywords = ['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'instanceof']
        if (keywords.includes(funcName)) continue

        const startCol = funcCallMatch.index + 1 // +1 for Monaco 1-based indexing
        const endCol = startCol + funcName.length

        const decoration: monaco.editor.IModelDeltaDecoration = {
          range: new monaco.Range(lineIndex + 1, startCol, lineIndex + 1, endCol),
          options: {
            inlineClassName: 'function-highlight'
          }
        }

        functionDecorations.push(decoration)
      }

      // 4. Find object property keys in object literals: { name: "value", version: "1.0.0" }
      // Match property names that are not inside strings
      // Must be preceded by { or , to be a real object property
      const objectPropertyRegex = /([{,])\s*([a-zA-Z_$][\w]*)\s*:/g
      let objPropMatch

      while ((objPropMatch = objectPropertyRegex.exec(line)) !== null) {
        const propName = objPropMatch[2] // Group 2 is the property name
        const propStartInMatch = objPropMatch[0].indexOf(propName)
        const propIndex = objPropMatch.index + propStartInMatch

        // Skip keywords that might appear before colons (like case:, default:)
        const skipKeywords = ['case', 'default']
        if (skipKeywords.includes(propName)) continue

        // Check if this property is inside a string
        const beforeMatch = line.substring(0, propIndex)
        const quoteCount = (beforeMatch.match(/["'`]/g) || []).length
        if (quoteCount % 2 !== 0) continue // Inside a string, skip

        const startCol = propIndex + 1 // +1 for Monaco 1-based indexing
        const endCol = startCol + propName.length

        const decoration: monaco.editor.IModelDeltaDecoration = {
          range: new monaco.Range(lineIndex + 1, startCol, lineIndex + 1, endCol),
          options: {
            inlineClassName: 'property-highlight'
          }
        }

        propertyDecorations.push(decoration)
      }

      // 5. Find function parameters in function declarations
      // Match parameters inside parentheses in function declarations
      const functionParamsRegex = /\(([^)]*)\)\s*(?:=>|{)/g
      let paramMatch

      while ((paramMatch = functionParamsRegex.exec(line)) !== null) {
        const paramsText = paramMatch[1]
        if (!paramsText.trim()) continue

        // Split by comma and extract parameter names
        const params = paramsText.split(',')
        let offset = paramMatch.index + 1 // Position after opening (

        for (const param of params) {
          // Match parameter name (before : or = or end)
          const paramNameMatch = param.match(/^\s*([a-zA-Z_$][\w]*)\s*(?:[=:]|$)/)
          if (paramNameMatch) {
            const paramName = paramNameMatch[1]
            const paramStart = offset + param.indexOf(paramName)
            const startCol = paramStart + 1 // +1 for Monaco 1-based indexing
            const endCol = startCol + paramName.length

            const decoration: monaco.editor.IModelDeltaDecoration = {
              range: new monaco.Range(lineIndex + 1, startCol, lineIndex + 1, endCol),
              options: {
                inlineClassName: 'parameter-highlight'
              }
            }

            paramDecorations.push(decoration)
          }
          offset += param.length + 1 // +1 for comma
        }
      }
    }

    // Apply all decorations
    const allDecorations = [...stringDecorations, ...numberDecorations, ...keywordDecorations, ...propertyDecorations, ...methodDecorations, ...functionDecorations, ...paramDecorations]
    console.log(`Applying ${allDecorations.length} decorations (${stringDecorations.length} strings, ${numberDecorations.length} numbers, ${keywordDecorations.length} keywords, ${functionDecorations.length} functions, ${methodDecorations.length} methods, ${propertyDecorations.length} properties)`)

    // Clear old decorations and apply new ones
    currentDecorationIds = editor.deltaDecorations(currentDecorationIds, allDecorations)
  }

  // Add CSS for decorations
  const style = document.createElement('style')
  style.textContent = `
    .string-highlight {
      color: #CE9178 !important;
    }
    .keyword-highlight {
      color: #CE9178 !important;
    }
    .method-highlight {
      color: #569CD6 !important;
    }
    .property-highlight {
      color: #C586C0 !important;
    }
    .function-highlight {
      color: #569CD6 !important;
    }
    .parameter-highlight {
      color: #9CDCFE !important;
    }
    .number-highlight {
      color: #B5CEA8 !important;
    }
  `
  document.head.appendChild(style)

  // Debounce function to avoid too frequent updates
  let decorationTimeout: NodeJS.Timeout | null = null
  const scheduleDecorationsUpdate = (model: monaco.editor.ITextModel) => {
    if (decorationTimeout) {
      clearTimeout(decorationTimeout)
    }
    decorationTimeout = setTimeout(() => {
      applyDecorations(model)
    }, 300)
  }

  // Apply decorations to current model
  const currentModel = editor.getModel()
  if (currentModel) {
    applyDecorations(currentModel)

    // Reapply decorations on content change (debounced)
    currentModel.onDidChangeContent(() => {
      scheduleDecorationsUpdate(currentModel)
    })
  }

  // Apply decorations when model changes
  editor.onDidChangeModel((e) => {
    const model = editor.getModel()
    if (model) {
      //applyDecorations(model)

      model.onDidChangeContent(() => {
        scheduleDecorationsUpdate(model)
      })
    }
  })

  console.log('Custom token colors setup complete - properties=purple, methods=blue')
}

// Event listeners
function setupEventListeners() {
  const pluginSelect = document.getElementById('plugin-select') as HTMLSelectElement
  pluginSelect.addEventListener('change', (e) => {
    const target = e.target as HTMLSelectElement
    if (target.value) {
      loadPlugin(target.value)
    }
  })

  const saveBtn = document.getElementById('save-btn')!
  saveBtn.addEventListener('click', savePlugin)

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
    const currentModel = editor.getModel()

    if (currentModel) {
      const currentValue = currentModel.getValue()

      // Dispose the old model
      currentModel.dispose()

      // Create new model with correct file extension
      const extension = language === 'typescript' ? 'ts' : 'js'
      const uri = monaco.Uri.parse(`file:///plugin.${extension}`)
      const newModel = monaco.editor.createModel(currentValue, language, uri)

      // Set the new model
      editor.setModel(newModel)
    }

    updateLanguageUI(language)
  })

  // New plugin modal
  const newPluginCancel = document.getElementById('new-plugin-cancel')!
  newPluginCancel.addEventListener('click', hideNewPluginModal)

  const newPluginCreate = document.getElementById('new-plugin-create')!
  newPluginCreate.addEventListener('click', createNewPlugin)

  const newPluginName = document.getElementById('new-plugin-name') as HTMLInputElement
  newPluginName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      createNewPlugin()
    }
  })

  // New file modal
  const addFileBtn = document.getElementById('add-file-btn')!
  addFileBtn.addEventListener('click', showNewFileModal)

  // File list context menu for empty space
  const fileList = document.getElementById('file-list')!
  fileList.addEventListener('contextmenu', (e) => {
    const target = e.target as HTMLElement
    console.log('File list context menu event:', {
      targetId: target.id,
      targetClass: target.className,
      targetTag: target.tagName
    })

    // Check if clicking on empty space - either the file-list itself or not on a file/folder item
    const isFileItem = target.closest('.file-item, .folder-item')
    console.log('Is file item?', isFileItem)

    if (!isFileItem) {
      console.log('Preventing default and showing root context menu')
      e.preventDefault()
      e.stopPropagation()
      showRootContextMenu(e.clientX, e.clientY)
    }
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

  console.log('Context menu initialized')

  // Close context menu on outside click
  document.addEventListener('contextmenu', (e) => {
    // Allow default context menu for input fields
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return
    }

    // Close any open context menu when right-clicking elsewhere
    const menu = document.getElementById('context-menu')!
    if (menu.style.display === 'block') {
      menu.style.display = 'none'
    }
  })

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      savePlugin()
    }
  })
}

// File Picker Modal Functions
function showFilePicker() {
  if (!currentPlugin) return

  const modal = document.getElementById('file-picker-modal')!
  const input = document.getElementById('file-picker-input') as HTMLInputElement
  const list = document.getElementById('file-picker-list')!

  // Show modal
  modal.classList.add('active')
  input.value = ''
  input.focus()

  // Render file list
  renderFilePickerList('')

  // Close on escape
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeFilePicker()
    }
  }

  // Close when clicking outside
  const handleClick = (e: MouseEvent) => {
    if (e.target === modal) {
      closeFilePicker()
    }
  }

  document.addEventListener('keydown', handleKeyDown)
  modal.addEventListener('click', handleClick)

  // Cleanup function
  const cleanup = () => {
    document.removeEventListener('keydown', handleKeyDown)
    modal.removeEventListener('click', handleClick)
  }

  // Store cleanup for later
  ;(modal as any)._cleanup = cleanup
}

function closeFilePicker() {
  const modal = document.getElementById('file-picker-modal')!
  modal.classList.remove('active')

  // Call cleanup if it exists
  if ((modal as any)._cleanup) {
    (modal as any)._cleanup()
    delete (modal as any)._cleanup
  }
}

function renderFilePickerList(filter: string) {
  if (!currentPlugin) return

  const list = document.getElementById('file-picker-list')!
  const files = Object.keys(currentPlugin.files).sort()

  // Filter files
  const filteredFiles = filter
    ? files.filter(f => f.toLowerCase().includes(filter.toLowerCase()))
    : files

  // Clear list
  list.innerHTML = ''

  // Render files
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

    // Add file icon
    const iconClass = FileIcons.getClass(filePath)
    const icon = document.createElement('span')
    icon.className = iconClass
    item.appendChild(icon)

    // Add file path
    const text = document.createElement('span')
    text.textContent = filePath
    item.appendChild(text)

    // Hover effect
    item.addEventListener('mouseenter', () => {
      item.style.background = '#2a2d2e'
    })
    item.addEventListener('mouseleave', () => {
      item.style.background = ''
    })

    // Click to open file
    item.addEventListener('click', () => {
      openFileInEditor(filePath)
      closeFilePicker()
    })

    // Select first item by default
    if (index === 0) {
      item.style.background = '#2a2d2e'
    }

    list.appendChild(item)
  })

  // If no files found
  if (filteredFiles.length === 0) {
    list.innerHTML = '<div style="padding: 12px; color: #999; text-align: center;">No files found</div>'
  }
}

// Initialize
async function init() {
  updateStatus('Initializing...', 'normal')
  await initEditor()
  await initEsbuild()
  await refreshPluginList()
  setupEventListeners()
  setupFilePickerListeners()
  updateStatus('Ready', 'success')
}

function setupFilePickerListeners() {
  const input = document.getElementById('file-picker-input') as HTMLInputElement

  // Filter files as user types
  input.addEventListener('input', (e) => {
    const filter = (e.target as HTMLInputElement).value
    renderFilePickerList(filter)
  })

  // Handle enter to select first file
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const firstItem = document.querySelector('.file-picker-item') as HTMLElement
      if (firstItem) {
        firstItem.click()
      }
    }
  })
}

init()
