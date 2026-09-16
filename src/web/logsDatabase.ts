/**
 * Connections to the session-log database (`ArkadiaMessagesDB`).
 *
 * Every session is its own object store, so creating one (a game tab starting
 * to log), deleting one or importing one is a version upgrade — and an upgrade
 * only starts once every other connection to the database, in every tab, has
 * closed. Worse, while it waits, every later open queues behind it. One tab
 * holding a connection for good therefore stalls logging and log reading in
 * all of them.
 *
 * So no connection here is held against an upgrade: each one closes itself the
 * moment another connection asks for one, and is reopened on its next use.
 */

const LOGS_DB_NAME = "ArkadiaMessagesDB";

/**
 * Close `db` as soon as any connection requests an upgrade, and report it, so
 * the owner drops its reference and reopens (seeing the new stores) next time.
 */
export function releaseOnUpgrade(db: IDBDatabase, onReleased: () => void): void {
  db.onversionchange = () => {
    db.close();
    onReleased();
  };
  // Closed by the browser rather than by us (storage cleared, disk error).
  db.onclose = onReleased;
}

/** Opens the database at whatever version it is; null if it cannot be opened. */
export function openLogsDb(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      const request = indexedDB.open(LOGS_DB_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.error("[Logs] Failed to open IndexedDB:", request.error);
        resolve(null);
      };
    } catch (error) {
      console.error("[Logs] Error opening IndexedDB:", error);
      resolve(null);
    }
  });
}

function openAtVersion(version: number, change: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOGS_DB_NAME, version);
    request.onupgradeneeded = () => change(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    // Only a connection that ignores `versionchange` can hold this up — a tab
    // still running a build from before this module. It resolves when that
    // tab closes its connection.
    request.onblocked = () => console.warn("[Logs] Waiting for another tab to release the logs database");
  });
}

/**
 * Applies a schema change (creating or deleting session stores) one version up.
 * Another tab may upgrade between reading the version and opening the next
 * one; that surfaces as a VersionError, so the version is read again.
 */
export async function upgradeLogsDb(change: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  for (let attempt = 0; ; attempt++) {
    const current = await openLogsDb();
    if (!current) throw new Error("Logs database is unavailable");
    const version = current.version;
    current.close();
    try {
      return await openAtVersion(version + 1, change);
    } catch (error) {
      if (attempt < 3 && error instanceof DOMException && error.name === "VersionError") continue;
      throw error;
    }
  }
}

/**
 * A reader's connection (the Logi browser, the standalone log viewer): opened
 * on first use, let go of whenever an upgrade needs it, reopened on the next.
 * Callers ask for it right before each use instead of keeping the handle.
 */
export class LogsDatabase {
  private db: IDBDatabase | null = null;
  private opening: Promise<IDBDatabase | null> | null = null;

  get(): Promise<IDBDatabase | null> {
    if (this.db) return Promise.resolve(this.db);
    this.opening ??= openLogsDb().then(db => {
      this.opening = null;
      if (db) this.adopt(db);
      return db;
    });
    return this.opening;
  }

  /** Runs a schema change and keeps the resulting connection. */
  async upgrade(change: (db: IDBDatabase) => void): Promise<IDBDatabase> {
    await this.opening;
    this.release();
    const db = await upgradeLogsDb(change);
    this.adopt(db);
    return db;
  }

  release(): void {
    const db = this.db;
    this.db = null;
    db?.close();
  }

  private adopt(db: IDBDatabase): void {
    this.db = db;
    releaseOnUpgrade(db, () => {
      if (this.db === db) this.db = null;
    });
  }
}
