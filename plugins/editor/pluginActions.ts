/** Whole-plugin actions: create, import, download, publish, rename, delete. */
import {updateStatus} from './utils'
import {bundlePlugin} from './bundler'
import {hideNewPluginModal} from './modals'
import {createNewPlugin, deletePlugin, downloadPlugin, uploadPlugin} from './pluginManagement'
import {publishToRegistry} from './registryPublish'
import {removeFolderLink} from './localFolder'
import {openDialog} from './dialogs'
import {setHeaderPlugin} from './chrome'
import {closePlugin, currentPluginLanguage, loadPlugin, reloadPluginList, saveCurrentPlugin, state} from './session'

// Delete plugin wrapper
export async function deleteCurrentPlugin() {
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

  const deletedId = state.currentPluginId
  await deletePlugin(deletedId, updateStatus)
  // The folder itself, and the files in it, stay on disk.
  await removeFolderLink(deletedId)
  closePlugin()
  await reloadPluginList()
}

// Rename plugin: the name lives in the plugin record, so renaming saves it
export async function renameCurrentPlugin() {
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
export async function createNewPluginHandler() {
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
export async function downloadCurrentPlugin() {
  if (!state.currentPluginId) {
    updateStatus('No plugin selected', 'error')
    return
  }

  await downloadPlugin(state.currentPluginId, updateStatus)
}

// Publish plugin to the registry wrapper
export async function publishCurrentPlugin() {
  if (!state.currentPluginId) {
    updateStatus('No plugin selected', 'error')
    return
  }

  await publishToRegistry(state.currentPluginId, updateStatus)
}

// Upload plugin wrapper
export async function uploadPluginFromFile() {
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

/** Wire the new-plugin modal. */
export function setupPluginActions() {
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
}
