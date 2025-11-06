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
  /** Script URL */
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
  /** Script element (for legacy scripts) */
  scriptElement?: HTMLScriptElement
  /** Timestamp when plugin was loaded */
  loadedAt: number
}
