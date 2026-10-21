/**
 * Writing plugin files that changed outside the browser editor (the IDE
 * dev server, a linked local folder) into editor storage, rebundling the
 * plugin and passing the bundle on to the game client's plugin storage.
 */

import type { EditorPluginData, PluginFile } from '@client/utils/pluginEditorStorage'
import {
  storeEditorPlugin,
  getEditorPlugin,
  getLanguageFromPath,
} from '@client/utils/pluginEditorStorage'
import {
  storePluginScript,
  updatePluginScript,
} from '@client/utils/pluginStorage'
import { updateLocalStorageList } from './pluginManagement'

export type BundlePlugin = (files: Record<string, PluginFile>, entryPoint: string) => Promise<string>

export interface FileUpdate {
  path: string
  content: string
}

export interface FullSync {
  pluginId: string
  name?: string
  entryPoint: string
  files: Record<string, { path?: string; content: string; language?: string }>
  folders?: string[]
}

/**
 * Some files of a stored plugin changed: write them and rebundle. Resolves
 * null when there is no such plugin.
 */
export async function applyFileUpdate(
  pluginId: string,
  updates: FileUpdate[],
  bundlePlugin: BundlePlugin | null,
): Promise<EditorPluginData | null> {
  const plugin = await getEditorPlugin(pluginId)
  if (!plugin) {
    console.error('[ExternalSync] Plugin not found:', pluginId)
    return null
  }

  for (const file of updates) {
    if (plugin.files[file.path]) {
      plugin.files[file.path].content = file.content
    } else {
      plugin.files[file.path] = {
        path: file.path,
        content: file.content,
        language: getLanguageFromPath(file.path),
      }
    }
  }

  plugin.updatedAt = Date.now()

  if (bundlePlugin) {
    try {
      plugin.compiled = await bundlePlugin(plugin.files, plugin.entryPoint)
      plugin.lastCompiledAt = Date.now()
      await updatePluginScript(plugin.id, plugin.compiled, plugin.metadata)
    } catch (error) {
      console.error('[ExternalSync] Failed to compile plugin:', error)
    }
  }

  await storeEditorPlugin(plugin)
  return plugin
}

/** The whole file set of a plugin was replaced; creates the plugin when it is new. */
export async function applyFullSync(sync: FullSync, bundlePlugin: BundlePlugin | null): Promise<EditorPluginData> {
  const existingPlugin = await getEditorPlugin(sync.pluginId)
  const now = Date.now()

  const files: Record<string, PluginFile> = {}
  for (const [path, file] of Object.entries(sync.files)) {
    files[path] = {
      path: file.path || path,
      content: file.content,
      language: (file.language as PluginFile['language']) || getLanguageFromPath(path),
    }
  }

  let compiled = ''
  if (bundlePlugin) {
    try {
      compiled = await bundlePlugin(files, sync.entryPoint)
    } catch (error) {
      console.error('[ExternalSync] Failed to compile plugin:', error)
    }
  }

  const plugin: EditorPluginData = {
    id: sync.pluginId,
    name: sync.name || existingPlugin?.name || 'Synced Plugin',
    // A failed build keeps the last good bundle rather than blanking it.
    compiled: compiled || existingPlugin?.compiled || '',
    files,
    folders: sync.folders || [],
    entryPoint: sync.entryPoint,
    metadata: existingPlugin?.metadata || {
      name: sync.name || 'Synced Plugin',
      version: '1.0.0',
      author: 'Dev Server',
      description: 'Synced from IDE',
    },
    createdAt: existingPlugin?.createdAt || now,
    updatedAt: now,
    lastCompiledAt: compiled ? now : (existingPlugin?.lastCompiledAt || now),
    // The IDE knows nothing of the catalogue link; dropping it would make
    // the next publish a brand new plugin instead of an update.
    ...(existingPlugin?.registrySlug ? { registrySlug: existingPlugin.registrySlug } : {}),
  }

  await storeEditorPlugin(plugin)

  if (compiled) {
    if (existingPlugin) {
      await updatePluginScript(plugin.id, compiled, plugin.metadata)
    } else {
      await storePluginScript(plugin.id, compiled, plugin.metadata)
      updateLocalStorageList(plugin.id)
      localStorage.setItem('stored_scripts_updated', Date.now().toString())
    }
  }

  return plugin
}
