import storage, { getItemSync } from "@modules/core/storage";
import {AnsiAwareBuffer} from "@client/ansi/FormatState";

const sessionId = Date.now();
const storeName = `session_${sessionId}`;
const CLICK_TAG_REG = /\{clickOpen:\d+(?::[^}]+)?}|\{clickClose}/g;

let loggingEnabled = true;
const saved = getItemSync("loggingEnabled");
if (saved && typeof saved.loggingEnabled === "boolean") {
  loggingEnabled = saved.loggingEnabled;
}

storage.onChanged?.addListener(changes => {
  if (changes.loggingEnabled) {
    loggingEnabled = !!changes.loggingEnabled.newValue;
  }
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
      const req = tx.objectStore(storeName).add({ text, type, timestamp: timestamp ?? Date.now() });
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
}
