import { DataStore, createDataStoreSingleton } from '@client/src/dataStore/DataStore';
import type { RefreshMetadata, SubscriptionOptions } from '@client/src/dataStore/types';
import { IndexedDbCollectionStrategy } from '@client/src/peopleCache';

export interface StoredMultibindRecord {
  roomId: number;
  index: number;
  action: string;
}

const DB_CONFIG = {
  dbName: 'ArkadiaMultibindsDB',
  entriesStore: 'multibinds',
  metadataStore: 'metadata',
} as const;

function buildEntryId(entry: StoredMultibindRecord): string {
  return `${entry.roomId}:${entry.index}`;
}

function normalizeEntry(entry: unknown): StoredMultibindRecord | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const candidate = entry as Partial<StoredMultibindRecord>;
  const roomId = Number((candidate as any).roomId);
  const index = Number((candidate as any).index);
  if (!Number.isFinite(roomId) || !Number.isFinite(index)) {
    return null;
  }
  const action = typeof candidate.action === 'string' ? candidate.action : String((candidate as any).action ?? '');
  return {
    roomId,
    index,
    action,
  };
}

function normalizeSnapshot(list: unknown): StoredMultibindRecord[] {
  if (!Array.isArray(list)) {
    return [];
  }
  const entries = list
    .map((item) => normalizeEntry(item))
    .filter((item): item is StoredMultibindRecord => item !== null);

  const unique = new Map<string, StoredMultibindRecord>();
  for (const entry of entries) {
    unique.set(buildEntryId(entry), entry);
  }
  return Array.from(unique.values());
}

const getMultibindStore = createDataStoreSingleton(() =>
  new DataStore<StoredMultibindRecord[], RefreshMetadata>({
    loader: {
      async load({ previousSnapshot }) {
        const snapshot = normalizeSnapshot(previousSnapshot ?? []);
        return {
          snapshot,
          metadata: { refreshedAt: Date.now() },
        };
      },
    },
    storage: new IndexedDbCollectionStrategy<StoredMultibindRecord, RefreshMetadata>({
      dbName: DB_CONFIG.dbName,
      entriesStore: DB_CONFIG.entriesStore,
      metadataStore: DB_CONFIG.metadataStore,
      buildEntryId,
    }),
  }),
);

async function toResolvedSnapshot(
  snapshotPromise: Promise<StoredMultibindRecord[] | undefined>,
): Promise<StoredMultibindRecord[]> {
  const snapshot = await snapshotPromise;
  return snapshot ? normalizeSnapshot(snapshot) : [];
}

export async function getSnapshot(): Promise<StoredMultibindRecord[]> {
  return await toResolvedSnapshot(getMultibindStore().getSnapshot());
}

export function subscribe(
  listener: (snapshot: StoredMultibindRecord[]) => void,
  options?: SubscriptionOptions,
): () => void {
  return getMultibindStore().subscribe(
    (snapshot) => {
      listener(snapshot ? normalizeSnapshot(snapshot) : []);
    },
    options,
  );
}

export async function replaceAll(list: unknown): Promise<StoredMultibindRecord[]> {
  const normalized = normalizeSnapshot(list);
  await getMultibindStore().applyLocalChange(() => normalized);
  return normalized;
}

export async function applyLocalChange(
  mutator: (current: StoredMultibindRecord[]) => StoredMultibindRecord[],
): Promise<StoredMultibindRecord[]> {
  const result = await getMultibindStore().applyLocalChange((current) => {
    const snapshot = Array.isArray(current) ? normalizeSnapshot(current) : [];
    const mutated = mutator([...snapshot]);
    return normalizeSnapshot(mutated);
  });
  return normalizeSnapshot(result ?? []);
}

export function clear(): Promise<void> {
  return getMultibindStore().clear();
}

export function toKey(roomId: number, index: number): string {
  return `${roomId}:${index}`;
}

export function normalizeMultibinds(list: unknown): StoredMultibindRecord[] {
  return normalizeSnapshot(list);
}
