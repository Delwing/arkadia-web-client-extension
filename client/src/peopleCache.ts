import type { PersonEntry } from './types/people';

const DB_NAME = 'ArkadiaPeopleDB';
const ENTRIES_STORE = 'peopleEntries';
const METADATA_STORE = 'peopleMetadata';
const METADATA_KEY = 'metadata';

interface MetadataRecord {
    id: typeof METADATA_KEY;
    timestamp: number;
}

interface PersonRecord extends PersonEntry {
    id: string;
    order: number;
}

function isIndexedDBSupported(): boolean {
    return typeof indexedDB !== 'undefined';
}

function buildPersonId(person: PersonEntry): string {
    return `${person.name.toLowerCase()}|${person.guild.toLowerCase()}|${person.description.toLowerCase()}`;
}

function openDatabase(): Promise<IDBDatabase> {
    if (!isIndexedDBSupported()) {
        return Promise.reject(new Error('IndexedDB is not supported'));
    }

    return new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 2);

        request.onupgradeneeded = () => {
            const db = request.result;

            if (db.objectStoreNames.contains('people')) {
                db.deleteObjectStore('people');
            }

            if (!db.objectStoreNames.contains(ENTRIES_STORE)) {
                db.createObjectStore(ENTRIES_STORE, { keyPath: 'id' });
            }

            if (!db.objectStoreNames.contains(METADATA_STORE)) {
                db.createObjectStore(METADATA_STORE, { keyPath: 'id' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
        request.onblocked = () => reject(new Error('Opening people database was blocked'));
    });
}

function getTransaction(db: IDBDatabase, mode: IDBTransactionMode): IDBTransaction {
    return db.transaction([ENTRIES_STORE, METADATA_STORE], mode);
}

async function readMetadata(store: IDBObjectStore): Promise<MetadataRecord | undefined> {
    return await new Promise<MetadataRecord | undefined>((resolve, reject) => {
        const request = store.get(METADATA_KEY);
        request.onsuccess = () => resolve(request.result as MetadataRecord | undefined);
        request.onerror = () => reject(request.error ?? new Error('Failed to read metadata'));
    });
}

async function readAllPeople(store: IDBObjectStore): Promise<PersonEntry[]> {
    const records = await new Promise<PersonRecord[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve((request.result as PersonRecord[]) ?? []);
        request.onerror = () => reject(request.error ?? new Error('Failed to read people entries'));
    });

    return records
        .sort((a, b) => a.order - b.order)
        .map(({ name, description, guild }) => ({ name, description, guild }));
}

export async function loadPeopleFromIndexedDB(ttlMs: number): Promise<PersonEntry[] | null> {
    if (!isIndexedDBSupported()) {
        return null;
    }

    const db = await openDatabase();
    try {
        const transaction = getTransaction(db, 'readonly');
        const metadataStore = transaction.objectStore(METADATA_STORE);
        const entriesStore = transaction.objectStore(ENTRIES_STORE);

        const metadata = await readMetadata(metadataStore);
        if (!metadata) {
            return null;
        }

        if (ttlMs && metadata.timestamp + ttlMs <= Date.now()) {
            return null;
        }

        const people = await readAllPeople(entriesStore);
        await new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error ?? new Error('Failed to read cached people'));
            transaction.onabort = () => reject(transaction.error ?? new Error('Reading cached people was aborted'));
        });

        return people;
    } finally {
        db.close();
    }
}

async function clearEntries(store: IDBObjectStore): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error('Failed to clear people cache'));
    });
}

async function writePerson(store: IDBObjectStore, record: PersonRecord): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const request = store.put(record);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error('Failed to store person entry'));
    });
}

async function writeMetadata(store: IDBObjectStore, timestamp: number): Promise<void> {
    const record: MetadataRecord = { id: METADATA_KEY, timestamp };
    await new Promise<void>((resolve, reject) => {
        const request = store.put(record);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error('Failed to store metadata'));
    });
}

export async function storePeopleInIndexedDB(people: PersonEntry[]): Promise<void> {
    if (!isIndexedDBSupported()) {
        throw new Error('IndexedDB is not supported');
    }

    const db = await openDatabase();
    try {
        const transaction = getTransaction(db, 'readwrite');
        const metadataStore = transaction.objectStore(METADATA_STORE);
        const entriesStore = transaction.objectStore(ENTRIES_STORE);

        await clearEntries(entriesStore);

        const timestamp = Date.now();
        let order = 0;
        for (const person of people) {
            const record: PersonRecord = {
                id: buildPersonId(person),
                name: person.name,
                description: person.description,
                guild: person.guild,
                order: order++,
            };
            await writePerson(entriesStore, record);
        }

        await writeMetadata(metadataStore, timestamp);

        await new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error ?? new Error('Failed to commit people cache transaction'));
            transaction.onabort = () => reject(transaction.error ?? new Error('People cache transaction was aborted'));
        });
    } finally {
        db.close();
    }
}
