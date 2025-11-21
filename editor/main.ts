import * as monaco from 'monaco-editor'
import * as esbuild from 'esbuild-wasm'

// Import Monaco workers using Vite's worker syntax
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

// Import Plugin API type definitions as raw string
import pluginApiTypes from './plugin-api.d.ts?raw'

// Configure Monaco Environment for web workers
self.MonacoEnvironment = {
  getWorker(_: string, label: string) {
    switch (label) {
      case 'json':
        return new jsonWorker()
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker()
      case 'html':
      case 'handlebars':
      case 'razor':
        return new htmlWorker()
      case 'typescript':
      case 'javascript':
        return new tsWorker()
      default:
        return new editorWorker()
    }
  }
}

// Import editor storage (this is the only shared code)
import type { EditorPluginData } from '../src/client/utils/pluginEditorStorage'
import {
  storeEditorPlugin,
  getEditorPlugin,
  deleteEditorPlugin,
  getAllEditorPlugins,
  generateEditorPluginId,
} from '../src/client/utils/pluginEditorStorage'

// Import plugin storage to sync compiled JS
import {
  storePluginScript,
  updatePluginScript,
  deletePluginScript,
} from '../src/client/utils/pluginStorage'

let editor: monaco.editor.IStandaloneCodeEditor
let currentPluginId: string | null = null
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

// Compile TypeScript to JavaScript
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

// Load plugin into editor
async function loadPlugin(pluginId: string) {
  const plugin = await getEditorPlugin(pluginId)
  if (!plugin) {
    updateStatus('Plugin not found', 'error')
    return
  }

  currentPluginId = pluginId

  const nameInput = document.getElementById('plugin-name') as HTMLInputElement
  nameInput.value = plugin.name

  const langSelect = document.getElementById('language-select') as HTMLSelectElement
  langSelect.value = plugin.language

  // Dispose old model and create new one with correct language/extension
  const currentModel = editor.getModel()
  if (currentModel) {
    currentModel.dispose()
  }

  const extension = plugin.language === 'typescript' ? 'ts' : 'js'
  const uri = monaco.Uri.parse(`file:///plugin.${extension}`)
  const newModel = monaco.editor.createModel(plugin.source, plugin.language, uri)
  editor.setModel(newModel)

  updateLanguageUI(plugin.language)
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

// Save current plugin
async function savePlugin() {
  const nameInput = document.getElementById('plugin-name') as HTMLInputElement
  const langSelect = document.getElementById('language-select') as HTMLSelectElement
  const name = nameInput.value.trim()

  if (!name) {
    updateStatus('Please enter a plugin name', 'error')
    return
  }

  const source = editor.getValue()
  const language = langSelect.value as 'javascript' | 'typescript'

  let compiled = source

  // Compile TypeScript if needed
  if (language === 'typescript') {
    try {
      updateStatus('Compiling TypeScript...', 'normal')
      compiled = await compileTypeScript(source)
      const compileStatus = document.getElementById('compile-status')!
      compileStatus.textContent = '✓ Compiled'
      setTimeout(() => compileStatus.textContent = '', 3000)
    } catch (error) {
      updateStatus('TypeScript compilation failed', 'error')
      return
    }
  }

  const now = Date.now()
  const isNewPlugin = !currentPluginId

  // Create basic metadata from the plugin name
  const metadata = {
    name: name,
    version: '1.0.0',
    author: 'Plugin Editor',
    description: `Created with Plugin Editor (${language})`
  }

  // Create or update editor plugin data
  const pluginData: EditorPluginData = {
    id: currentPluginId || generateEditorPluginId(name),
    name,
    source,
    compiled,
    language,
    metadata,
    createdAt: currentPluginId ? (await getEditorPlugin(currentPluginId))?.createdAt || now : now,
    updatedAt: now,
    lastCompiledAt: language === 'typescript' ? now : undefined,
  }

  // Store in editor database
  await storeEditorPlugin(pluginData)

  // Sync compiled JS to plugin storage (so it can be loaded by the main app)
  if (currentPluginId) {
    await updatePluginScript(pluginData.id, compiled, metadata)
  } else {
    await storePluginScript(pluginData.id, compiled, metadata)
  }

  // Update localStorage list so Scripts UI can see it
  if (isNewPlugin) {
    updateLocalStorageList(pluginData.id)
    // Trigger a storage event change to notify the system
    localStorage.setItem('stored_scripts_updated', Date.now().toString())
  }

  currentPluginId = pluginData.id

  // Refresh plugin list
  await refreshPluginList()

  // Select the saved plugin
  const pluginSelect = document.getElementById('plugin-select') as HTMLSelectElement
  pluginSelect.value = pluginData.id

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
  const compiled = language === 'typescript' ? await compileTypeScript(source) : source

  // Create basic metadata
  const metadata = {
    name: name,
    version: '1.0.0',
    author: 'Plugin Editor',
    description: `Created with Plugin Editor (${language})`
  }

  const now = Date.now()
  const pluginData: EditorPluginData = {
    id: generateEditorPluginId(name),
    name,
    source,
    compiled,
    language,
    metadata,
    createdAt: now,
    updatedAt: now,
    lastCompiledAt: language === 'typescript' ? now : undefined,
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
      option.textContent = `${plugin.name} (${plugin.language === 'typescript' ? 'TS' : 'JS'})`
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

  // Enable diagnostics for TypeScript
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  })

  // Enable diagnostics for JavaScript
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
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

// Initialize Monaco Editor
async function initEditor() {
  const container = document.getElementById('editor-container')!

  // Setup TypeScript environment first
  setupTypeScriptEnvironment()

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
  })

  updateStatus('Editor initialized', 'success')
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

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      savePlugin()
    }
  })
}

// Initialize
async function init() {
  updateStatus('Initializing...', 'normal')
  await initEditor()
  await initEsbuild()
  await refreshPluginList()
  setupEventListeners()
  updateStatus('Ready', 'success')
}

init()
