import type { EditorPluginData, PluginFile } from '@client/utils/pluginEditorStorage.ts'
import {
  storeEditorPlugin,
  getEditorPlugin,
  deleteEditorPlugin,
  getAllEditorPlugins,
  generateEditorPluginId,
} from '@client/utils/pluginEditorStorage.ts'
import {
  storePluginScript,
  updatePluginScript,
  deletePluginScript,
} from '@client/utils/pluginStorage.ts'
import type { StatusType } from './types'

export async function refreshPluginList(_currentPluginId: string | null): Promise<void> {
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
      const lang = plugin.entryPoint?.endsWith('.ts') ? 'TS' : 'JS'

      option.textContent = `${plugin.name} (${lang})${fileInfo}`
      select.appendChild(option)
    })

  // Restore selection if still valid
  if (currentValue && plugins.some(p => p.id === currentValue)) {
    select.value = currentValue
  }
}

export function updateLocalStorageList(pluginId: string) {
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

export function removeFromLocalStorageList(pluginId: string) {
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

export async function savePlugin(
  plugin: EditorPluginData,
  pluginId: string | null,
  _editorValue: string,
  modifiedFiles: Set<string>,
  bundlePluginFunc: (files: Record<string, PluginFile>, entryPoint: string) => Promise<string>,
  updateStatus: (message: string, type: StatusType) => void
): Promise<{ id: string; isNewPlugin: boolean }> {
  const nameInput = document.getElementById('plugin-name') as HTMLInputElement
  const name = nameInput.value.trim()

  if (!name) {
    updateStatus('Please enter a plugin name', 'error')
    throw new Error('No plugin name')
  }

  const now = Date.now()
  const isNewPlugin = !pluginId

  let compiled: string

  // Bundle/compile based on file structure
  if (Object.keys(plugin.files).length > 0) {
    try {
      updateStatus('Bundling plugin...', 'normal')
      compiled = await bundlePluginFunc(plugin.files, plugin.entryPoint)
      const compileStatus = document.getElementById('compile-status')!
      compileStatus.textContent = '✓ Bundled'
      setTimeout(() => compileStatus.textContent = '', 3000)
    } catch (error) {
      updateStatus('Bundling failed: ' + (error as Error).message, 'error')
      console.error(error)
      throw error
    }
  } else {
    updateStatus('No files to save', 'error')
    throw new Error('No files')
  }

  // Create basic metadata
  const metadata = {
    name: name,
    version: '1.0.0',
    author: 'Plugin Editor',
    description: `Created with Plugin Editor`
  }

  // Update plugin data
  plugin.id = pluginId || generateEditorPluginId(name)
  plugin.name = name
  plugin.compiled = compiled
  plugin.metadata = metadata
  plugin.updatedAt = now
  plugin.lastCompiledAt = now

  if (!plugin.createdAt) {
    plugin.createdAt = now
  }

  // Store in editor database
  await storeEditorPlugin(plugin)

  // Sync compiled JS to plugin storage
  if (pluginId) {
    await updatePluginScript(plugin.id, compiled, metadata)
  } else {
    await storePluginScript(plugin.id, compiled, metadata)
  }

  // Update localStorage list
  if (isNewPlugin) {
    updateLocalStorageList(plugin.id)
    localStorage.setItem('stored_scripts_updated', Date.now().toString())
  }

  // Clear modified files indicator
  modifiedFiles.clear()

  updateStatus(`Saved: ${name}`, 'success')
  return { id: plugin.id, isNewPlugin }
}

export async function deletePlugin(
  pluginId: string,
  updateStatus: (message: string, type: StatusType) => void
): Promise<void> {
  const plugin = await getEditorPlugin(pluginId)
  if (!plugin) return

  if (!confirm(`Delete plugin "${plugin.name}"?`)) return

  // Delete from editor storage
  await deleteEditorPlugin(pluginId)

  // Delete from plugin storage
  await deletePluginScript(pluginId)

  // Remove from localStorage list
  removeFromLocalStorageList(pluginId)

  // Trigger storage event
  localStorage.setItem('stored_scripts_updated', Date.now().toString())

  updateStatus('Plugin deleted', 'success')
}

export async function createNewPlugin(
  bundlePluginFunc: (files: Record<string, PluginFile>, entryPoint: string) => Promise<string>
): Promise<EditorPluginData> {
  const nameInput = document.getElementById('new-plugin-name') as HTMLInputElement
  const langSelect = document.getElementById('new-plugin-language') as HTMLSelectElement

  const name = nameInput.value.trim()
  if (!name) {
    throw new Error('Please enter a plugin name')
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
  const tsTemplate = `import PluginApi, { PluginInfo } from "plugin-api";

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
  const compiled = await bundlePluginFunc(files, entryPoint)

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

  // Add to localStorage list
  updateLocalStorageList(pluginData.id)
  localStorage.setItem('stored_scripts_updated', Date.now().toString())

  return pluginData
}
