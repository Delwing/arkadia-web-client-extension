import type { PersonEntry } from './types/people';
import { getFromIndexedDB, storeInIndexedDB, type IndexedDBConfig } from './utils/dataCache';

const PEOPLE_DB_URL = 'https://arkadia.kamerdyner.net/master3/Database_people.db';
const CACHE_CONFIG: IndexedDBConfig = {
    dbName: 'ArkadiaPeopleDB',
    storeName: 'people',
    key: 'people',
};
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

let memoryCache: { data: PersonEntry[]; timestamp: number } | null = null;
let inFlightPromise: Promise<PersonEntry[]> | null = null;
let workerInstance: Worker | null = null;
let workerMessageId = 0;

type PendingRequest = {
    resolve: (value: PersonEntry[]) => void;
    reject: (reason: unknown) => void;
};

const pendingWorkerRequests = new Map<number, PendingRequest>();

const supportsWorker = typeof Worker !== 'undefined';

type WorkerSuccessMessage = { id: number; status: 'success'; people: PersonEntry[] };
type WorkerErrorMessage = { id: number; status: 'error'; error: string };
type WorkerMessage = WorkerSuccessMessage | WorkerErrorMessage;

async function downloadDatabase(): Promise<ArrayBuffer> {
    const response = await fetch(PEOPLE_DB_URL, {
        cache: 'no-cache',
        headers: {
            'Cache-Control': 'no-cache',
        },
    });
    if (!response.ok) {
        throw new Error(`Failed to download people database (${response.status})`);
    }
    return await response.arrayBuffer();
}

async function loadFromCache(): Promise<PersonEntry[] | null> {
    try {
        const cached = await getFromIndexedDB<PersonEntry[]>(CACHE_CONFIG, ONE_DAY_MS);
        if (cached && Array.isArray(cached)) {
            memoryCache = { data: cached, timestamp: Date.now() };
            return cached;
        }
    } catch (error) {
        console.warn('Failed to load people from IndexedDB', error);
    }
    return null;
}

function ensureWorker(): Worker {
    if (!workerInstance) {
        workerInstance = new Worker(new URL('./peopleWorker.ts', import.meta.url));
        workerInstance.onmessage = (event: MessageEvent<WorkerMessage>) => {
            const { data } = event;
            const pending = pendingWorkerRequests.get(data.id);
            if (!pending) {
                return;
            }
            pendingWorkerRequests.delete(data.id);
            if (data.status === 'success') {
                pending.resolve(data.people);
            } else {
                pending.reject(new Error(data.error));
            }
        };
        workerInstance.onerror = (event) => {
            const error = new Error(event.message || 'Worker error');
            pendingWorkerRequests.forEach(({ reject }) => reject(error));
            pendingWorkerRequests.clear();
            workerInstance?.terminate();
            workerInstance = null;
        };
        workerInstance.onmessageerror = () => {
            const error = new Error('Failed to parse worker message');
            pendingWorkerRequests.forEach(({ reject }) => reject(error));
            pendingWorkerRequests.clear();
            workerInstance?.terminate();
            workerInstance = null;
        };
    }
    return workerInstance;
}

async function fetchFromWorker(): Promise<PersonEntry[]> {
    return new Promise<PersonEntry[]>((resolve, reject) => {
        const worker = ensureWorker();
        const requestId = workerMessageId++;
        pendingWorkerRequests.set(requestId, { resolve, reject });
        worker.postMessage({ id: requestId, type: 'loadPeople' });
    });
}

async function fetchInMainThread(): Promise<PersonEntry[]> {
    const buffer = await downloadDatabase();
    const { parsePeopleDatabase } = await import('./peopleParser');
    return parsePeopleDatabase(buffer);
}

async function fetchPeople(): Promise<PersonEntry[]> {
    if (supportsWorker) {
        try {
            return await fetchFromWorker();
        } catch (error) {
            // fall through to main thread parsing if the worker fails
            console.warn('Falling back to main thread people parsing', error);
        }
    }
    return fetchInMainThread();
}

async function fetchAndStore(): Promise<PersonEntry[]> {
    const people = await fetchPeople();
    memoryCache = { data: people, timestamp: Date.now() };
    try {
        await storeInIndexedDB(CACHE_CONFIG, people);
    } catch (error) {
        console.warn('Failed to store people in IndexedDB', error);
    }
    return people;
}

export async function loadPeople(forceRefresh = false): Promise<PersonEntry[]> {
    if (!forceRefresh && memoryCache && memoryCache.timestamp + ONE_DAY_MS > Date.now()) {
        return memoryCache.data;
    }

    if (!inFlightPromise) {
        inFlightPromise = (async () => {
            if (!forceRefresh) {
                const cached = await loadFromCache();
                if (cached) {
                    inFlightPromise = null;
                    return cached;
                }
            }
            try {
                const people = await fetchAndStore();
                inFlightPromise = null;
                return people;
            } catch (error) {
                inFlightPromise = null;
                throw error;
            }
        })();
    }

    return inFlightPromise;
}

export type { PersonEntry } from './types/people';
