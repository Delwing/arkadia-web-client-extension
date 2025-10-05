import { loadPeopleFromIndexedDB, storePeopleInIndexedDB } from '../src/peopleCache';
import type { PersonEntry } from '../src/types/people';

const DB_NAME = 'ArkadiaPeopleDB';

async function deleteDatabase() {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to reset IndexedDB'));
  });
}

async function updateMetadataTimestamp(timestamp: number) {
  const request = indexedDB.open(DB_NAME, 2);
  const db: IDBDatabase = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open database'));
  });

  try {
    const transaction = db.transaction(['peopleMetadata'], 'readwrite');
    const store = transaction.objectStore('peopleMetadata');
    await new Promise<void>((resolve, reject) => {
      const putRequest = store.put({ id: 'metadata', timestamp });
      putRequest.onsuccess = () => resolve();
      putRequest.onerror = () => reject(putRequest.error ?? new Error('Failed to update metadata timestamp'));
    });

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Failed to commit metadata transaction'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Metadata transaction aborted'));
    });
  } finally {
    db.close();
  }
}

describe('people IndexedDB cache', () => {
  const samplePeople: PersonEntry[] = [
    { name: 'Aeron', description: 'wysoki mezczyzna', guild: 'CKN' },
    { name: 'Mara', description: 'niska kobieta', guild: 'NPC' },
  ];

  beforeEach(async () => {
    await deleteDatabase();
  });

  test('stores people as normalized entries and loads them back', async () => {
    await storePeopleInIndexedDB(samplePeople);

    const cached = await loadPeopleFromIndexedDB(24 * 60 * 60 * 1000);
    expect(cached).toEqual(samplePeople);

    const openRequest = indexedDB.open(DB_NAME, 2);
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject(openRequest.error ?? new Error('Failed to reopen database'));
    });

    try {
      const transaction = db.transaction(['peopleEntries'], 'readonly');
      const store = transaction.objectStore('peopleEntries');
      const records: any[] = await new Promise((resolve, reject) => {
        const getAllRequest = store.getAll();
        getAllRequest.onsuccess = () => resolve(getAllRequest.result as any[]);
        getAllRequest.onerror = () => reject(getAllRequest.error ?? new Error('Failed to read entries'));
      });

      expect(records).toHaveLength(samplePeople.length);
      records.forEach((record, index) => {
        expect(record).toEqual(
          expect.objectContaining({
            id: expect.any(String),
            name: samplePeople[index].name,
            description: samplePeople[index].description,
            guild: samplePeople[index].guild,
            order: index,
          }),
        );
      });
    } finally {
      db.close();
    }
  });

  test('respects ttl when loading cached entries', async () => {
    await storePeopleInIndexedDB(samplePeople);

    const past = Date.now() - 2 * 24 * 60 * 60 * 1000;
    await updateMetadataTimestamp(past);

    const cached = await loadPeopleFromIndexedDB(24 * 60 * 60 * 1000);
    expect(cached).toBeNull();
  });
});
