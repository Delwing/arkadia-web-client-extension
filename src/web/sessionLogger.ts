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
/** Stamps a record carries only where they change; see `write`. */
interface RecordMarks {
  character?: string;
  background?: string;
}

/**
 * The main output window's background, as the player has it set. Recorded
 * with the log so Logi can show it on the ground it was read on.
 */
function currentOutputBackground(): string | undefined {
  if (typeof document === 'undefined' || !document.body) return undefined;
  return document.body.style.getPropertyValue('--output-bg').trim() || undefined;
}

async function save(db: IDBDatabase, text: string, type?: string, timestamp?: number, marks: RecordMarks = {}): Promise<boolean> {
  try {
    const tx = db.transaction(storeName, 'readwrite');
    await new Promise<void>((resolve, reject) => {
      // Event time, not arrival: a stored log is a record of the game.
      const record: { text: string; type?: string; timestamp: number } & RecordMarks =
        { text, type, timestamp: timestamp ?? eventNow() };
      // Present only on the record that starts a character's (or a
      // background's) stretch of the log, so the shape every other reader of
      // the store knows is unchanged.
      if (marks.character) record.character = marks.character;
      if (marks.background) record.background = marks.background;
      const req = tx.objectStore(storeName).add(record);
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
  /**
   * Who the log is of, from the moment the game says so.
   *
   * A log runs from page load to page close and a player can re-log in between,
   * so this moves - which is the whole reason the name is recorded at all. The
   * source is `PlayerIdentity`, not the raw GMCP frame: it already tells a new
   * life from a new body, and a przeobrazenie must not land in the log looking
   * like a relogin.
   *
   * The name is written onto the FIRST record after it changed and onto nothing
   * else. A record per switch is all the reader needs, no line of text is
   * invented for it, and every other consumer of the store sees the shape it
   * always saw.
   */
  let pendingCharacter: string | undefined;
  /** The output background the log last recorded; a change stamps the next record. */
  let recordedBackground: string | undefined;
  let opening: Promise<IDBDatabase | null> | null = null;
  let closeTimeout: number | null = null;

  eventBus.on('player.character', name => {
    if (name) pendingCharacter = name;
  });

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
    // Claimed before the first await: lines arrive in bursts and every one of
    // them waits on the same open, so a name read afterwards would land on
    // whichever of them happened to resume first.
    const character = pendingCharacter;
    pendingCharacter = undefined;
    const current = currentOutputBackground();
    const background = current !== recordedBackground ? current : undefined;
    if (background) recordedBackground = background;
    // A second attempt covers the connection being released for another
    // tab's upgrade between opening it and writing.
    for (let attempt = 0; attempt < 2; attempt++) {
      const currentDb = await ensureDb();
      if (currentDb && (await save(currentDb, text, type, timestamp, { character, background }))) {
        scheduleClose();
        return;
      }
      if (!currentDb) break;
    }
    // Nothing was stored, so the switch has not been recorded yet; hand the
    // name back, unless a newer one has taken its place in the meantime.
    if (character && !pendingCharacter) pendingCharacter = character;
    if (background && recordedBackground === background) recordedBackground = undefined;
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
