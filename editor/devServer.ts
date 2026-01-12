/**
 * Dev Server WebSocket Client
 *
 * Connects to a local WebSocket server (e.g., from WebStorm plugin)
 * to enable live editing of plugins from an external IDE.
 *
 * Protocol:
 *
 * Server -> Client:
 *   { type: "file-update", pluginId: string, files: Array<{ path: string, content: string }> }
 *   { type: "full-sync", pluginId: string, name: string, entryPoint: string, files: Record<string, { path, content, language }>, folders?: string[] }
 *   { type: "reload-plugin", pluginId: string }
 *   { type: "connected", version: string }
 *   { type: "plugin-selected", pluginId: string }
 *   { type: "file-focused", filePath: string }
 *
 * Client -> Server:
 *   { type: "plugin-list", plugins: Array<{ id: string, name: string }> }
 *   { type: "plugin-data", pluginId: string, data: EditorPluginData }
 *   { type: "request-plugin", pluginId: string }
 *   { type: "plugin-selected", pluginId: string }
 */

import type { EditorPluginData, PluginFile } from '@client/utils/pluginEditorStorage'
import {
  storeEditorPlugin,
  getEditorPlugin,
  getAllEditorPlugins,
  getLanguageFromPath,
  generateEditorPluginId,
} from '@client/utils/pluginEditorStorage'
import {
  storePluginScript,
  updatePluginScript,
} from '@client/utils/pluginStorage'
import { updateLocalStorageList } from './pluginManagement'

export type DevServerStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface DevServerConfig {
  host: string
  port: number
  autoReconnect: boolean
  reconnectInterval: number
}

export interface FileUpdate {
  path: string
  content: string
}

export interface DevServerMessage {
  type: string
  pluginId?: string
  name?: string
  entryPoint?: string
  files?: Record<string, { path: string; content: string; language?: string }> | FileUpdate[]
  folders?: string[]
  version?: string
}

type StatusChangeCallback = (status: DevServerStatus, message?: string) => void
type PluginUpdateCallback = (pluginId: string, plugin: EditorPluginData) => void
type ReloadRequestCallback = (pluginId: string) => void
type PluginSelectedCallback = (pluginId: string) => void
type FileFocusedCallback = (filePath: string) => void

const DEFAULT_CONFIG: DevServerConfig = {
  host: 'localhost',
  port: 9877,
  autoReconnect: true,
  reconnectInterval: 3000,
}

export class DevServerClient {
  private ws: WebSocket | null = null
  private config: DevServerConfig
  private status: DevServerStatus = 'disconnected'
  private reconnectTimeout: number | null = null
  private manualDisconnect = false

  private onStatusChange: StatusChangeCallback | null = null
  private onPluginUpdate: PluginUpdateCallback | null = null
  private onReloadRequest: ReloadRequestCallback | null = null
  private onPluginSelectedFromIDE: PluginSelectedCallback | null = null
  private onFileFocusedFromIDE: FileFocusedCallback | null = null

  // Bundler function to compile TypeScript
  private bundlePlugin: ((files: Record<string, PluginFile>, entryPoint: string) => Promise<string>) | null = null

  // Current plugin ID (set by editor when plugin is loaded)
  private currentPluginId: string | null = null

  constructor(config: Partial<DevServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.loadConfig()
  }

  private loadConfig() {
    const saved = localStorage.getItem('devServerConfig')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        this.config = { ...this.config, ...parsed }
      } catch {
        // Ignore parse errors
      }
    }
  }

  saveConfig() {
    localStorage.setItem('devServerConfig', JSON.stringify({
      host: this.config.host,
      port: this.config.port,
      autoReconnect: this.config.autoReconnect,
    }))
  }

  setConfig(config: Partial<DevServerConfig>) {
    this.config = { ...this.config, ...config }
    this.saveConfig()
  }

  getConfig(): DevServerConfig {
    return { ...this.config }
  }

  setBundlePlugin(bundler: (files: Record<string, PluginFile>, entryPoint: string) => Promise<string>) {
    this.bundlePlugin = bundler
  }

  setOnStatusChange(callback: StatusChangeCallback) {
    this.onStatusChange = callback
  }

  setOnPluginUpdate(callback: PluginUpdateCallback) {
    this.onPluginUpdate = callback
  }

  setOnReloadRequest(callback: ReloadRequestCallback) {
    this.onReloadRequest = callback
  }

  setOnPluginSelectedFromIDE(callback: PluginSelectedCallback) {
    this.onPluginSelectedFromIDE = callback
  }

  setOnFileFocusedFromIDE(callback: FileFocusedCallback) {
    this.onFileFocusedFromIDE = callback
  }

  setCurrentPluginId(pluginId: string | null) {
    this.currentPluginId = pluginId
  }

  private setStatus(status: DevServerStatus, message?: string) {
    this.status = status
    this.onStatusChange?.(status, message)
  }

  getStatus(): DevServerStatus {
    return this.status
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return
    }

    this.manualDisconnect = false
    this.setStatus('connecting')

    const url = `ws://${this.config.host}:${this.config.port}`

    try {
      this.ws = new WebSocket(url)
    } catch (error) {
      this.setStatus('error', `Failed to create WebSocket: ${error}`)
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.setStatus('connected', `Connected to ${url}`)
      this.sendPluginList()

      // Send current plugin selection if one is open
      if (this.currentPluginId) {
        this.sendPluginSelected(this.currentPluginId)
      }
    }

    this.ws.onclose = (event) => {
      this.ws = null
      if (!this.manualDisconnect) {
        this.setStatus('disconnected', `Connection closed: ${event.reason || 'Unknown reason'}`)
        this.scheduleReconnect()
      } else {
        this.setStatus('disconnected', 'Disconnected')
      }
    }

    this.ws.onerror = () => {
      this.setStatus('error', `WebSocket error`)
    }

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data)
    }
  }

  disconnect() {
    this.manualDisconnect = true
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.setStatus('disconnected', 'Disconnected')
  }

  private scheduleReconnect() {
    if (!this.config.autoReconnect || this.manualDisconnect) {
      return
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }

    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectTimeout = null
      this.connect()
    }, this.config.reconnectInterval)
  }

  private async handleMessage(data: string) {
    let message: DevServerMessage
    try {
      message = JSON.parse(data)
    } catch {
      console.error('[DevServer] Failed to parse message:', data)
      return
    }

    switch (message.type) {
      case 'connected':
        console.log('[DevServer] Server version:', message.version)
        break

      case 'file-update':
        await this.handleFileUpdate(message)
        break

      case 'full-sync':
        await this.handleFullSync(message)
        break

      case 'reload-plugin':
        if (message.pluginId) {
          this.onReloadRequest?.(message.pluginId)
        }
        break

      case 'request-plugin':
        if (message.pluginId) {
          await this.sendPluginData(message.pluginId)
        }
        break

      case 'get-plugin-list':
        await this.sendPluginList()
        break

      case 'plugin-selected':
        if (message.pluginId) {
          console.log('[DevServer] IDE selected plugin:', message.pluginId)
          this.onPluginSelectedFromIDE?.(message.pluginId)
        }
        break

      case 'file-focused':
        if ((message as { filePath?: string }).filePath) {
          const filePath = (message as { filePath: string }).filePath
          console.log('[DevServer] IDE focused file:', filePath)
          this.onFileFocusedFromIDE?.(filePath)
        }
        break

      default:
        console.log('[DevServer] Unknown message type:', message.type)
    }
  }

  private async handleFileUpdate(message: DevServerMessage) {
    if (!message.pluginId || !message.files) {
      console.error('[DevServer] Invalid file-update message')
      return
    }

    const plugin = await getEditorPlugin(message.pluginId)
    if (!plugin) {
      console.error('[DevServer] Plugin not found:', message.pluginId)
      return
    }

    // Update files
    const fileUpdates = Array.isArray(message.files) ? message.files : Object.values(message.files)
    for (const file of fileUpdates) {
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

    // Recompile if bundler is available
    if (this.bundlePlugin) {
      try {
        plugin.compiled = await this.bundlePlugin(plugin.files, plugin.entryPoint)
        plugin.lastCompiledAt = Date.now()

        // Update plugin storage with compiled code
        await updatePluginScript(plugin.id, plugin.compiled, plugin.metadata)
      } catch (error) {
        console.error('[DevServer] Failed to compile plugin:', error)
      }
    }

    // Store updated plugin
    await storeEditorPlugin(plugin)

    // Notify callback
    this.onPluginUpdate?.(message.pluginId, plugin)
  }

  private async handleFullSync(message: DevServerMessage) {
    if (!message.pluginId || !message.files || !message.entryPoint) {
      console.error('[DevServer] Invalid full-sync message')
      return
    }

    const existingPlugin = await getEditorPlugin(message.pluginId)
    const now = Date.now()

    // Convert files to proper format
    const files: Record<string, PluginFile> = {}
    for (const [path, file] of Object.entries(message.files)) {
      files[path] = {
        path: file.path || path,
        content: file.content,
        language: (file.language as PluginFile['language']) || getLanguageFromPath(path),
      }
    }

    let compiled = ''
    if (this.bundlePlugin) {
      try {
        compiled = await this.bundlePlugin(files, message.entryPoint)
      } catch (error) {
        console.error('[DevServer] Failed to compile plugin:', error)
      }
    }

    const plugin: EditorPluginData = {
      id: message.pluginId,
      name: message.name || existingPlugin?.name || 'Synced Plugin',
      compiled,
      files,
      folders: message.folders || [],
      entryPoint: message.entryPoint,
      metadata: existingPlugin?.metadata || {
        name: message.name || 'Synced Plugin',
        version: '1.0.0',
        author: 'Dev Server',
        description: 'Synced from IDE',
      },
      createdAt: existingPlugin?.createdAt || now,
      updatedAt: now,
      lastCompiledAt: compiled ? now : (existingPlugin?.lastCompiledAt || now),
    }

    // Store plugin
    await storeEditorPlugin(plugin)

    // Update plugin storage if compiled
    if (compiled) {
      if (existingPlugin) {
        await updatePluginScript(plugin.id, compiled, plugin.metadata)
      } else {
        await storePluginScript(plugin.id, compiled, plugin.metadata)
        updateLocalStorageList(plugin.id)
        localStorage.setItem('stored_scripts_updated', Date.now().toString())
      }
    }

    // Notify callback
    this.onPluginUpdate?.(message.pluginId, plugin)
  }

  private async sendPluginList() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    const plugins = await getAllEditorPlugins()
    const pluginList = plugins.map(p => ({
      id: p.id,
      name: p.name,
      entryPoint: p.entryPoint,
      fileCount: Object.keys(p.files).length,
    }))

    this.send({
      type: 'plugin-list',
      plugins: pluginList,
    })
  }

  private async sendPluginData(pluginId: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    const plugin = await getEditorPlugin(pluginId)
    if (!plugin) {
      this.send({
        type: 'error',
        message: `Plugin not found: ${pluginId}`,
      })
      return
    }

    this.send({
      type: 'plugin-data',
      pluginId: plugin.id,
      name: plugin.name,
      entryPoint: plugin.entryPoint,
      files: plugin.files,
      folders: plugin.folders,
    })
  }

  private send(data: object) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  /**
   * Notify IDE that a plugin was selected in the browser editor
   */
  sendPluginSelected(pluginId: string) {
    this.send({
      type: 'plugin-selected',
      pluginId,
    })
  }

  /**
   * Request to create a new plugin from IDE
   */
  async createPluginFromIDE(name: string, files: Record<string, { path: string; content: string }>, entryPoint: string): Promise<string> {
    const pluginId = generateEditorPluginId(name)

    await this.handleFullSync({
      type: 'full-sync',
      pluginId,
      name,
      entryPoint,
      files,
    })

    return pluginId
  }
}

// Singleton instance
let devServerInstance: DevServerClient | null = null

export function getDevServer(): DevServerClient {
  if (!devServerInstance) {
    devServerInstance = new DevServerClient()
  }
  return devServerInstance
}

export function initDevServer(config?: Partial<DevServerConfig>): DevServerClient {
  if (devServerInstance) {
    devServerInstance.disconnect()
  }
  devServerInstance = new DevServerClient(config)
  return devServerInstance
}
