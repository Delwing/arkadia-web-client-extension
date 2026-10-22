import type Client from '@client/Client'
import type {LoadedPlugin, Plugin} from '@shared/types/Plugin'
import {PluginApiImpl} from '@client/PluginApi'
import eventBus from '@modules/core/eventBus'
import {colorString, createColorFormat} from '@modules/core/Colors'
import type {AnsiAwareBuffer} from '@client/ansi/FormatState.ts'
import {getPluginScript, isStoredPluginId, updatePluginScript} from '@client/utils/pluginStorage'

const STABLE_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

// Hosts whose plugins are taken to come from a dev server on this machine.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
// EventSource retries every few seconds; about a minute covers a dev server restart.
const LIVE_RELOAD_RETRIES = 20

const NOTICE_COLOR = createColorFormat('#5fafff')
const NOTICE_ERROR_COLOR = createColorFormat('#ff6347')

/**
 * A client message about plugins, tagged so it does not read as game text.
 * The text is appended as is, so a plugin name or error cannot inject colour tags.
 */
export function pluginNotice(text: string, error = false): AnsiAwareBuffer {
  return colorString('[ PLUGIN ] ', error ? NOTICE_ERROR_COLOR : NOTICE_COLOR).append(text)
}

/**
 * Manages external plugins and scripts
 */
export class PluginManager {
  private plugins: Map<string, LoadedPlugin> = new Map()
  private client: Client
  /** Rebuild streams of plugins served from localhost, by plugin URL. */
  private liveReloads: Map<string, EventSource> = new Map()
  private liveReloading: Set<string> = new Set()
  private liveReloadPending: Set<string> = new Set()

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
          const stableId = this.claimStableId(module, identifier)
          plugin.stableId = stableId
          const apiInstance = new PluginApiImpl(this.client, identifier, { stableId })
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
    // Watched even when init failed: the fix arrives as the next rebuild.
    this.watchDevServer(identifier)
    return plugin
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(url: string, reloading = false): Promise<void> {
    const plugin = this.plugins.get(url)
    if (!plugin) {
      console.warn(`[PluginManager] Plugin not found: ${url}`)
      return
    }

    if (!reloading) {
      this.liveReloads.get(url)?.close()
      this.liveReloads.delete(url)
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
  /**
   * The plugin's declared `stableId`, when it is well formed and no other
   * loaded plugin uses it - two plugins sharing one would share saved state
   * and windows. Otherwise undefined: the plugin's state stays under its URL.
   */
  private claimStableId(module: Plugin, identifier: string): string | undefined {
    const id = module.stableId
    if (id === undefined) return undefined
    if (typeof id !== 'string' || !STABLE_ID_PATTERN.test(id)) {
      console.warn(`[PluginManager] Ignoring stableId of ${identifier}: use 1-64 letters, digits, '.', '_' or '-'`)
      return undefined
    }
    for (const [url, other] of this.plugins) {
      if (url !== identifier && other.stableId === id) {
        console.warn(`[PluginManager] stableId "${id}" of ${identifier} is already used by ${url}; keeping state under the URL`)
        return undefined
      }
    }
    return id
  }

  private isPlugin(module: any): module is Plugin {
    return (
      module &&
      typeof module === 'object' &&
      typeof module.init === 'function'
    )
  }

  /**
   * Reload one plugin in place: destroy it, then load it again from its URL
   * (cache-busted) or its stored code. Works for a plugin that failed to load,
   * too. A legacy script is re-injected, but whatever globals it set up before
   * stay behind - it has no destroy to undo them.
   */
  async reloadPlugin(identifier: string): Promise<LoadedPlugin> {
    if (this.plugins.has(identifier)) {
      await this.unloadPlugin(identifier, true)
    }
    return this.loadPlugin(identifier)
  }

  /**
   * A plugin served from localhost is reloaded whenever its dev server says it
   * rebuilt. The stream is esbuild's live-reload endpoint (`/esbuild`, `change`
   * events), which both `esbuild --serve` and `arkadia-plugin dev` provide.
   * A stream that never connects (no dev server, or one without the endpoint)
   * is dropped at once; one that did connect gets a minute to come back, so a
   * restarted dev server is picked up again. Either way the next load retries.
   */
  private watchDevServer(url: string): void {
    if (this.liveReloads.has(url) || typeof EventSource === 'undefined') return
    let endpoint: URL
    try {
      endpoint = new URL('/esbuild', url)
    } catch {
      return
    }
    if (!LOCAL_HOSTS.has(endpoint.hostname)) return

    const source = new EventSource(endpoint)
    let opened = false
    let failures = 0
    source.addEventListener('open', () => {
      opened = true
      failures = 0
    })
    source.addEventListener('error', () => {
      if (opened && source.readyState !== EventSource.CLOSED && ++failures <= LIVE_RELOAD_RETRIES) return
      source.close()
      if (this.liveReloads.get(url) === source) this.liveReloads.delete(url)
    })
    source.addEventListener('change', () => void this.liveReload(url))
    this.liveReloads.set(url, source)
  }

  /** One reload at a time per plugin; a rebuild during it queues one more. */
  private async liveReload(url: string): Promise<void> {
    if (!this.plugins.has(url)) return
    if (this.liveReloading.has(url)) {
      this.liveReloadPending.add(url)
      return
    }
    this.liveReloading.add(url)
    try {
      const reloaded = await this.reloadPlugin(url)
      const name = reloaded.info?.name ?? url
      this.client.print?.(reloaded.status === 'error'
        ? pluginNotice(`Blad przeladowania ${name}: ${reloaded.error}`, true)
        : pluginNotice(`Przeladowano ${name}.`))
    } finally {
      this.liveReloading.delete(url)
      if (this.liveReloadPending.delete(url)) void this.liveReload(url)
    }
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
