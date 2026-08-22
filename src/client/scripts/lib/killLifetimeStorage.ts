export interface KillRecord {
    id: string;          // "{character}:{mob}:{date}"
    character: string;
    mob: string;
    date: string;        // "YYYY/M/D" or "unknown"
    count: number;
}

export interface LifetimeKillSummary {
    mob: string;
    total: number;
}

export interface DailyKillSummary {
    mob: string;
    count: number;
}

export interface GlobalKillStats {
    mob: string;
    total: number;
    daysActive: number;
    killsPerDay: number;
}

export interface DateGroupedKills {
    date: string;
    kills: DailyKillSummary[];
    total: number;
}

const DB_NAME = 'ArkadiaKillsDB';
const STORE_NAME = 'kills';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, {keyPath: 'id'});
                store.createIndex('character', 'character', {unique: false});
                store.createIndex('character_date', ['character', 'date'], {unique: false});
            }
        };
        request.onerror = () => reject(new Error('Failed to open KillsDB'));
        request.onsuccess = () => resolve(request.result);
    });
}

function makeId(character: string, mob: string, date: string): string {
    return `${character}:${mob}:${date}`;
}

export function getTodayDate(): string {
    const now = new Date();
    return `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;
}

export async function recordKillToDB(
    character: string,
    mob: string,
    date: string,
): Promise<void> {
    const db = await openDB();
    const id = makeId(character, mob, date);
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(id);
        getReq.onsuccess = () => {
            const existing = getReq.result as KillRecord | undefined;
            const record: KillRecord = existing
                ? {...existing, count: existing.count + 1}
                : {id, character, mob, date, count: 1};
            const putReq = store.put(record);
            putReq.onsuccess = () => resolve();
            putReq.onerror = () => reject(new Error('Failed to store kill record'));
        };
        getReq.onerror = () => reject(new Error('Failed to read kill record'));
    });
}

export async function getLifetimeTotals(
    character: string,
): Promise<LifetimeKillSummary[]> {
    const records = await getRecordsByCharacter(character);
    const totals: Record<string, number> = {};
    for (const r of records) {
        totals[r.mob] = (totals[r.mob] ?? 0) + r.count;
    }
    return Object.entries(totals)
        .map(([mob, total]) => ({mob, total}))
        .sort((a, b) => a.mob.localeCompare(b.mob));
}

export async function getKillsByDate(
    character: string,
    date: string,
): Promise<DailyKillSummary[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('character_date');
        const req = index.getAll(IDBKeyRange.only([character, date]));
        req.onsuccess = () => {
            const records = req.result as KillRecord[];
            resolve(
                records
                    .map(r => ({mob: r.mob, count: r.count}))
                    .sort((a, b) => a.mob.localeCompare(b.mob))
            );
        };
        req.onerror = () => reject(new Error('Failed to query kills by date'));
    });
}

export async function getGlobalKillStats(
    character: string,
): Promise<GlobalKillStats[]> {
    const records = await getRecordsByCharacter(character);
    const byMob: Record<string, { total: number; dates: Set<string> }> = {};
    for (const r of records) {
        if (!byMob[r.mob]) {
            byMob[r.mob] = {total: 0, dates: new Set()};
        }
        byMob[r.mob].total += r.count;
        byMob[r.mob].dates.add(r.date);
    }
    return Object.entries(byMob)
        .map(([mob, {total, dates}]) => ({
            mob,
            total,
            daysActive: dates.size,
            killsPerDay: dates.size > 0 ? total / dates.size : 0,
        }))
        .sort((a, b) => b.total - a.total);
}

export async function getAllRecords(
    character: string,
): Promise<KillRecord[]> {
    return getRecordsByCharacter(character);
}

export async function getDistinctDates(
    character: string,
): Promise<string[]> {
    const records = await getRecordsByCharacter(character);
    const dates = new Set<string>();
    for (const r of records) {
        dates.add(r.date);
    }
    return Array.from(dates);
}

export async function importRecords(records: KillRecord[]): Promise<void> {
    if (records.length === 0) return;
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const record of records) {
            store.put(record);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error('Failed to import kill records'));
    });
}

const MIGRATION_KEY_PREFIX = 'kill_idb_migrated:';

export async function migrateFromLocalStorage(character: string): Promise<void> {
    const migrationKey = `${MIGRATION_KEY_PREFIX}${character}`;
    if (localStorage.getItem(migrationKey) === 'true') {
        return;
    }

    const rawKey = `${character}:kill_counter`;
    const raw = localStorage.getItem(rawKey);
    if (!raw) {
        localStorage.setItem(migrationKey, 'true');
        return;
    }

    let totals: Record<string, number>;
    try {
        totals = JSON.parse(raw);
    } catch {
        localStorage.setItem(migrationKey, 'true');
        return;
    }

    const records: KillRecord[] = Object.entries(totals)
        .filter(([, count]) => typeof count === 'number' && count > 0)
        .map(([mob, count]) => ({
            id: makeId(character, mob, 'unknown'),
            character,
            mob,
            date: 'unknown',
            count,
        }));

    if (records.length > 0) {
        await importRecords(records);
    }

    localStorage.setItem(migrationKey, 'true');
}

function parseDateForSort(d: string): number {
    if (d === 'unknown') return 0;
    const parts = d.split('/');
    const y = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const day = parseInt(parts[2], 10) || 0;
    return y * 10000 + m * 100 + day;
}

export async function getKillsGroupedByDate(
    character: string,
): Promise<DateGroupedKills[]> {
    const records = await getRecordsByCharacter(character);
    const byDate: Record<string, DailyKillSummary[]> = {};
    for (const r of records) {
        if (!byDate[r.date]) byDate[r.date] = [];
        byDate[r.date].push({mob: r.mob, count: r.count});
    }
    return Object.entries(byDate)
        .sort(([a], [b]) => parseDateForSort(a) - parseDateForSort(b))
        .map(([date, kills]) => ({
            date,
            kills: kills.sort((a, b) => a.mob.localeCompare(b.mob)),
            total: kills.reduce((s, k) => s + k.count, 0),
        }));
}

async function getRecordsByCharacter(character: string): Promise<KillRecord[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('character');
        const req = index.getAll(IDBKeyRange.only(character));
        req.onsuccess = () => resolve(req.result as KillRecord[]);
        req.onerror = () => reject(new Error('Failed to query kill records'));
    });
}

export async function exportAllKillRecords(): Promise<KillRecord[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result as KillRecord[]);
        req.onerror = () => reject(new Error('Failed to export kill records'));
    });
}

export async function importAllKillRecords(records: KillRecord[]): Promise<void> {
    if (records.length === 0) return;
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const record of records) {
            // Merge with the existing record instead of overwriting: counts only
            // ever grow, so the higher one is the more complete tally. Keeps an
            // import (sync or backup restore) from erasing kills recorded locally.
            const getReq = store.get(record.id);
            getReq.onsuccess = () => {
                const existing = getReq.result as KillRecord | undefined;
                store.put(existing && existing.count > record.count
                    ? existing
                    : record);
            };
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(new Error('Failed to import kill records'));
    });
}

export {makeId, openDB};
