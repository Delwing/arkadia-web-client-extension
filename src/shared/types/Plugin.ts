import type { PluginApi } from '@client/PluginApi'

/**
 * Information about a loaded plugin
 */
export interface PluginInfo {
  /** Plugin name */
  name: string
  /** Plugin version (semantic versioning recommended) */
  version: string
  /** Plugin author information */
  author?: string
  /** Brief description of plugin functionality */
  description?: string
}

/**
 * Plugin interface that external scripts should implement
 */
export interface Plugin {
  /**
   * Optional stable id (`export const stableId = 'jubiler'`): the plugin's
   * storage and windows are kept under it instead of its URL, so they survive
   * the plugin moving to another address. 1-64 letters, digits, '.', '_', '-';
   * ignored when another loaded plugin uses it.
   */
  stableId?: string

  /**
   * Initialize the plugin with the Plugin API
   * @param api - The Plugin API instance providing controlled access to client functionality
   * @returns Promise resolving to plugin information
   */
  init(api: PluginApi): Promise<PluginInfo>

  /**
   * Optional cleanup method called when plugin is unloaded
   */
  destroy?(): Promise<void> | void
}

/**
 * Status of a loaded plugin
 */
export type PluginStatus = 'loading' | 'loaded' | 'error' | 'legacy'

/**
 * Internal representation of a loaded plugin
 */
export interface LoadedPlugin {
  /** Script URL or stored plugin ID (if stored in IndexedDB) */
  url: string
  /** Plugin information (if available) */
  info?: PluginInfo
  /** Plugin status */
  status: PluginStatus
  /** Error message (if status is 'error') */
  error?: string
  /** Plugin instance (if implements Plugin interface) */
  instance?: Plugin
  /** Plugin API instance provided to the plugin */
  apiInstance?: any // PluginApiImpl, but avoiding circular dependency
  /** The plugin's accepted stableId, which its saved state is kept under */
  stableId?: string
  /** Script element (for legacy scripts loaded via URL) */
  scriptElement?: HTMLScriptElement
  /** Timestamp when plugin was loaded */
  loadedAt: number
}
