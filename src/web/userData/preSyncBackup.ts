/**
 * A full backup of this device, taken right before it moves to sync v2
 * (before the migration changes any local data). The way back if sync v2
 * writes something wrong: it can be restored or downloaded from the backup
 * page. Kept until v1 is removed. See docs/dev/SYNC_V2_PLAN.md, section 11.
 */

import { buildBackup, type BackupPayload } from '@web/options/exportUtils';

const DB_NAME = 'ArkadiaPreSyncV2Backup';
const STORE = 'backup';
const KEY = 'beforeSyncV2';

/** Dispatched on window once the backup is saved (the backup page shows it). */
export const PRE_SYNC_BACKUP_SAVED_EVENT = 'arkadia:preSyncBackupSaved';

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await openDb();
    try {
        return await new Promise<T>((resolve, reject) => {
            const tx = db.transaction(STORE, mode);
            const request = action(tx.objectStore(STORE));
            tx.oncomplete = () => resolve(request.result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } finally {
        db.close();
    }
}

/** The backup, when this device has one. */
export async function loadPreSyncBackup(): Promise<BackupPayload | null> {
    const raw = await run('readonly', store => store.get(KEY) as IDBRequest<string | undefined>);
    return raw ? JSON.parse(raw) as BackupPayload : null;
}

/**
 * Take the backup unless this device already has one: the first one holds
 * the state from before sync v2 (a second account signing in later on the
 * same browser must not replace it).
 */
export async function savePreSyncBackup(): Promise<void> {
    const existing = await run('readonly', store => store.getKey(KEY));
    if (existing !== undefined) return;
    const payload = await buildBackup();
    await run('readwrite', store => store.put(JSON.stringify(payload), KEY));
    window.dispatchEvent(new Event(PRE_SYNC_BACKUP_SAVED_EVENT));
}
