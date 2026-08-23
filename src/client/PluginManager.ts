import type Client from '@client/Client'
import { forgetPluginScriptUsage } from '@modules/core/pluginScriptUsage'
import type {LoadedPlugin, Plugin} from '@shared/types/Plugin'
import {PluginApiImpl} from '@client/PluginApi'
import eventBus from '@modules/core/eventBus'
import {getPluginScript, isStoredPluginId, updatePluginScript} from '@client/utils/pluginStorage'

/**
 * Manages external plugins and scripts
 */
export class PluginManager {
  private plugins: Map<string, LoadedPlugin> = new Map()
  private client: Client

  constructor(client: Client) {
    this.client = client
  }

  /**
   * Load a plugin from a URL or stored plugin ID
   * Attempts to load as ES module first, falls back to legacy script injection
   */
  async loadPlugin(identifier: string): Promise<LoadedPlugin> {
    // Check if already loaded
    if (this.plugins.has(identifier)) {
      const existing = this.plugins.get(identifier)!
      console.log(`[PluginManager] Plugin already loaded: ${identifier}`)
      return existing
    }

    // Create initial plugin entry
    const plugin: LoadedPlugin = {
      url: identifier,
      status: 'loading',
      loadedAt: Date.now(),
    }
    this.plugins.set(identifier, plugin)

    try {
      // Check if this is a stored plugin (from IndexedDB)
      let module: any
      if (isStoredPluginId(identifier)) {
        module = await this.loadStoredPlugin(identifier)
      } else {
        // Try to load as ES module from URL
        module = await this.loadAsModule(identifier)
      }

      if (module && this.isPlugin(module)) {
        // It's a proper plugin with init method
        try {
          // Create a PluginApi instance for this plugin
          const apiInstance = new PluginApiImpl(this.client, identifier)
          plugin.apiInstance = apiInstance

          // Initialize plugin with the API
          const info = await module.init(apiInstance)
          plugin.info = info
          plugin.status = 'loaded'
          plugin.instance = module

          // Set the plugin name on the API instance for macro registration
          apiInstance.setPluginName(info.name)

          console.log(`[PluginManager] Plugin loaded: ${info.name} v${info.version}`)

          // If this is a stored plugin, update its metadata in IndexedDB
          if (isStoredPluginId(identifier)) {
            const storedPlugin = await getPluginScript(identifier)
            if (storedPlugin) {
              await updatePluginScript(identifier, storedPlugin.code, info).catch(err => {
                console.error(`[PluginManager] Failed to update stored plugin metadata:`, err)
              })
            }
          }

          eventBus.emit('plugin:loaded', { url: identifier, info })
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          plugin.status = 'error'
          plugin.error = `Init failed: ${errorMsg}`
          console.error(`[PluginManager] Plugin init failed for ${identifier}:`, error)
          eventBus.emit('plugin:error', { url: identifier, error: errorMsg })
        }
      } else {
        // Module loaded but doesn't implement Plugin interface
        // Treat as legacy script
        plugin.status = 'legacy'
        console.log(`[PluginManager] Module loaded as legacy script: ${identifier}`)
      }
    } catch (_error) {
      // Failed to load as module, try legacy script injection (only for URLs, not stored plugins)
      if (!isStoredPluginId(identifier)) {
        console.log(`[PluginManager] Failed to load as module, trying legacy script injection: ${identifier}`)
        console.log(`[PluginManager] Module load error:`, _error)
        try {
          await this.loadAsLegacyScript(identifier, plugin)
          plugin.status = 'legacy'
          console.log(`[PluginManager] Legacy script loaded: ${identifier}`)
        } catch (scriptError) {
          const errorMsg = scriptError instanceof Error ? scriptError.message : String(scriptError)
          plugin.status = 'error'
          plugin.error = `Failed to load: ${errorMsg}`
          console.error(`[PluginManager] Failed to load plugin ${identifier}:`, scriptError)
          console.error(`[PluginManager] All attempts to load plugin failed`)
          eventBus.emit('plugin:error', { url: identifier, error: errorMsg })
        }
      } else {
        // Stored plugin failed to load
        const errorMsg = _error instanceof Error ? _error.message : String(_error)
        plugin.status = 'error'
        plugin.error = `Failed to load stored plugin: ${errorMsg}`
        console.error(`[PluginManager] ===== STORED PLUGIN LOAD FAILURE =====`)
        console.error(`[PluginManager] Plugin ID: ${identifier}`)
        console.error(`[PluginManager] Error: ${errorMsg}`)
        console.error(`[PluginManager] Full error object:`, _error)
        console.error(`[PluginManager] ======================================`)
        eventBus.emit('plugin:error', { url: identifier, error: errorMsg })
      }
    }

    this.plugins.set(identifier, plugin)
    return plugin
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(url: string): Promise<void> {
    const plugin = this.plugins.get(url)
    if (!plugin) {
      console.warn(`[PluginManager] Plugin not found: ${url}`)
      return
    }

    // Call destroy if available
    if (plugin.instance?.destroy) {
      try {
        await plugin.instance.destroy()
        console.log(`[PluginManager] Plugin destroyed: ${url}`)
      } catch (error) {
        console.error(`[PluginManager] Error destroying plugin ${url}:`, error)
      }
    }

    // An unloaded plugin can no longer be broken by turning a script off, so it
    // must stop being named in that warning.
    forgetPluginScriptUsage(url)

    // Cleanup the API instance (removes aliases, etc.)
    if (plugin.apiInstance && typeof plugin.apiInstance.cleanup === 'function') {
      try {
        plugin.apiInstance.cleanup()
      } catch (error) {
        console.error(`[PluginManager] Error cleaning up API instance for ${url}:`, error)
      }
    }

    // Remove script element if legacy
    if (plugin.scriptElement && plugin.scriptElement.parentNode) {
      plugin.scriptElement.parentNode.removeChild(plugin.scriptElement)
    }

    this.plugins.delete(url)
    eventBus.emit('plugin:destroyed', { url })
  }

  /**
   * Get all loaded plugins
   */
  getLoadedPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values())
  }

  /**
   * Get a specific plugin by URL
   */
  getPlugin(url: string): LoadedPlugin | undefined {
    return this.plugins.get(url)
  }

  /**
   * Check if a plugin is loaded
   */
  isLoaded(url: string): boolean {
    return this.plugins.has(url)
  }

  /**
   * Load a stored plugin from IndexedDB
   */
  private async loadStoredPlugin(pluginId: string): Promise<any> {
    console.log(`[PluginManager] Loading stored plugin: ${pluginId}`)
    const storedPlugin = await getPluginScript(pluginId)
    if (!storedPlugin) {
      console.error(`[PluginManager] Stored plugin not found in IndexedDB: ${pluginId}`)
      throw new Error(`Stored plugin not found: ${pluginId}`)
    }

    // Create a blob URL from the code
    const blob = new Blob([storedPlugin.code], { type: 'application/javascript' })
    const blobUrl = URL.createObjectURL(blob)
    console.log(`[PluginManager] Created blob URL: ${blobUrl}`)

    try {
      // Import the module from the blob URL

      return await import(/* @vite-ignore */ blobUrl)
    } catch (error) {
      console.error(`[PluginManager] Failed to import module from blob URL:`, error)
      console.error(`[PluginManager] Full code that failed to load:`)
      console.error(storedPlugin.code)
      throw error
    } finally {
      // Clean up the blob URL after import
      URL.revokeObjectURL(blobUrl)
    }
  }

  /**
   * Attempt to load script as ES module
   */
  private async loadAsModule(url: string): Promise<any> {
    try {
      // Dynamic import with timestamp to bypass cache
      const timestamp = Date.now()
      const moduleUrl = `${url}${url.includes('?') ? '&' : '?'}_t=${timestamp}`
      return await import(/* @vite-ignore */ moduleUrl)
    } catch (error) {
      throw new Error(`Module import failed: ${error}`)
    }
  }

  /**
   * Load script using traditional script tag injection (legacy support)
   */
  private loadAsLegacyScript(url: string, plugin: LoadedPlugin): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = url
      script.async = true

      script.onload = () => {
        console.log(`[PluginManager] Legacy script loaded successfully: ${url}`)
        plugin.scriptElement = script
        resolve()
      }

      script.onerror = (event) => {
        console.error(`[PluginManager] Legacy script failed to load: ${url}`)
        console.error(`[PluginManager] Error event:`, event)
        reject(new Error('Script failed to load'))
      }

      document.head.appendChild(script)
    })
  }

  /**
   * Type guard to check if module implements Plugin interface
   */
  private isPlugin(module: any): module is Plugin {
    return (
      module &&
      typeof module === 'object' &&
      typeof module.init === 'function'
    )
  }

  /**
   * Reload all plugins (useful after client restart)
   */
  async reloadAll(): Promise<void> {
    const urls = Array.from(this.plugins.keys())

    // Unload all first
    await Promise.all(urls.map(url => this.unloadPlugin(url)))

    // Reload all
    await Promise.all(urls.map(url => this.loadPlugin(url)))
  }
}
