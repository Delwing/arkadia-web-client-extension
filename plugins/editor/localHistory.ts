/**
 * Local history: earlier saved versions of each plugin file, kept in
 * IndexedDB so they outlive the page. A save records every file whose text
 * changed since its last version; old versions go by count and by age (see
 * the settings popover). The compare view lists them.
 */

export interface HistoryVersion {
  id?: number
  pluginId: string
  path: string
  content: string
  /** When it was saved (ms since epoch). */
  time: number
}

export interface HistoryLimits {
  /** Versions kept per file; 0 records none. */
  maxVersions: number
  /** Versions older than this many days are dropped. */
  maxDays: number
}

const DB_NAME = 'ArkadiaPluginEditorHistory'
const STORE = 'versions'
const DAY = 24 * 60 * 60 * 1000

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
      store.createIndex('byFile', ['pluginId', 'path'])
      store.createIndex('byPlugin', 'pluginId')
      store.createIndex('byTime', 'time')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Run `work` in one transaction; resolves with its result once committed. */
async function inStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, mode)
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    const result = await work(tx.objectStore(STORE))
    await done
    return result
  } finally {
    db.close()
  }
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Walk a cursor, calling `visit` for each record; `visit` returning false stops. */
function walk(req: IDBRequest<IDBCursorWithValue | null>, visit: (cursor: IDBCursorWithValue) => boolean | void): Promise<void> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor || visit(cursor) === false) {
        resolve()
        return
      }
      cursor.continue()
    }
    req.onerror = () => reject(req.error)
  })
}

const fileRange = (pluginId: string, path: string) => IDBKeyRange.only([pluginId, path])

/**
 * Record the files whose text differs from their latest version, then drop
 * versions past the limits. Resolves with how many were recorded.
 */
export async function recordVersions(
  pluginId: string,
  files: Record<string, { content: string }>,
  limits: HistoryLimits,
  now = Date.now()
): Promise<number> {
  if (limits.maxVersions <= 0) return 0
  return inStore('readwrite', async (store) => {
    const byFile = store.index('byFile')
    let recorded = 0
    for (const [path, file] of Object.entries(files)) {
      let latest: HistoryVersion | undefined
      await walk(byFile.openCursor(fileRange(pluginId, path), 'prev'), (cursor) => {
        latest = cursor.value
        return false
      })
      if (latest?.content === file.content) continue
      await request(store.add({ pluginId, path, content: file.content, time: now }))
      recorded++

      // Newest first: keep maxVersions, delete the rest
      let kept = 0
      await walk(byFile.openCursor(fileRange(pluginId, path), 'prev'), (cursor) => {
        if (++kept > limits.maxVersions) cursor.delete()
      })
    }
    await dropOlderThan(store, now - limits.maxDays * DAY)
    return recorded
  })
}

async function dropOlderThan(store: IDBObjectStore, cutoff: number) {
  await walk(store.index('byTime').openCursor(IDBKeyRange.upperBound(cutoff, true)), (cursor) => {
    cursor.delete()
  })
}

/** A file's versions, newest first. */
export async function listVersions(pluginId: string, path: string): Promise<HistoryVersion[]> {
  return inStore('readonly', async (store) => {
    const versions: HistoryVersion[] = []
    await walk(store.index('byFile').openCursor(fileRange(pluginId, path), 'prev'), (cursor) => {
      versions.push(cursor.value)
    })
    return versions
  })
}

/** Drop versions past the limits, for every plugin (run at startup and when they change). */
export async function pruneHistory(limits: HistoryLimits, now = Date.now()): Promise<void> {
  await inStore('readwrite', async (store) => {
    await dropOlderThan(store, now - limits.maxDays * DAY)
    // Count per file, newest first
    const seen = new Map<string, number>()
    await walk(store.openCursor(null, 'prev'), (cursor) => {
      const { pluginId, path } = cursor.value as HistoryVersion
      const key = `${pluginId}\n${path}`
      const count = (seen.get(key) ?? 0) + 1
      seen.set(key, count)
      if (count > limits.maxVersions) cursor.delete()
    })
  })
}

/** A plugin was deleted: so is its history. */
export async function deletePluginHistory(pluginId: string): Promise<void> {
  await inStore('readwrite', (store) =>
    walk(store.index('byPlugin').openCursor(IDBKeyRange.only(pluginId)), (cursor) => {
      cursor.delete()
    })
  )
}

/** A file was renamed or moved: its history follows it. */
export async function moveFileHistory(pluginId: string, oldPath: string, newPath: string): Promise<void> {
  if (oldPath === newPath) return
  await inStore('readwrite', (store) =>
    walk(store.index('byFile').openCursor(fileRange(pluginId, oldPath)), (cursor) => {
      cursor.update({ ...cursor.value, path: newPath })
    })
  )
}
