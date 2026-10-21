/**
 * Linking a plugin to a folder on disk (File System Access API, Chromium
 * only), so it can be edited in any IDE without the dev-server plugin.
 *
 * The folder mirrors the plugin's files. A watcher polls it and reports
 * files the IDE wrote or removed; saving in the browser writes the plugin
 * back into the folder. Folder handles are kept per plugin in IndexedDB, so
 * the link survives a reload; the browser may then ask for access again.
 */

import type { PluginFile } from '@client/utils/pluginEditorStorage'

// Not in TypeScript's DOM lib yet.
interface PermissionedHandle {
  queryPermission(descriptor: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission(descriptor: { mode: 'readwrite' }): Promise<PermissionState>
}
interface IterableDirectory {
  values(): AsyncIterable<FileSystemDirectoryHandle | FileSystemFileHandle>
}
type DirectoryPicker = (options: { id?: string; mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle>

const DB_NAME = 'ArkadiaPluginEditorFolders'
const STORE = 'links'

/** Folders that are never plugin sources. Dot-folders (.git, .idea, …) are skipped too. */
const SKIPPED_FOLDERS = new Set(['node_modules', 'dist', 'build', 'out'])
const MIRRORED_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt|css|html)$/i
const SKIPPED_FILES = new Set(['package-lock.json'])
const MAX_FILE_SIZE = 1024 * 1024

export function isFolderLinkSupported(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
}

/** Let the user pick a folder. Resolves null when they cancelled. */
export async function pickFolder(): Promise<FileSystemDirectoryHandle | null> {
  const picker = (window as unknown as { showDirectoryPicker: DirectoryPicker }).showDirectoryPicker
  try {
    return await picker({ id: 'arkadia-plugin', mode: 'readwrite' })
  } catch (error) {
    if ((error as DOMException).name === 'AbortError') return null
    throw error
  }
}

/**
 * Whether the page may read and write the folder. Asking (`request`) shows
 * the browser's prompt and needs a click to have just happened.
 */
export async function hasFolderAccess(handle: FileSystemDirectoryHandle, request = false): Promise<boolean> {
  const permissioned = handle as unknown as PermissionedHandle
  if (await permissioned.queryPermission({ mode: 'readwrite' }) === 'granted') return true
  if (!request) return false
  return await permissioned.requestPermission({ mode: 'readwrite' }) === 'granted'
}

function openLinkDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function linkStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openLinkDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result as T)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

export async function getFolderLink(pluginId: string): Promise<FileSystemDirectoryHandle | null> {
  return (await linkStore<FileSystemDirectoryHandle | undefined>('readonly', store => store.get(pluginId))) ?? null
}

export function storeFolderLink(pluginId: string, handle: FileSystemDirectoryHandle): Promise<void> {
  return linkStore('readwrite', store => store.put(handle, pluginId))
}

export function removeFolderLink(pluginId: string): Promise<void> {
  return linkStore('readwrite', store => store.delete(pluginId))
}

/** A mirrored file in the folder; `stamp` changes whenever the file does. */
interface FolderFile {
  stamp: string
  file: File
}

/** Every mirrored file in the folder, by plugin path ("utils/math.ts"). */
export async function scanFolder(root: FileSystemDirectoryHandle): Promise<Map<string, FolderFile>> {
  const found = new Map<string, FolderFile>()
  const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
    for await (const entry of (dir as unknown as IterableDirectory).values()) {
      if (entry.name.startsWith('.')) continue
      if (entry.kind === 'directory') {
        if (!SKIPPED_FOLDERS.has(entry.name)) await walk(entry as FileSystemDirectoryHandle, `${prefix}${entry.name}/`)
        continue
      }
      if (!MIRRORED_FILE.test(entry.name) || SKIPPED_FILES.has(entry.name)) continue
      const file = await (entry as FileSystemFileHandle).getFile()
      if (file.size > MAX_FILE_SIZE) continue
      found.set(`${prefix}${entry.name}`, { stamp: `${file.lastModified}:${file.size}`, file })
    }
  }
  await walk(root, '')
  return found
}

/** Folder paths holding the given files ("a/b/c.ts" → "a", "a/b"). */
export function foldersOf(paths: Iterable<string>): string[] {
  const folders = new Set<string>()
  for (const path of paths) {
    const parts = path.split('/')
    for (let i = 1; i < parts.length; i++) folders.add(parts.slice(0, i).join('/'))
  }
  return [...folders].sort()
}

async function fileHandleAt(root: FileSystemDirectoryHandle, path: string, create: boolean): Promise<FileSystemFileHandle> {
  const parts = path.split('/')
  let dir = root
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create })
  return dir.getFileHandle(parts[parts.length - 1], { create })
}

async function removeFile(root: FileSystemDirectoryHandle, path: string) {
  const parts = path.split('/')
  let dir = root
  for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part)
  await dir.removeEntry(parts[parts.length - 1])
}

/** What the IDE did to the folder since the last look. */
export interface FolderChanges {
  /** Added or rewritten files, with their new text. */
  changed: { path: string; content: string }[]
  removed: string[]
}

/**
 * Watches the folder linked to one plugin. Polls it, reports what changed,
 * and writes the plugin into it; both run one at a time, so the watcher
 * never mistakes its own writes for the IDE's.
 */
export class FolderWatcher {
  private stamps = new Map<string, string>()
  /** Files seen missing once. An IDE's save-by-rename can hide a file for a moment. */
  private missingOnce = new Set<string>()
  private timer: number | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private stopped = false

  constructor(
    readonly pluginId: string,
    readonly folder: FileSystemDirectoryHandle,
    private onChanges: (changes: FolderChanges) => Promise<void>,
    private onError: (error: unknown) => void,
    private intervalMs = 1000,
  ) {}

  get folderName(): string {
    return this.folder.name
  }

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task)
    this.queue = run.catch(() => {})
    return run
  }

  /**
   * Bring the folder and the stored plugin together, then poll the folder.
   * Folder files written after the plugin was last saved (`savedAt`) are
   * taken in through `onChanges`; everything else is written from the
   * plugin. A `savedAt` of 0 takes every differing folder file, Infinity
   * none.
   */
  async start(files: Record<string, PluginFile>, savedAt: number): Promise<void> {
    await this.exclusive(async () => {
      const scanned = await scanFolder(this.folder)
      const changed: FolderChanges['changed'] = []
      for (const [path, entry] of scanned) {
        if (entry.file.lastModified <= savedAt) continue
        const content = await entry.file.text()
        if (files[path]?.content !== content) changed.push({ path, content })
      }
      if (changed.length) await this.onChanges({ changed, removed: [] })

      const merged: Record<string, PluginFile> = { ...files }
      for (const { path, content } of changed) merged[path] = { path, content, language: files[path]?.language ?? 'plaintext' }
      await this.write(merged, scanned)
    })
    if (this.stopped) return
    this.timer = window.setInterval(() => { void this.poll() }, this.intervalMs)
  }

  stop() {
    this.stopped = true
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
  }

  /** Look at the folder now. Exposed so a returning focus can check at once. */
  poll(): Promise<void> {
    return this.exclusive(async () => {
      if (this.stopped) return
      let scanned: Map<string, FolderFile>
      try {
        scanned = await scanFolder(this.folder)
      } catch (error) {
        this.stop()
        this.onError(error)
        return
      }

      const changed: FolderChanges['changed'] = []
      for (const [path, entry] of scanned) {
        this.missingOnce.delete(path)
        if (this.stamps.get(path) === entry.stamp) continue
        changed.push({ path, content: await entry.file.text() })
        this.stamps.set(path, entry.stamp)
      }
      const removed: string[] = []
      for (const path of [...this.stamps.keys()]) {
        if (scanned.has(path)) continue
        if (this.missingOnce.delete(path)) {
          this.stamps.delete(path)
          removed.push(path)
        } else {
          this.missingOnce.add(path)
        }
      }

      if (changed.length || removed.length) await this.onChanges({ changed, removed })
    })
  }

  /**
   * Make the folder hold exactly these files: write the ones whose text
   * differs and remove mirrored files the plugin no longer has. Files the
   * watcher ignores (node_modules, dot-folders, …) are left alone.
   */
  writePlugin(files: Record<string, PluginFile>): Promise<void> {
    return this.exclusive(async () => this.write(files, await scanFolder(this.folder)))
  }

  private async write(files: Record<string, PluginFile>, existing: Map<string, FolderFile>) {
    for (const [path, file] of Object.entries(files)) {
      const current = existing.get(path)
      if (current && await current.file.text() === file.content) continue
      const handle = await fileHandleAt(this.folder, path, true)
      const writable = await handle.createWritable()
      await writable.write(file.content)
      await writable.close()
    }
    for (const path of existing.keys()) {
      if (!(path in files)) await removeFile(this.folder, path)
    }
    this.stamps = stampsOf(await scanFolder(this.folder))
    this.missingOnce.clear()
  }
}

function stampsOf(scanned: Map<string, FolderFile>): Map<string, string> {
  return new Map([...scanned].map(([path, entry]) => [path, entry.stamp]))
}
