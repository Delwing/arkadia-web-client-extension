/**
 * The session-log database (`ArkadiaLogsDB`).
 *
 * Every record of every session lives in one object store, `records`, under the
 * key `[sessionId, seq]`. A session is therefore a key range: it is read with
 * one `getAll`, counted with one `count` and deleted with one `delete`, and
 * starting, importing or deleting a session never changes the schema.
 *
 * That is the point of the layout. The database it replaces
 * (`ArkadiaMessagesDB`, see `logsMigration.ts`) gave every session an object
 * store of its own, so each of those was a version upgrade — which waits for
 * every connection in every tab to close, and closes readers mid-read.
 *
 * Nothing in this module touches the DOM: the ZIP export worker uses it too.
 */

export const LOGS_DB_NAME = "ArkadiaLogsDB";
const LOGS_DB_VERSION = 1;
const RECORDS = "records";

/** A stored log record, as the logger writes it. */
export interface StoredLogEntry {
  text: string;
  type?: string;
  timestamp: number;
  /** On the first record after the character changed; see `sessionLogger`. */
  character?: string;
  /** On the first record after the output background changed. */
  background?: string;
}

/**
 * Every key of one session. Arrays sort element by element and a shorter one
 * first, and any array sorts after any number, so `[id]` .. `[id, []]` holds
 * exactly the `[id, seq]` keys.
 */
function sessionRange(id: string): IDBKeyRange {
  return IDBKeyRange.bound([id], [id, []]);
}

/**
 * Close `db` when another connection deletes the database (or a later build
 * upgrades it), and report it, so the owner drops its reference and reopens.
 */
export function releaseOnUpgrade(db: IDBDatabase, onReleased: () => void): void {
  db.onversionchange = () => {
    db.close();
    onReleased();
  };
  // Closed by the browser rather than by us (storage cleared, disk error).
  db.onclose = onReleased;
}

/** Opens the database, creating it on first use; null if it cannot be opened. */
export function openLogsDb(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      const request = indexedDB.open(LOGS_DB_NAME, LOGS_DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(RECORDS)) {
          request.result.createObjectStore(RECORDS);
        }
      };
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

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Appends one record to a session. */
export function addLogRecord(db: IDBDatabase, sessionId: string, seq: number, entry: StoredLogEntry): Promise<void> {
  const tx = db.transaction(RECORDS, "readwrite");
  tx.objectStore(RECORDS).add(entry, [sessionId, seq]);
  return done(tx);
}

/** One session's records, in the order they were written. */
export function readSession(db: IDBDatabase, sessionId: string): Promise<StoredLogEntry[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(RECORDS, "readonly").objectStore(RECORDS).getAll(sessionRange(sessionId));
    request.onsuccess = () => resolve(request.result as StoredLogEntry[]);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Record count of every session, in one transaction. Walks the keys, jumping
 * from each session straight past its last record, so it costs one step per
 * session rather than one per record.
 */
export function countSessions(db: IDBDatabase): Promise<Map<string, number>> {
  return new Promise((resolve, reject) => {
    const counts = new Map<string, number>();
    const tx = db.transaction(RECORDS, "readonly");
    const store = tx.objectStore(RECORDS);
    const cursorRequest = store.openKeyCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      const id = (cursor.key as [string, number])[0];
      const countRequest = store.count(sessionRange(id));
      countRequest.onsuccess = () => {
        counts.set(id, countRequest.result);
      };
      cursor.continue([id, []]);
    };
    tx.oncomplete = () => resolve(counts);
    tx.onabort = () => reject(tx.error);
  });
}

/** Record count of one session; 0 when there is no such session. */
export function countSession(db: IDBDatabase, sessionId: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(RECORDS, "readonly").objectStore(RECORDS).count(sessionRange(sessionId));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Writes a whole session (an import, or one moved over from the old database). */
export function writeSession(
  db: IDBDatabase,
  sessionId: string,
  records: { seq: number; entry: StoredLogEntry }[],
): Promise<void> {
  const tx = db.transaction(RECORDS, "readwrite");
  const store = tx.objectStore(RECORDS);
  for (const { seq, entry } of records) store.put(entry, [sessionId, seq]);
  return done(tx);
}

/**
 * The first (`next`) or last (`prev`) record of a session with its `seq`;
 * null when the session has none.
 */
export function edgeRecord(
  db: IDBDatabase,
  sessionId: string,
  direction: "next" | "prev",
): Promise<{ seq: number; entry: StoredLogEntry } | null> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(RECORDS, "readonly").objectStore(RECORDS).openCursor(sessionRange(sessionId), direction);
    request.onsuccess = () => {
      const cursor = request.result;
      resolve(cursor ? { seq: (cursor.key as [string, number])[1], entry: cursor.value as StoredLogEntry } : null);
    };
    request.onerror = () => reject(request.error);
  });
}

export function deleteSessions(db: IDBDatabase, sessionIds: string[]): Promise<void> {
  const tx = db.transaction(RECORDS, "readwrite");
  const store = tx.objectStore(RECORDS);
  for (const id of sessionIds) store.delete(sessionRange(id));
  return done(tx);
}

/**
 * A reader's connection (the Logi browser, the standalone log viewer): opened
 * on first use, let go of if the database is deleted, reopened on the next.
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
