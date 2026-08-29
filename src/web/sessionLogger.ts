import {eventNow} from '@shared/eventClock';
import { globalStorage } from "@modules/core/storage";
import {AnsiAwareBuffer} from "@client/ansi/FormatState";
import eventBus from "@modules/core/eventBus";
import type { CombatEntry } from "@client/scripts/combatWindow";

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
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ArkadiaMessagesDB');
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { autoIncrement: true });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(storeName)) {
        resolve(db);
      } else {
        const newVersion = db.version + 1;
        db.close();
        const upgradeRequest = indexedDB.open('ArkadiaMessagesDB', newVersion);
        upgradeRequest.onupgradeneeded = () => {
          upgradeRequest.result.createObjectStore(storeName, { autoIncrement: true });
        };
        upgradeRequest.onsuccess = () => resolve(upgradeRequest.result);
        upgradeRequest.onerror = () => reject(upgradeRequest.error);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

async function save(db: IDBDatabase, text: string, type?: string, timestamp?: number) {
  try {
    const tx = db.transaction(storeName, 'readwrite');
    await new Promise<void>((resolve, reject) => {
      // Event time, not arrival: a stored log is a record of the game.
      const req = tx.objectStore(storeName).add({ text, type, timestamp: timestamp ?? eventNow() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Failed to log message', err);
  }
}

interface SessionClient {
  on(event: 'message', handler: (text?: string | AnsiAwareBuffer, type?: string, timestamp?: number) => void): void;
}

export default async function initSessionLogger(client: SessionClient) {
  let db: IDBDatabase | null = null;
  let closeTimeout: number | null = null;

  async function ensureDb(): Promise<IDBDatabase | null> {
    // Clear any pending close timeout
    if (closeTimeout !== null) {
      clearTimeout(closeTimeout);
      closeTimeout = null;
    }

    // If db is already open, return it
    if (db) {
      return db;
    }

    // Open the database
    try {
      db = await openOrCreateStore(storeName);
      return db;
    } catch (err) {
      console.error('Failed to open log database', err);
      return null;
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

      const currentDb = await ensureDb();
      if (currentDb) {
        await save(currentDb, htmlText.replace(CLICK_TAG_REG, ''), type, timestamp);
        scheduleClose();
      }
    }
  });

  // Also log combat messages that are redirected to the combat window
  // These messages are marked as deleted so they don't appear in main output,
  // but we still want them in the session logs
  eventBus.on('combat.newMessage', async (entry: CombatEntry) => {
    if (!loggingEnabled) return;
    if (entry.type === 'separator') return;
    const htmlText = entry.buffer.toHtml();
    const currentDb = await ensureDb();
    if (currentDb) {
      await save(currentDb, htmlText.replace(CLICK_TAG_REG, ''), entry.type);
      scheduleClose();
    }
  });
}
