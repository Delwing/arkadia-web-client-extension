import { beforeEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import {
    dayToTime,
    getDownloadedFormats,
    ImportError,
    markDownloaded,
    presetRange,
    readExportFile,
    sessionsInRange,
    timeToDay,
} from '@web/logsArchive.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 3, 12, 0).getTime();

function deleteDb(name: string): Promise<void> {
    return new Promise((resolve) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
    });
}

function fileOf(name: string, content: string | Uint8Array, type = ''): File {
    return new File([content], name, { type });
}

describe('date ranges', () => {
    const sessions = [
        { id: 'session_a', startedAt: NOW - 2 * DAY },
        { id: 'session_b', startedAt: NOW - 40 * DAY },
        { id: 'session_c', startedAt: NOW - 400 * DAY },
        { id: 'session_live', startedAt: NOW - 60 * 1000 },
    ];
    const ids = (range: ReturnType<typeof presetRange>, live?: string) =>
        sessionsInRange(sessions, range, live).map((session) => session.id);

    it('takes the recent or the old logs by preset', () => {
        expect(ids(presetRange('last7', NOW))).toEqual(['session_a', 'session_live']);
        expect(ids(presetRange('older30', NOW))).toEqual(['session_b', 'session_c']);
        expect(ids(presetRange('older365', NOW))).toEqual(['session_c']);
        expect(ids(presetRange('all', NOW))).toHaveLength(4);
    });

    it('never takes the log being recorded', () => {
        expect(ids(presetRange('last7', NOW), 'session_live')).toEqual(['session_a']);
    });

    it('reads a date input as whole local days', () => {
        const from = dayToTime('2026-11-01')!;
        const to = dayToTime('2026-11-01', true)!;
        expect(new Date(from).getHours()).toBe(0);
        expect(to - from).toBe(DAY - 1);
        expect(timeToDay(from)).toBe('2026-11-01');
        expect(dayToTime('nonsense')).toBeUndefined();
    });
});

describe('downloaded formats', () => {
    beforeEach(() => deleteDb('ArkadiaLogsMetaDB'));

    it('adds formats to what a log was downloaded as', async () => {
        await markDownloaded(['session_1'], ['txt'], 1000);
        await markDownloaded(['session_1', 'session_2'], ['json'], 2000);
        const formats = await getDownloadedFormats();
        expect(formats.get('session_1')).toEqual({ txt: 1000, json: 2000 });
        expect(formats.get('session_2')).toEqual({ json: 2000 });
    });

    it('reads a mark from before formats as the HTML archive it was', async () => {
        await new Promise<void>((resolve) => {
            const request = indexedDB.open('ArkadiaLogsMetaDB', 3);
            request.onupgradeneeded = () => request.result.createObjectStore('downloaded');
            request.onsuccess = () => {
                const tx = request.result.transaction('downloaded', 'readwrite');
                tx.objectStore('downloaded').put({ downloadedAt: 500 }, 'session_old');
                tx.oncomplete = () => {
                    request.result.close();
                    resolve();
                };
            };
        });
        expect((await getDownloadedFormats()).get('session_old')).toEqual({ html: 500 });
    });
});

describe('readExportFile', () => {
    const entries = [{ text: 'Witaj', timestamp: 1 }];

    it('reads a JSON export', async () => {
        const file = fileOf('logi.json', JSON.stringify({ version: 1, sessions: { session_1: entries } }));
        expect(await readExportFile(file)).toEqual({ session_1: entries });
    });

    it('reads every JSON file of a ZIP, whatever else it holds', async () => {
        const zip = new JSZip();
        zip.file('html/session_1.html', '<html></html>');
        zip.file('json/session_1.json', JSON.stringify({ version: 1, sessions: { session_1: entries } }));
        zip.file('json/session_2.json', JSON.stringify({ version: 1, sessions: { session_2: entries } }));
        const data = await zip.generateAsync({ type: 'uint8array' });
        const sessions = await readExportFile(fileOf('logi.zip', data, 'application/zip'));
        expect(Object.keys(sessions).sort()).toEqual(['session_1', 'session_2']);
        // A download saved without its extension is still read as the archive it is.
        expect(Object.keys(await readExportFile(fileOf('f3a9c1', data)))).toHaveLength(2);
    });

    it('says why a ZIP without JSON or a bad file cannot be imported', async () => {
        const zip = new JSZip();
        zip.file('session_1.html', '<html></html>');
        const data = await zip.generateAsync({ type: 'uint8array' });
        await expect(readExportFile(fileOf('logi.zip', data))).rejects.toThrow(/nie ma plików JSON/);
        await expect(readExportFile(fileOf('x.json', '{oops'))).rejects.toBeInstanceOf(ImportError);
        await expect(readExportFile(fileOf('x.json', '{"version":2}'))).rejects.toThrow(/format/);
    });
});
