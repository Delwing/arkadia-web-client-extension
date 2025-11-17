import type Client from '@client/Client'
import type { Plugin, LoadedPlugin } from '@shared/types/Plugin'
import { PluginApiImpl } from '@client/PluginApi'
import eventBus from '@modules/core/eventBus'

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
   * Load a plugin from a URL
   * Attempts to load as ES module first, falls back to legacy script injection
   */
  async loadPlugin(url: string): Promise<LoadedPlugin> {
    // Check if already loaded
    if (this.plugins.has(url)) {
      const existing = this.plugins.get(url)!
      console.log(`[PluginManager] Plugin already loaded: ${url}`)
      return existing
    }

    // Create initial plugin entry
    const plugin: LoadedPlugin = {
      url,
      status: 'loading',
      loadedAt: Date.now(),
    }
    this.plugins.set(url, plugin)

    try {
      // Try to load as ES module
      const module = await this.loadAsModule(url)

      if (module && this.isPlugin(module)) {
        // It's a proper plugin with init method
        try {
          // Create a PluginApi instance for this plugin
          const apiInstance = new PluginApiImpl(this.client)
          plugin.apiInstance = apiInstance

          // Initialize plugin with the API
          const info = await module.init(apiInstance)
          plugin.info = info
          plugin.status = 'loaded'
          plugin.instance = module

          console.log(`[PluginManager] Plugin loaded: ${info.name} v${info.version}`)
          eventBus.emit('plugin:loaded', { url, info })
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          plugin.status = 'error'
          plugin.error = `Init failed: ${errorMsg}`
          console.error(`[PluginManager] Plugin init failed for ${url}:`, error)
          eventBus.emit('plugin:error', { url, error: errorMsg })
        }
      } else {
        // Module loaded but doesn't implement Plugin interface
        // Treat as legacy script
        plugin.status = 'legacy'
        console.log(`[PluginManager] Module loaded as legacy script: ${url}`)
      }
    } catch (_error) {
      // Failed to load as module, try legacy script injection
      console.log(`[PluginManager] Failed to load as module, trying legacy script injection: ${url}`)
      try {
        await this.loadAsLegacyScript(url, plugin)
        plugin.status = 'legacy'
        console.log(`[PluginManager] Legacy script loaded: ${url}`)
      } catch (scriptError) {
        const errorMsg = scriptError instanceof Error ? scriptError.message : String(scriptError)
        plugin.status = 'error'
        plugin.error = `Failed to load: ${errorMsg}`
        console.error(`[PluginManager] Failed to load plugin ${url}:`, scriptError)
        eventBus.emit('plugin:error', { url, error: errorMsg })
      }
    }

    this.plugins.set(url, plugin)
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
        plugin.scriptElement = script
        resolve()
      }

      script.onerror = () => {
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
