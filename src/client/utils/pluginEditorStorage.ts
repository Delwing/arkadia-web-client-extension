import { storeInIndexedDB, getFromIndexedDB, clearIndexedDB } from './dataCache'
import type { PluginInfo } from '@shared/types/Plugin'

/**
 * Individual file in a plugin's virtual file system
 */
export interface PluginFile {
  /** File path relative to plugin root (e.g., "index.ts", "utils/helper.ts") */
  path: string
  /** File content */
  content: string
  /** Language/file type */
  language: 'javascript' | 'typescript' | 'json' | 'plaintext'
}

export interface EditorPluginData {
  /** Unique identifier for the plugin */
  id: string
  /** Plugin name */
  name: string
  /** Compiled JavaScript code (always present, bundled from all files) */
  compiled: string
  /** Virtual file system - map of file paths to file data */
  files: Record<string, PluginFile>
  /** List of folder paths (without trailing slash, e.g., "utils", "components/ui") */
  folders?: string[]
  /** Entry point file path (e.g., "index.ts") */
  entryPoint: string
  /** Plugin metadata */
  metadata?: PluginInfo
  /** When the plugin was created */
  createdAt: number
  /** Last modification timestamp */
  updatedAt: number
  /** Last compilation timestamp */
  lastCompiledAt: number
}

const DB_CONFIG = {
  dbName: 'ArkadiaPluginEditorDB',
  storeName: 'editorPlugins',
}

/**
 * Get IndexedDB config for a specific plugin
 */
function getPluginConfig(pluginId: string) {
  return {
    ...DB_CONFIG,
    key: pluginId,
  }
}

/**
 * Store a plugin in the editor database
 */
export async function storeEditorPlugin(data: EditorPluginData): Promise<void> {
  await storeInIndexedDB(getPluginConfig(data.id), data)
}

/**
 * Get a plugin from the editor database
 */
export async function getEditorPlugin(pluginId: string): Promise<EditorPluginData | null> {
  return await getFromIndexedDB<EditorPluginData>(getPluginConfig(pluginId))
}

/**
 * Delete a plugin from the editor database
 */
export async function deleteEditorPlugin(pluginId: string): Promise<void> {
  await clearIndexedDB(getPluginConfig(pluginId))
}

/**
 * Get all editor plugin IDs
 */
export async function getAllEditorPluginIds(): Promise<string[]> {
  const dbName = DB_CONFIG.dbName
  const storeName = DB_CONFIG.storeName

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName)

    request.onsuccess = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(storeName)) {
        resolve([])
        return
      }

      const transaction = db.transaction([storeName], 'readonly')
      const store = transaction.objectStore(storeName)
      const getAllRequest = store.getAllKeys()

      getAllRequest.onsuccess = () => {
        resolve(getAllRequest.result as string[])
      }

      getAllRequest.onerror = () => {
        reject(new Error('Failed to get all editor plugin IDs'))
      }
    }

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'))
    }
  })
}

/**
 * Get all editor plugins
 */
export async function getAllEditorPlugins(): Promise<EditorPluginData[]> {
  const dbName = DB_CONFIG.dbName
  const storeName = DB_CONFIG.storeName

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName)

    request.onsuccess = () => {
      const db = request.result

      if (!db.objectStoreNames.contains(storeName)) {
        resolve([])
        return
      }

      const transaction = db.transaction([storeName], 'readonly')
      const store = transaction.objectStore(storeName)
      const getAllRequest = store.getAll()

      getAllRequest.onsuccess = () => {
        const results = getAllRequest.result as Array<{ id: string; data: EditorPluginData; timestamp: number }>
        resolve(results.map(r => r.data))
      }

      getAllRequest.onerror = () => {
        reject(new Error('Failed to get all editor plugins'))
      }
    }

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'))
    }
  })
}

/**
 * Generate a unique plugin ID from name
 */
export function generateEditorPluginId(name: string): string {
  const timestamp = Date.now()
  const hash = simpleHash(name)
  return `editor_${hash}_${timestamp}`
}

/**
 * Simple hash function for generating IDs
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(36)
}

/**
 * Build an editor record for a plugin that exists only as a single blob of
 * ready-to-run JavaScript — pasted through "Wklej kod" or stored by an older
 * build that never wrote an editor record. Without this the plugin runs but the
 * editor cannot open it, since the editor reads a different database.
 *
 * The source doubles as the compiled output: pasted code is already what the
 * runtime loads. Re-saving from the editor bundles it through esbuild as usual.
 */
export function createEditorPluginFromSource(
  id: string,
  name: string,
  source: string,
  metadata?: PluginInfo,
  createdAt?: number
): EditorPluginData {
  const now = Date.now()
  const entryPoint = 'index.js'

  return {
    id,
    name,
    compiled: source,
    files: {
      [entryPoint]: createPluginFile(entryPoint, source),
    },
    entryPoint,
    metadata,
    createdAt: createdAt ?? now,
    updatedAt: now,
    lastCompiledAt: now,
  }
}

/**
 * Migrate legacy single-file plugin to multi-file format
 * This handles plugins stored before the multi-file system was implemented
 */
export function migrateLegacyPlugin(plugin: any): EditorPluginData {
  // If already has proper multi-file structure, no migration needed
  if (plugin.files && plugin.entryPoint) {
    return plugin as EditorPluginData
  }

  // Migrate from legacy source/language format
  if (plugin.source && plugin.language) {
    const extension = plugin.language === 'typescript' ? 'ts' : 'js'
    const entryPoint = `index.${extension}`

    return {
      id: plugin.id,
      name: plugin.name,
      compiled: plugin.compiled,
      files: {
        [entryPoint]: {
          path: entryPoint,
          content: plugin.source,
          language: plugin.language,
        }
      },
      entryPoint,
      metadata: plugin.metadata,
      createdAt: plugin.createdAt,
      updatedAt: plugin.updatedAt,
      lastCompiledAt: plugin.lastCompiledAt || plugin.updatedAt,
    }
  }

  // Fallback: create minimal valid plugin structure
  const entryPoint = 'index.ts'
  return {
    id: plugin.id,
    name: plugin.name,
    compiled: plugin.compiled || '',
    files: {
      [entryPoint]: {
        path: entryPoint,
        content: '',
        language: 'typescript',
      }
    },
    entryPoint,
    metadata: plugin.metadata,
    createdAt: plugin.createdAt,
    updatedAt: plugin.updatedAt,
    lastCompiledAt: plugin.updatedAt,
  }
}

/**
 * Get the language for a file based on extension
 */
export function getLanguageFromPath(path: string): 'javascript' | 'typescript' | 'json' | 'plaintext' {
  const extension = path.split('.').pop()?.toLowerCase()

  switch (extension) {
    case 'ts':
    case 'tsx':
      return 'typescript'
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript'
    case 'json':
      return 'json'
    default:
      return 'plaintext'
  }
}

/**
 * Create a new plugin file
 */
export function createPluginFile(path: string, content: string = ''): PluginFile {
  return {
    path,
    content,
    language: getLanguageFromPath(path),
  }
}
