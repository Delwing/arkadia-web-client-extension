import type { EditorPluginData, PluginFile } from '@client/utils/pluginEditorStorage.ts'
import {
  storeEditorPlugin,
  getEditorPlugin,
  deleteEditorPlugin,
  getAllEditorPlugins,
  generateEditorPluginId,
  getLanguageFromPath,
  createEditorPluginFromSource,
} from '@client/utils/pluginEditorStorage.ts'
import {
  storePluginScript,
  updatePluginScript,
  deletePluginScript,
  getPluginScript,
  getAllStoredPlugins,
} from '@client/utils/pluginStorage.ts'
import type { StatusType } from './types'
import JSZip from 'jszip'

export async function refreshPluginList(_currentPluginId: string | null): Promise<void> {
  const editorPlugins = await getAllEditorPlugins()
  const known = new Set(editorPlugins.map(p => p.id))

  // Stored-only plugins ("Wklej kod" from older builds) have no editor record
  // yet — list them anyway; opening one adopts it via adoptStoredPlugin().
  const storedOnly = (await getAllStoredPlugins())
    .filter(stored => !known.has(stored.id))
    .map(stored => ({
      ...createEditorPluginFromSource(
        stored.id,
        stored.metadata?.name || stored.id,
        stored.code,
        stored.metadata,
        stored.createdAt
      ),
      // keep the real timestamp so the list stays sorted by actual recency
      updatedAt: stored.updatedAt,
    }))

  const plugins = [...editorPlugins, ...storedOnly]
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

/**
 * Adopt a plugin that only exists as a stored runtime script — pasted through
 * "Wklej kod", or added before the paste dialog started writing editor records.
 * Its code becomes the entry point of a fresh single-file editor record under
 * the same id, so editing and saving keeps driving the same runtime plugin.
 *
 * Returns null when there is no stored script for the id either.
 */
export async function adoptStoredPlugin(pluginId: string): Promise<EditorPluginData | null> {
  const stored = await getPluginScript(pluginId)
  if (!stored) return null

  const plugin = createEditorPluginFromSource(
    pluginId,
    stored.metadata?.name || pluginId,
    stored.code,
    stored.metadata,
    stored.createdAt
  )

  await storeEditorPlugin(plugin)
  return plugin
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

/**
 * Download a plugin as a ZIP file containing all source files
 */
export async function downloadPlugin(
  pluginId: string,
  updateStatus: (message: string, type: StatusType) => void
): Promise<void> {
  const plugin = await getEditorPlugin(pluginId)
  if (!plugin) {
    updateStatus('Plugin not found', 'error')
    return
  }

  updateStatus('Creating ZIP file...', 'normal')

  const zip = new JSZip()

  // Add all files to the ZIP
  for (const [filePath, file] of Object.entries(plugin.files)) {
    zip.file(filePath, file.content)
  }

  // Add plugin metadata
  const metadata = {
    name: plugin.name,
    entryPoint: plugin.entryPoint,
    metadata: plugin.metadata,
    folders: plugin.folders || [],
  }
  zip.file('plugin.json', JSON.stringify(metadata, null, 2))

  // Generate and download the ZIP file
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${plugin.name.replace(/[^a-zA-Z0-9-_]/g, '_')}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  updateStatus(`Downloaded: ${plugin.name}.zip`, 'success')
}

/**
 * Upload a plugin from a ZIP file
 */
export async function uploadPlugin(
  file: File,
  bundlePluginFunc: (files: Record<string, PluginFile>, entryPoint: string) => Promise<string>,
  updateStatus: (message: string, type: StatusType) => void
): Promise<EditorPluginData | null> {
  updateStatus('Reading ZIP file...', 'normal')

  try {
    const zip = await JSZip.loadAsync(file)

    // Look for plugin.json metadata
    const metadataFile = zip.file('plugin.json')
    let pluginName = file.name.replace(/\.zip$/i, '')
    let entryPoint = ''
    let folders: string[] = []
    let pluginMetadata: EditorPluginData['metadata'] | undefined

    if (metadataFile) {
      try {
        const metadataContent = await metadataFile.async('string')
        const metadata = JSON.parse(metadataContent)
        pluginName = metadata.name || pluginName
        entryPoint = metadata.entryPoint || ''
        folders = metadata.folders || []
        pluginMetadata = metadata.metadata
      } catch {
        // Ignore metadata parse errors
      }
    }

    // Extract all files (except plugin.json)
    const files: Record<string, PluginFile> = {}
    const filePromises: Promise<void>[] = []

    zip.forEach((relativePath, zipEntry) => {
      if (zipEntry.dir || relativePath === 'plugin.json') return

      filePromises.push(
        zipEntry.async('string').then(content => {
          files[relativePath] = {
            path: relativePath,
            content,
            language: getLanguageFromPath(relativePath),
          }
        })
      )
    })

    await Promise.all(filePromises)

    if (Object.keys(files).length === 0) {
      updateStatus('ZIP file contains no source files', 'error')
      return null
    }

    // Try to determine entry point if not specified
    if (!entryPoint) {
      const possibleEntryPoints = ['index.ts', 'index.js', 'main.ts', 'main.js']
      for (const ep of possibleEntryPoints) {
        if (files[ep]) {
          entryPoint = ep
          break
        }
      }
      // Fallback to first TypeScript or JavaScript file
      if (!entryPoint) {
        const firstTsFile = Object.keys(files).find(f => f.endsWith('.ts'))
        const firstJsFile = Object.keys(files).find(f => f.endsWith('.js'))
        entryPoint = firstTsFile || firstJsFile || Object.keys(files)[0]
      }
    }

    updateStatus('Bundling plugin...', 'normal')

    // Bundle the plugin
    const compiled = await bundlePluginFunc(files, entryPoint)

    const now = Date.now()
    const pluginData: EditorPluginData = {
      id: generateEditorPluginId(pluginName),
      name: pluginName,
      files,
      folders,
      entryPoint,
      compiled,
      metadata: pluginMetadata || {
        name: pluginName,
        version: '1.0.0',
        author: 'Imported',
        description: 'Imported from ZIP file',
      },
      createdAt: now,
      updatedAt: now,
      lastCompiledAt: now,
    }

    // Store the plugin
    await storeEditorPlugin(pluginData)
    await storePluginScript(pluginData.id, compiled, pluginData.metadata)

    // Add to localStorage list
    updateLocalStorageList(pluginData.id)
    localStorage.setItem('stored_scripts_updated', Date.now().toString())

    updateStatus(`Imported: ${pluginName}`, 'success')
    return pluginData
  } catch (error) {
    updateStatus('Failed to import plugin: ' + (error as Error).message, 'error')
    console.error('Plugin import error:', error)
    return null
  }
}
