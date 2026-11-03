import { beforeEach, describe, expect, it } from 'vitest';
import { measureLogs, runScan } from '@web/storage/storageMeasure.ts';
import type { StorageScanResponse } from '@web/storage/storageScan.shared.ts';
import { openLogsDb, writeSession } from '@web/logsDatabase.ts';

function deleteDb(name: string): Promise<void> {
    return new Promise((resolve) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
    });
}

async function seedLogs(sessions: Record<string, string[]>): Promise<void> {
    const db = (await openLogsDb())!;
    for (const [id, texts] of Object.entries(sessions)) {
        await writeSession(db, id, texts.map((text, seq) => ({ seq, entry: { text, timestamp: seq } })));
    }
    db.close();
}

function seedOther(name: string, values: unknown[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('things');
        request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('things', 'readwrite');
            values.forEach((value, index) => tx.objectStore('things').put(value, index));
            tx.oncomplete = () => {
                db.close();
                resolve();
            };
            tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
    });
}

describe('storage measuring', () => {
    beforeEach(async () => {
        for (const database of await indexedDB.databases()) if (database.name) await deleteDb(database.name);
    });

    it('measures each log, and keeps a known size while its record count is unchanged', async () => {
        await seedLogs({ session_1: ['a'.repeat(100)], session_2: ['b'.repeat(10), 'c'.repeat(10)] });
        const db = (await openLogsDb())!;
        const first = await measureLogs(db, {});
        expect(first.logSizes.session_1.count).toBe(1);
        expect(first.logSizes.session_2.count).toBe(2);
        expect(first.logSizes.session_1.bytes).toBeGreaterThan(first.logSizes.session_2.bytes);
        expect(first.size.records).toBe(3);

        // A stale size with the right count is trusted; a wrong count is measured again.
        const second = await measureLogs(db, {
            session_1: { count: 1, bytes: 7 },
            session_2: { count: 99, bytes: 7 },
        });
        db.close();
        expect(second.logSizes.session_1.bytes).toBe(7);
        expect(second.logSizes.session_2.bytes).toBe(first.logSizes.session_2.bytes);
        expect(second.size.bytes).toBe(7 + first.logSizes.session_2.bytes);
    });

    it('measures every database, a store at a time, past one batch', async () => {
        await seedLogs({ session_1: ['x'] });
        await seedOther('ArkadiaMapDB', Array.from({ length: 1500 }, () => 'm'.repeat(10)));
        const messages: StorageScanResponse[] = [];
        await runScan({ type: 'scan', logsOnly: false, logSizes: {} }, (message) => messages.push(message));
        const done = messages.at(-1);
        expect(done?.type).toBe('done');
        if (done?.type !== 'done') return;
        const map = done.databases.find((database) => database.name === 'ArkadiaMapDB');
        expect(map?.records).toBe(1500);
        expect(map?.bytes).toBe(1500 * (10 + 8));
        expect(done.databases.find((database) => database.name === 'ArkadiaLogsDB')?.records).toBe(1);
        expect(Object.keys(done.logSizes)).toEqual(['session_1']);
        expect(messages.some((message) => message.type === 'progress')).toBe(true);
    });

    it('reads only the logs when asked, and creates nothing that was not there', async () => {
        await seedOther('ArkadiaMapDB', ['m']);
        const messages: StorageScanResponse[] = [];
        await runScan({ type: 'scan', logsOnly: true, logSizes: {} }, (message) => messages.push(message));
        const done = messages.at(-1);
        expect(done?.type === 'done' && done.databases.map((database) => database.name)).toEqual(['ArkadiaLogsDB']);
        // The log database is opened properly (with its store), so a later writer can use it.
        const db = (await openLogsDb())!;
        expect(Array.from(db.objectStoreNames)).toEqual(['records']);
        db.close();
    });
});
