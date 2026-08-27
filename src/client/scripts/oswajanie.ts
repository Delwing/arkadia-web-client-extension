import Client from "../Client";
import {scheduleFromEvent} from "@shared/eventClock";
import { colorString, createColorFormat } from "@modules/core/Colors";
import { characterStorage } from "@modules/core/storage";
import eventBus from "@modules/core/eventBus";

// This module owns the Oswajanie data layer (IndexedDB), triggers and aliases.
// The UI is the React component in src/web/OswajaniePopup.tsx, which imports the
// exported data functions below and re-loads on the "oswajanie.updated" event.

// ============================================================================
// Types
// ============================================================================

export interface FeedingEntry {
  id?: number;
  /** Owning character (per-character scoping). */
  character: string;
  animal: string;
  food: string;
  active: number; // 1 = active, 0 = inactive (IndexedDB can't index booleans)
  timestamp: number;
}

interface AnimalLevel {
  id?: number;
  character: string;
  animal: string;
  level: string;
  timestamp: number;
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  version: "2.0",
  recoveryTime: 20, // minutes between feedings for notification
  feedingTime: 120, // hours for level progression calculation
  dbName: "oswajanie",
  // v3: re-runs the (idempotent) upgrade to guarantee the foodGroups store
  // exists, even for databases that were stamped v2 before it was added.
  // (v4 once added an animalMeta store that has since been dropped; the version
  // stays at 4 so existing databases are not asked to downgrade.)
  dbVersion: 4,
};

const TRIGGER_TAG = "oswajanie";

/** Time between feedings (used by the popup to compute "next feed"). */
export const FEEDING_TIME_MS = CONFIG.feedingTime * 60 * 60 * 1000;

/** Notify the React popup that taming data changed so it re-loads. */
function notifyUpdated(): void {
  eventBus.emit("oswajanie.updated");
}

// ============================================================================
// Per-character helpers
// ============================================================================

function getChar(): string {
  return characterStorage.getCharacter() ?? "";
}

// ============================================================================
// IndexedDB Database (per-character scoped)
// ============================================================================

let db: IDBDatabase | null = null;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(CONFIG.dbName, CONFIG.dbVersion);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      if (!database.objectStoreNames.contains("feeding")) {
        const feedingStore = database.createObjectStore("feeding", {
          keyPath: "id",
          autoIncrement: true,
        });
        feedingStore.createIndex("character", "character", { unique: false });
        feedingStore.createIndex("character_animal", ["character", "animal"], { unique: false });
      }

      if (!database.objectStoreNames.contains("animals")) {
        const animalsStore = database.createObjectStore("animals", {
          keyPath: "id",
          autoIncrement: true,
        });
        animalsStore.createIndex("character", "character", { unique: false });
        animalsStore.createIndex("character_animal", ["character", "animal"], { unique: false });
        animalsStore.createIndex("character_animal_level", ["character", "animal", "level"], { unique: false });
      }

      // foodGroups is GLOBAL (shared across every character): it records which
      // food descriptions are treated as the same food. keyPath is the food
      // string; "group" is a synthetic id shared by all linked foods.
      if (!database.objectStoreNames.contains("foodGroups")) {
        const foodGroupsStore = database.createObjectStore("foodGroups", { keyPath: "food" });
        foodGroupsStore.createIndex("group", "group", { unique: false });
      }
    };
  });
}

// The data-layer functions below are exported for unit testing.
export async function insertFeedingEntry(animal: string, food: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(["feeding"], "readwrite");
    const store = transaction.objectStore("feeding");

    const entry: FeedingEntry = {
      character: getChar(),
      animal,
      food,
      active: 1,
      timestamp: Date.now(),
    };

    const request = store.add(entry);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  notifyUpdated();
}

export async function insertAnimalLevel(animal: string, level: string): Promise<void> {
  const database = await openDatabase();
  const character = getChar();

  // Skip if this level already exists for this animal
  const exists = await new Promise<boolean>((resolve, reject) => {
    const transaction = database.transaction(["animals"], "readonly");
    const index = transaction.objectStore("animals").index("character_animal_level");
    const request = index.count([character, animal, level]);
    request.onsuccess = () => resolve(request.result > 0);
    request.onerror = () => reject(request.error);
  });

  if (exists) return;

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(["animals"], "readwrite");
    const store = transaction.objectStore("animals");

    const entry: AnimalLevel = { character, animal, level, timestamp: Date.now() };

    const request = store.add(entry);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  notifyUpdated();
}

export async function setAnimalActive(animal: string, active: boolean): Promise<void> {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(["feeding"], "readwrite");
    const index = transaction.objectStore("feeding").index("character_animal");

    const request = index.openCursor(IDBKeyRange.only([getChar(), animal]));
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const entry = cursor.value as FeedingEntry;
        entry.active = active ? 1 : 0;
        cursor.update(entry);
        cursor.continue();
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  notifyUpdated();
}

function renameInStore(database: IDBDatabase, storeName: "feeding" | "animals", oldName: string, newName: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction([storeName], "readwrite");
    const index = transaction.objectStore(storeName).index("character_animal");

    const request = index.openCursor(IDBKeyRange.only([getChar(), oldName]));
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        const entry = cursor.value as FeedingEntry | AnimalLevel;
        entry.animal = newName;
        cursor.update(entry);
        cursor.continue();
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function renameAnimal(oldName: string, newName: string): Promise<void> {
  const database = await openDatabase();
  await renameInStore(database, "feeding", oldName, newName);
  await renameInStore(database, "animals", oldName, newName);
  notifyUpdated();
}

export async function getAnimals(): Promise<{ animal: string; active: boolean }[]> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(["feeding"], "readonly");
    const index = transaction.objectStore("feeding").index("character");
    const request = index.getAll(IDBKeyRange.only(getChar()));

    request.onsuccess = () => {
      const entries = request.result as FeedingEntry[];
      const animalsMap = new Map<string, boolean>();

      for (const entry of entries) {
        if (!animalsMap.has(entry.animal)) {
          animalsMap.set(entry.animal, entry.active === 1);
        }
      }

      const result = Array.from(animalsMap.entries())
        .map(([animal, active]) => ({ animal, active }))
        .sort((a, b) => a.animal.localeCompare(b.animal));

      resolve(result);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getFeedingsByAnimal(animal: string): Promise<FeedingEntry[]> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(["feeding"], "readonly");
    const index = transaction.objectStore("feeding").index("character_animal");
    const request = index.getAll(IDBKeyRange.only([getChar(), animal]));

    request.onsuccess = () => {
      const entries = request.result as FeedingEntry[];
      entries.sort((a, b) => b.timestamp - a.timestamp);
      resolve(entries);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getActiveFeedings(): Promise<FeedingEntry[]> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(["feeding"], "readonly");
    const index = transaction.objectStore("feeding").index("character");
    const request = index.getAll(IDBKeyRange.only(getChar()));

    request.onsuccess = () => {
      const entries = (request.result as FeedingEntry[]).filter((e) => e.active === 1);
      entries.sort((a, b) => b.timestamp - a.timestamp);
      resolve(entries);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getLastFeedingAnimal(): Promise<string | null> {
  const feedings = await getActiveFeedings();
  return feedings.length > 0 ? feedings[0].animal : null;
}

async function getAnimalLevels(animal: string): Promise<AnimalLevel[]> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(["animals"], "readonly");
    const index = transaction.objectStore("animals").index("character_animal");
    const request = index.getAll(IDBKeyRange.only([getChar(), animal]));

    request.onsuccess = () => {
      const entries = request.result as AnimalLevel[];
      entries.sort((a, b) => a.timestamp - b.timestamp);
      resolve(entries);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getLevelByAnimal(animal: string, timestamp: number): Promise<string> {
  const levels = await getAnimalLevels(animal);

  if (levels.length === 0) return "plochliwe";

  let prevLevel = "plochliwe";
  for (const al of levels) {
    if (al.timestamp <= timestamp) {
      prevLevel = al.level;
    } else {
      break;
    }
  }

  const nextLevelEntry = levels.find((a) => a.timestamp > timestamp);
  if (nextLevelEntry) {
    const feedings = await getFeedingsByAnimal(animal);
    const feedingsAfter = feedings.filter((f) => f.timestamp > timestamp);
    const nextFeedingTime = feedingsAfter.length > 0 ? Math.min(...feedingsAfter.map((f) => f.timestamp)) : 0;

    if (nextFeedingTime === 0) {
      return nextLevelEntry.level;
    }
    if (nextLevelEntry.timestamp <= nextFeedingTime) {
      return nextLevelEntry.level;
    }
  }

  return prevLevel;
}

// ============================================================================
// Food groups (GLOBAL across characters)
// ============================================================================

interface FoodGroupRecord {
  food: string;
  group: string;
}

let linkSeq = 0;

/** Map of food string -> synthetic group id. Foods absent from the map are standalone. */
export async function getFoodGroupMap(): Promise<Map<string, string>> {
  const database = await openDatabase();
  // Defensive: if the store is somehow absent, treat everything as unlinked
  // rather than throwing and breaking the view.
  if (!database.objectStoreNames.contains("foodGroups")) return new Map();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(["foodGroups"], "readonly");
    const req = tx.objectStore("foodGroups").getAll();
    req.onsuccess = () => {
      const map = new Map<string, string>();
      for (const r of req.result as FoodGroupRecord[]) map.set(r.food, r.group);
      resolve(map);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Resolve the grouping key for a food (its group id, or the food itself when standalone). */
export function groupKeyFor(food: string, map: Map<string, string>): string {
  return map.get(food) ?? food;
}

/** Link two foods so they are treated as the same food everywhere. */
export async function linkFoods(a: string, b: string): Promise<void> {
  if (!a || !b || a === b) return;
  const database = await openDatabase();
  if (!database.objectStoreNames.contains("foodGroups")) return;
  const map = await getFoodGroupMap();
  const gA = map.get(a);
  const gB = map.get(b);

  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(["foodGroups"], "readwrite");
    const store = tx.objectStore("foodGroups");

    if (gA && gB) {
      if (gA === gB) {
        resolve();
        return;
      }
      // Merge every member of group A into group B.
      const cursor = store.index("group").openCursor(IDBKeyRange.only(gA));
      cursor.onsuccess = (event) => {
        const c = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (c) {
          const rec = c.value as FoodGroupRecord;
          rec.group = gB;
          c.update(rec);
          c.continue();
        }
      };
    } else if (gA) {
      store.put({ food: b, group: gA });
    } else if (gB) {
      store.put({ food: a, group: gB });
    } else {
      const newId = `grp_${Date.now()}_${linkSeq++}`;
      store.put({ food: a, group: newId });
      store.put({ food: b, group: newId });
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notifyUpdated();
}

/** Dissolve the whole group that the given food belongs to (unlinks all members). */
export async function dissolveFoodGroup(food: string): Promise<void> {
  const database = await openDatabase();
  if (!database.objectStoreNames.contains("foodGroups")) return;
  const map = await getFoodGroupMap();
  const group = map.get(food);
  if (!group) return;

  const members = [...map.entries()].filter(([, g]) => g === group).map(([f]) => f);

  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(["foodGroups"], "readwrite");
    const store = tx.objectStore("foodGroups");
    members.forEach((f) => store.delete(f));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notifyUpdated();
}

// ============================================================================
// Export/Import helpers
// ============================================================================

type ExportData = {
  meta: {
    plugin: string;
    version: string;
    character: string;
    exportedAt: string;
    dbVersion: number;
  };
  feeding: FeedingEntry[];
  animals: AnimalLevel[];
};

async function getAllFromStore<T>(storeName: "feeding" | "animals"): Promise<T[]> {
  const database = await openDatabase();
  return new Promise<T[]>((resolve, reject) => {
    const tx = database.transaction([storeName], "readonly");
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result as unknown as T[]);
    req.onerror = () => reject(req.error);
  });
}

function downloadJson(content: string, filename: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatNowForFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export async function exportDatabase(): Promise<void> {
  try {
    const character = getChar();
    const feeding = (await getAllFromStore<FeedingEntry>("feeding")).filter((f) => f.character === character);
    const animals = (await getAllFromStore<AnimalLevel>("animals")).filter((a) => a.character === character);

    const data: ExportData = {
      meta: {
        plugin: "oswajanie",
        version: CONFIG.version,
        character,
        exportedAt: new Date().toISOString(),
        dbVersion: CONFIG.dbVersion,
      },
      feeding,
      animals,
    };

    const json = JSON.stringify(data, null, 2);
    const filename = `oswajanie_backup_${formatNowForFilename()}.json`;
    downloadJson(json, filename);

    printMsg(`\n Zapisano plik: ${filename}\n`, "#4CAF50");
  } catch (e: unknown) {
    printMsg(`\n Blad eksportu: ${(e as Error)?.message || e}\n`, "#f44336");
  }
}

function isValidFeedingEntry(o: any): boolean {
  return (
    o &&
    typeof o.animal === "string" &&
    typeof o.food === "string" &&
    (typeof o.active === "number" || typeof o.active === "boolean") &&
    typeof o.timestamp === "number"
  );
}

function isValidAnimalLevel(o: any): boolean {
  return o && typeof o.animal === "string" && typeof o.level === "string" && typeof o.timestamp === "number";
}

/**
 * Replace the current character's data with the imported set.
 * Imported records are re-stamped with the active character and given fresh
 * ids, so importing another character's (or the old plugin's) backup is safe.
 */
async function replaceDatabase(data: ExportData): Promise<void> {
  const database = await openDatabase();
  const character = getChar();

  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(["feeding", "animals"], "readwrite");
    const feedingStore = tx.objectStore("feeding");
    const animalsStore = tx.objectStore("animals");

    // Clear only the current character's existing records.
    const clearScoped = (store: IDBObjectStore) => {
      const cursorReq = store.index("character").openCursor(IDBKeyRange.only(character));
      cursorReq.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
    };
    clearScoped(feedingStore);
    clearScoped(animalsStore);

    for (const f of data.feeding) {
      feedingStore.add({
        character,
        animal: String(f.animal),
        food: String(f.food),
        active: f.active === 1 || (f.active as unknown) === true ? 1 : 0,
        timestamp: Number(f.timestamp),
      } as FeedingEntry);
    }

    for (const a of data.animals) {
      animalsStore.add({
        character,
        animal: String(a.animal),
        level: String(a.level),
        timestamp: Number(a.timestamp),
      } as AnimalLevel);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function importDatabaseFromFile(): Promise<void> {
  return new Promise<void>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";

    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) {
        printMsg("\n Nie wybrano pliku.\n", "#FFC107");
        resolve();
        return;
      }

      try {
        const parsed = JSON.parse(await file.text());

        if (!parsed || typeof parsed !== "object" || !parsed.meta || !parsed.feeding || !parsed.animals) {
          throw new Error("Nieprawidlowy format pliku.");
        }

        const feeding: FeedingEntry[] = Array.isArray(parsed.feeding) ? parsed.feeding.filter(isValidFeedingEntry) : [];
        const animals: AnimalLevel[] = Array.isArray(parsed.animals) ? parsed.animals.filter(isValidAnimalLevel) : [];

        await replaceDatabase({
          meta: {
            plugin: String(parsed.meta.plugin || "oswajanie"),
            version: String(parsed.meta.version || "unknown"),
            character: getChar(),
            exportedAt: String(parsed.meta.exportedAt || new Date().toISOString()),
            dbVersion: Number(parsed.meta.dbVersion || CONFIG.dbVersion),
          },
          feeding,
          animals,
        });

        printMsg(`\n Zaimportowano baze (wpisy: karmienie=${feeding.length}, zwierzeta=${animals.length}).\n`, "#4CAF50");
        notifyUpdated();
      } catch (e: unknown) {
        printMsg(`\n Blad importu: ${(e as Error)?.message || e}\n`, "#f44336");
      } finally {
        resolve();
      }
    });

    document.body.appendChild(input);
    input.click();
    setTimeout(() => {
      if (input.parentElement) input.parentElement.removeChild(input);
    }, 0);
  });
}

// ============================================================================
// Output helper (game-buffer messages from aliases / export-import)
// ============================================================================

function printMsg(text: string, hex: string): void {
  client.println(colorString(text, createColorFormat(hex)));
}

// ============================================================================
// Feeding-line parsing
// ============================================================================

/**
 * Split the captured "Karmiac <X> zachecasz/oswajasz" body into animal + food.
 * Game output is ASCII-normalized before triggers run, so only ASCII food
 * markers are needed ("miesem", "kawalkiem miesa").
 */
export function parseFeedingLine(raw: string): { animal: string; food: string } | null {
  const tokens = raw.trim().split(/\s+/);
  if (tokens.length < 2) return null;

  const lower = tokens.map((t) => t.toLowerCase());

  let splitIndex = -1;

  // Two-word marker: "kawalkiem miesa".
  for (let i = 0; i < lower.length - 1 && splitIndex === -1; i++) {
    if (lower[i] === "kawalkiem" && lower[i + 1] === "miesa") {
      splitIndex = i;
    }
  }

  // One-word marker: "miesem".
  if (splitIndex === -1) {
    splitIndex = lower.indexOf("miesem");
  }

  if (splitIndex > 0) {
    return {
      animal: tokens.slice(0, splitIndex).join(" "),
      food: tokens.slice(splitIndex).join(" "),
    };
  }

  // Fallback heuristics when no known marker is present.
  if (tokens.length === 2) {
    return { animal: tokens[0], food: tokens[1] };
  }
  if (tokens.length === 3) {
    return { animal: tokens[0], food: `${tokens[1]} ${tokens[2]}` };
  }
  // Assume the last two tokens are the food phrase for longer descriptions.
  return {
    animal: tokens.slice(0, tokens.length - 2).join(" "),
    food: tokens.slice(tokens.length - 2).join(" "),
  };
}

// ============================================================================
// Food similarity ("word distance")
// ============================================================================

// Filler words that should not count when comparing how similar two foods are
// (e.g. "kawalkiem miesa" vs "miesem" are the same meat).
const FOOD_NOISE_WORDS = new Set(["kawalkiem"]);

function normalizeFoodForDistance(food: string): string {
  return food
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w && !FOOD_NOISE_WORDS.has(w))
    .join(" ");
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[m];
}

/** Distance between two food descriptions, ignoring filler words like "kawalkiem". */
export function foodWordDistance(a: string, b: string): number {
  return levenshtein(normalizeFoodForDistance(a), normalizeFoodForDistance(b));
}

// ============================================================================
// Plugin State
// ============================================================================

let client: Client;
let feedAlertTimer: ReturnType<typeof setTimeout> | null = null;
const animalDescState: { lines: string[] } = { lines: [] };

// ============================================================================
// Trigger / alert helpers
// ============================================================================

function scheduleFeedAlert(): void {
  if (feedAlertTimer) clearTimeout(feedAlertTimer);
  if (CONFIG.recoveryTime > 0) {
    // Measured from the feeding, not from now. Recovery runs to minutes, so a player
    // who feeds and then backgrounds the tab would otherwise be told they can tame
    // again long after they actually could.
    feedAlertTimer = scheduleFromEvent(CONFIG.recoveryTime * 60 * 1000, () => {
      client.notify("Mozesz oswajac zwierze.");
    });
  }
}

// ============================================================================
// Initialization
// ============================================================================

export default function initOswajanie(
  client_: Client,
  aliases?: { pattern: RegExp; callback: Function }[]
): void {
  client = client_;
  const list = aliases ?? client.aliases;

  void openDatabase();

  // Trigger: detect feeding action.
  client.Triggers.registerTrigger(
    /^Karmiac (.*) (?:zachecasz|oswajasz)/,
    (line, matches) => {
      const parsed = matches && matches[1] ? parseFeedingLine(matches[1]) : null;
      if (parsed) {
        void insertFeedingEntry(parsed.animal, parsed.food);
        scheduleFeedAlert();
        client.FunctionalBind.set("ocen zwierze", undefined, true);
      }
      return line;
    },
    TRIGGER_TAG
  );

  // Trigger: detect animal evaluation (multi-line).
  const evalTrigger = client.Triggers.registerTrigger(
    /^Ogladasz dokladnie (.*)\.?$/,
    (line, matches) => {
      if (matches && matches[1]) {
        animalDescState.lines = [matches[1].replace(/\.$/, "")];
      }
      return line;
    },
    TRIGGER_TAG,
    { stayOpenLines: 6 }
  );

  evalTrigger.registerChild(
    /^Sadzac po zachowaniu .* jest (.*)\.$/,
    (childLine, childMatches) => {
      if (animalDescState.lines.length > 0 && childMatches && childMatches[1]) {
        void insertAnimalLevel(animalDescState.lines[0], childMatches[1]);
        animalDescState.lines = [];
      }
      return childLine;
    },
    TRIGGER_TAG
  );

  // Aliases (open the React popup via event).
  list.push({ pattern: /^\/o_pomoc$/, callback: () => eventBus.emit("oswajanie.popup.open", { view: "help" }) });
  list.push({ pattern: /^\/o_pokaz$/, callback: () => eventBus.emit("oswajanie.popup.open", { view: "animals" }) });
  list.push({
    pattern: /^\/o_pokaz (.+)$/,
    callback: (matches: RegExpMatchArray) => {
      if (matches[1]) eventBus.emit("oswajanie.popup.open", { view: "animals", animal: matches[1].trim() });
    },
  });
  list.push({
    pattern: /^\/o_ostatnio$/,
    callback: () => {
      void getLastFeedingAnimal().then((lastAnimal) => {
        if (lastAnimal) eventBus.emit("oswajanie.popup.open", { view: "animals", animal: lastAnimal });
        else printMsg("\n Brak informacji w bazie.\n", "#FFC107");
      });
    },
  });
  list.push({ pattern: /^\/o_historia$/, callback: () => eventBus.emit("oswajanie.popup.open", { view: "history" }) });
  list.push({
    pattern: /^\/o_wylacz (.+)$/,
    callback: (matches: RegExpMatchArray) => {
      const animal = matches[1].trim();
      void setAnimalActive(animal, false).then(() => printMsg(`\n Deaktywuje ${animal} w bazie.\n`, "#4CAF50"));
    },
  });
  list.push({
    pattern: /^\/o_wlacz (.+)$/,
    callback: (matches: RegExpMatchArray) => {
      const animal = matches[1].trim();
      void setAnimalActive(animal, true).then(() => printMsg(`\n Aktywuje ${animal} w bazie.\n`, "#4CAF50"));
    },
  });
  list.push({
    pattern: /^\/o_przemianuj (.+) na (.+)$/,
    callback: (matches: RegExpMatchArray) => {
      const oldName = matches[1].trim();
      const newName = matches[2].trim();
      if (oldName && newName) {
        void renameAnimal(oldName, newName).then(() =>
          printMsg(`\n Zmieniam ${oldName} w bazie na ${newName}.\n`, "#4CAF50")
        );
      } else {
        printMsg(
          "\n /o_przemianuj <zwierze> na <Kogo?>\n Przyklad: /o_przemianuj ostrodzioba podstarzala sojke na Darniaka\n",
          "#7986CB"
        );
      }
    },
  });
  list.push({ pattern: /^\/o_eksport$/, callback: () => void exportDatabase() });
  list.push({ pattern: /^\/o_import$/, callback: () => void importDatabaseFromFile() });
}

export function destroyOswajanie(): void {
  if (feedAlertTimer) {
    clearTimeout(feedAlertTimer);
    feedAlertTimer = null;
  }
  client.Triggers.removeByTag(TRIGGER_TAG);
  if (db) {
    db.close();
    db = null;
  }
}
