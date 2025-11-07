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
  let db: IDBDatabase;
  try {
    db = await openOrCreateStore(storeName);
  } catch (err) {
    console.error('Failed to open log database', err);
    return;
  }

  client.on('message', (text?: string | AnsiAwareBuffer, type?: string, timestamp?: number) => {
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
      void save(db, htmlText.replace(CLICK_TAG_REG, ''), type, timestamp);
    }
  });
}
