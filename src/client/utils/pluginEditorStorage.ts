import { storeInIndexedDB, getFromIndexedDB, clearIndexedDB } from './dataCache'
import type { PluginInfo } from '@shared/types/Plugin'

export interface EditorPluginData {
  /** Unique identifier for the plugin */
  id: string
  /** Plugin name */
  name: string
  /** Source code (TypeScript or JavaScript) */
  source: string
  /** Compiled JavaScript code (always present, either compiled or same as source) */
  compiled: string
  /** Language of the source file */
  language: 'javascript' | 'typescript'
  /** Plugin metadata */
  metadata?: PluginInfo
  /** When the plugin was created */
  createdAt: number
  /** Last modification timestamp */
  updatedAt: number
  /** Last compilation timestamp (for TypeScript files) */
  lastCompiledAt?: number
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
