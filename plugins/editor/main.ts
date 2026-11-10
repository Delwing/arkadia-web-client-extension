import * as monaco from 'monaco-editor'

// Import Monaco workers
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

// Import file-icons CSS
import 'file-icons-js/css/style.css'


import {updateStatus} from './utils'
import {initEsbuild} from './bundler'
import {initializeEditor} from './monaco/editorSetup'
import {applyInitialThemeFromCache, changeTheme, getSavedTheme} from './monaco/themes'
import {showNewPluginModal} from './modals'
import {CodingAgentPanel} from './codingAgentPanel'
import {createPopover, type Popover} from './popover'
import {setupPluginSwitcher} from './pluginSwitcher'
import {setupSettings, setupStatusBar} from './chrome'
import {
  closePlugin,
  getPluginList,
  isPluginDirty,
  loadPlugin,
  reloadPluginList,
  renderCurrentFileTree,
  requestOpenPlugin,
  saveCurrentPlugin,
  sessionHooks,
  state,
  switchToFile,
} from './session'
import {setupFileTreeActions} from './fileTreeActions'
import {
  deleteCurrentPlugin,
  downloadCurrentPlugin,
  publishCurrentPlugin,
  renameCurrentPlugin,
  setupPluginActions,
  uploadPluginFromFile,
} from './pluginActions'
import {getJsPreviewEditor, setupJsPreview} from './jsPreview'
import {setupFilePicker, showFilePickerHandler} from './filePicker'
import {setupDevServer, setupDevServerModal, showDevServerModal} from './devServerUi'
import {followOpenPlugin, linkCurrentPluginToFolder, setupFolderLink, writeToLinkedFolder} from './folderLink'
import {setupPanelResizers} from './panelResizers'

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

let agentPanel: CodingAgentPanel | null = null
let pluginSwitcher: Popover | null = null

sessionHooks.followPlugin = followOpenPlugin
sessionHooks.pluginLoaded = (pluginId) => agentPanel?.onPluginChanged(pluginId)
sessionHooks.saved = writeToLinkedFolder

// The toolbar, menus and shortcuts; each panel wires its own controls.
function setupEventListeners() {
  pluginSwitcher = setupPluginSwitcher({
    getPlugins: () => [...getPluginList()],
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
    'link-folder': linkCurrentPluginToFolder,
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
    () => [state.editor, getJsPreviewEditor()].filter((e): e is monaco.editor.IStandaloneCodeEditor => !!e),
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

  setupJsPreview()
  setupPluginActions()
  setupFileTreeActions()
  setupFilePicker()
  setupPanelResizers()
  setupDevServerModal()

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

  sessionHooks.refreshStatusBar = setupStatusBar(
    state.editor,
    () => state.currentPluginId,
    (filePath, position) => switchToFile(filePath, position)
  )

  await initEsbuild(updateStatus)
  await reloadPluginList()
  setupEventListeners()
  setupDevServer()
  setupFolderLink()

  // ?plugin=<id> opens that plugin; without it the welcome screen shows.
  const urlParams = new URLSearchParams(window.location.search)
  const pluginIdFromUrl = urlParams.get('plugin')

  if (pluginIdFromUrl && getPluginList().some(p => p.id === pluginIdFromUrl)) {
    await loadPlugin(pluginIdFromUrl)
  } else {
    closePlugin()
  }

  updateStatus('Ready', 'success')
}

init()