import {eventNow} from '@shared/eventClock';
import { globalStorage } from "@modules/core/storage";
import {AnsiAwareBuffer} from "@client/ansi/FormatState";
import eventBus from "@modules/core/eventBus";
import type { CombatEntry } from "@client/scripts/combatWindow";
import { openLogsDb, releaseOnUpgrade, upgradeLogsDb } from "./logsDatabase";

const sessionId = Date.now();
const storeName = `session_${sessionId}`;
export { storeName as currentSessionName };
const CLICK_TAG_REG = /\{clickOpen:\d+(?::[^}]+)?}|\{clickClose}/g;

function clearDownloadedFlag() {
  const req = indexedDB.open("ArkadiaLogsMetaDB");
  req.onsuccess = () => {
    const db = req.result;
    if (db.objectStoreNames.contains("downloaded")) {
      const tx = db.transaction("downloaded", "readwrite");
      tx.objectStore("downloaded").delete(storeName);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    } else {
      db.close();
    }
  };
}

let loggingEnabled = true;
const savedLogging = globalStorage.get("loggingEnabled");
if (typeof savedLogging === "boolean") {
  loggingEnabled = savedLogging;
}

globalStorage.onChange('loggingEnabled', (newValue) => {
  loggingEnabled = !!newValue;
});

async function openOrCreateStore(storeName: string): Promise<IDBDatabase> {
  const existing = await openLogsDb();
  if (existing?.objectStoreNames.contains(storeName)) return existing;
  existing?.close();
  return upgradeLogsDb(db => {
    if (!db.objectStoreNames.contains(storeName)) {
      db.createObjectStore(storeName, { autoIncrement: true });
    }
  });
}

/** False when the connection was closed under us (released for an upgrade), so the caller reopens and retries. */
async function save(db: IDBDatabase, text: string, type?: string, timestamp?: number): Promise<boolean> {
  try {
    const tx = db.transaction(storeName, 'readwrite');
    await new Promise<void>((resolve, reject) => {
      // Event time, not arrival: a stored log is a record of the game.
      const req = tx.objectStore(storeName).add({ text, type, timestamp: timestamp ?? eventNow() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'InvalidStateError') return false;
    console.error('Failed to log message', err);
  }
  return true;
}

interface SessionClient {
  on(event: 'message', handler: (text?: string | AnsiAwareBuffer, type?: string, timestamp?: number) => void): void;
}

export default async function initSessionLogger(client: SessionClient) {
  let db: IDBDatabase | null = null;
  let opening: Promise<IDBDatabase | null> | null = null;
  let closeTimeout: number | null = null;

  function ensureDb(): Promise<IDBDatabase | null> {
    // Clear any pending close timeout
    if (closeTimeout !== null) {
      clearTimeout(closeTimeout);
      closeTimeout = null;
    }

    // If db is already open, return it
    if (db) {
      return Promise.resolve(db);
    }

    // Lines arrive in bursts; they must share one open, or every line but the
    // last leaks a connection that then blocks other tabs' upgrades for good.
    opening ??= openOrCreateStore(storeName)
      .then(opened => {
        db = opened;
        releaseOnUpgrade(opened, () => {
          if (db === opened) db = null;
        });
        return opened;
      })
      .catch(err => {
        console.error('Failed to open log database', err);
        return null;
      })
      .finally(() => {
        opening = null;
      });
    return opening;
  }

  async function write(text: string, type?: string, timestamp?: number) {
    // A second attempt covers the connection being released for another
    // tab's upgrade between opening it and writing.
    for (let attempt = 0; attempt < 2; attempt++) {
      const currentDb = await ensureDb();
      if (!currentDb) return;
      if (await save(currentDb, text, type, timestamp)) {
        scheduleClose();
        return;
      }
    }
  }

  function scheduleClose() {
    // Close the database after 1 second of inactivity to allow other tabs to read
    if (closeTimeout !== null) {
      clearTimeout(closeTimeout);
    }
    closeTimeout = window.setTimeout(() => {
      if (db) {
        db.close();
        db = null;
      }
      closeTimeout = null;
      clearDownloadedFlag();
    }, 1000);
  }

  client.on('message', async (text?: string | AnsiAwareBuffer, type?: string, timestamp?: number) => {
    if (!loggingEnabled) return;
    if (text) {
      // Convert AnsiAwareBuffer to HTML to preserve colors, or use string as-is
      let htmlText: string;
      if (text instanceof AnsiAwareBuffer) {
        htmlText = text.toHtml();
      } else {
        htmlText = text;
      }

      if (htmlText === "\n") {
        htmlText = "";
      }

      await write(htmlText.replace(CLICK_TAG_REG, ''), type, timestamp);
    }
  });

  // Also log combat messages that are redirected to the combat window
  // These messages are marked as deleted so they don't appear in main output,
  // but we still want them in the session logs
  eventBus.on('combat.newMessage', async (entry: CombatEntry) => {
    if (!loggingEnabled) return;
    if (entry.type === 'separator') return;
    const htmlText = entry.buffer.toHtml();
    await write(htmlText.replace(CLICK_TAG_REG, ''), entry.type);
  });
}
