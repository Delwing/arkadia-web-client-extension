import { storeInIndexedDB, getFromIndexedDB, clearIndexedDB } from './dataCache'
import type { PluginInfo } from '@shared/types/Plugin'

export interface StoredPluginData {
  /** Unique identifier for the stored plugin */
  id: string
  /** Plugin JavaScript code */
  code: string
  /** Plugin metadata */
  metadata?: PluginInfo
  /** When the plugin was stored */
  createdAt: number
  /** Last modification timestamp */
  updatedAt: number
}

const DB_CONFIG = {
  dbName: 'ArkadiaPluginsDB',
  storeName: 'storedScripts',
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
 * Store a plugin script in IndexedDB
 */
export async function storePluginScript(
  pluginId: string,
  code: string,
  metadata?: PluginInfo
): Promise<void> {
  const now = Date.now()
  const pluginData: StoredPluginData = {
    id: pluginId,
    code,
    metadata,
    createdAt: now,
    updatedAt: now,
  }

  await storeInIndexedDB(getPluginConfig(pluginId), pluginData)
}

/**
 * Update an existing plugin script
 */
export async function updatePluginScript(
  pluginId: string,
  code: string,
  metadata?: PluginInfo
): Promise<void> {
  const existing = await getPluginScript(pluginId)
  const now = Date.now()

  const pluginData: StoredPluginData = {
    id: pluginId,
    code,
    metadata,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }

  await storeInIndexedDB(getPluginConfig(pluginId), pluginData)
}

/**
 * Get a plugin script from IndexedDB
 */
export async function getPluginScript(pluginId: string): Promise<StoredPluginData | null> {
  return await getFromIndexedDB<StoredPluginData>(getPluginConfig(pluginId))
}

/**
 * Delete a plugin script from IndexedDB
 */
export async function deletePluginScript(pluginId: string): Promise<void> {
  await clearIndexedDB(getPluginConfig(pluginId))
}

/**
 * Get all stored plugin IDs
 */
export async function getAllStoredPluginIds(): Promise<string[]> {
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
        reject(new Error('Failed to get all plugin IDs'))
      }
    }

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'))
    }
  })
}

/**
 * Get all stored plugins
 */
export async function getAllStoredPlugins(): Promise<StoredPluginData[]> {
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
        const results = getAllRequest.result as Array<{ id: string; data: StoredPluginData; timestamp: number }>
        resolve(results.map(r => r.data))
      }

      getAllRequest.onerror = () => {
        reject(new Error('Failed to get all plugins'))
      }
    }

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'))
    }
  })
}

/**
 * Generate a unique plugin ID from name or code
 */
export function generatePluginId(nameOrCode: string): string {
  const timestamp = Date.now()
  const hash = simpleHash(nameOrCode)
  return `stored_${hash}_${timestamp}`
}

/**
 * Check if a plugin identifier is for a stored plugin (vs URL)
 */
export function isStoredPluginId(identifier: string): boolean {
  return identifier.startsWith('stored_')
}

/**
 * Simple hash function for generating IDs
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36)
}
