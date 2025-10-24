import { IndexedDbCollectionStrategy } from '../src/peopleCache';
import type { PersonEntry } from '../src/types/people';

type TestMetadata = { refreshedAt: number; count: number };

const DB_NAME = 'ArkadiaPeopleDB';

async function deleteDatabase() {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to reset IndexedDB'));
  });
}

describe('IndexedDbCollectionStrategy', () => {
  const samplePeople: PersonEntry[] = [
    { name: 'Aeron', description: 'wysoki mezczyzna', guild: 'CKN' },
    { name: 'Mara', description: 'niska kobieta', guild: 'NPC' },
  ];

  let strategy: IndexedDbCollectionStrategy<PersonEntry, TestMetadata>;

  beforeEach(async () => {
    await deleteDatabase();
    strategy = new IndexedDbCollectionStrategy<PersonEntry, TestMetadata>({
      dbName: DB_NAME,
      entriesStore: 'peopleEntries',
      metadataStore: 'peopleMetadata',
      metadataKey: 'metadata',
      version: 2,
      buildEntryId: (person) =>
        `${person.name.toLowerCase()}|${person.guild.toLowerCase()}|${person.description.toLowerCase()}`,
    });
  });

  test('stores snapshot entries preserving order and metadata', async () => {
    const metadata: TestMetadata = { refreshedAt: Date.now(), count: samplePeople.length };

    await strategy.writeSnapshot(samplePeople);
    await strategy.writeMetadata(metadata);

    const cachedSnapshot = await strategy.readSnapshot();
    const cachedMetadata = await strategy.readMetadata();

    expect(cachedSnapshot).toEqual(samplePeople);
    expect(cachedMetadata).toEqual(metadata);

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
            order: index,
            value: samplePeople[index],
          }),
        );
      });
    } finally {
      db.close();
    }
  });

  test('clear removes snapshot and metadata', async () => {
    const metadata: TestMetadata = { refreshedAt: Date.now(), count: samplePeople.length };
    await strategy.writeSnapshot(samplePeople);
    await strategy.writeMetadata(metadata);

    await strategy.clear();

    const cachedSnapshot = await strategy.readSnapshot();
    const cachedMetadata = await strategy.readMetadata();

    expect(cachedSnapshot).toBeUndefined();
    expect(cachedMetadata).toBeUndefined();
  });
});
