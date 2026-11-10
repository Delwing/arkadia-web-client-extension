/**
 * The IDE connection (dev server): its status and settings modal, and taking
 * what the IDE sends into the open plugin.
 */
import type {EditorPluginData} from '@client/utils/pluginEditorStorage.ts'
import {updateStatus} from './utils'
import {bundlePlugin} from './bundler'
import {getDevServer, type DevServerStatus} from './devServer'
import {openDialog} from './dialogs'
import {setSettingsIdeStatus} from './chrome'
import {baselineOf} from './savedBaseline'
import {
  createFileModel,
  describeUnsaved,
  exclusive,
  isPluginDirty,
  loadPlugin,
  reloadPluginList,
  renderCurrentFileTree,
  requestOpenPlugin,
  setModelFromIDE,
  state,
  switchToFile,
} from './session'

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

export function showDevServerModal() {
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

export function hideDevServerModal() {
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

/**
 * The IDE (dev server or linked folder) wrote a plugin to storage. Fold it
 * into the open copy rather than swapping the copy out, so browser edits it
 * did not touch survive.
 */
export function takeExternalUpdate(pluginId: string, plugin: EditorPluginData, changed: string[] | 'all') {
  void exclusive(async () => {
    if (state.currentPluginId === pluginId && state.currentPlugin) {
      if (changed === 'all') await takeFullSyncFromIDE(plugin)
      else takeFileUpdateFromIDE(plugin, changed)
    }
    // Refresh plugin list in case a new plugin was added
    await reloadPluginList()
  })
}

export function setupDevServer() {
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
    takeExternalUpdate(pluginId, plugin, changed)
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

/** Wire the IDE connection modal. */
export function setupDevServerModal() {
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
