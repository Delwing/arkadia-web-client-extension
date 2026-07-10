import { DataStore, createDataStoreSingleton } from '@modules/data/dataStore/DataStore';
import type { RefreshMetadata, SubscriptionOptions } from '@modules/data/dataStore/types';
import { IndexedDbCollectionStrategy } from '@modules/data/indexedDbCollectionStrategy';

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

const storage = new IndexedDbCollectionStrategy<StoredMultibindRecord, RefreshMetadata>({
  dbName: DB_CONFIG.dbName,
  entriesStore: DB_CONFIG.entriesStore,
  metadataStore: DB_CONFIG.metadataStore,
  version: 3,
  buildEntryId,
});

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
      async load() {
        const persisted = await storage.readSnapshot();
        const snapshot = normalizeSnapshot(persisted ?? []);
        return {
          snapshot,
          metadata: { refreshedAt: Date.now() },
        };
      },
    },
    storage,
  }),
);

const BROADCAST_CHANNEL_NAME = 'arkadia-multibinds-sync';
const INSTANCE_ID = Math.random().toString(36).slice(2);
const broadcastChannel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(BROADCAST_CHANNEL_NAME) : null;
let isHandlingExternalUpdate = false;

if (broadcastChannel) {
  broadcastChannel.addEventListener('message', (event) => {
    void handleIncomingMessage(event.data);
  });
}

async function handleIncomingMessage(data: unknown): Promise<void> {
  if (!data || typeof data !== 'object') {
    return;
  }
  const message = data as { type?: string; originId?: string };
  if (message.originId === INSTANCE_ID) {
    return;
  }
  if (message.type === 'sync') {
    isHandlingExternalUpdate = true;
    try {
      storage.invalidateCache();
      await getMultibindStore().refresh({ force: true });
    } catch (error) {
      console.error('Failed to refresh multibinds after external update:', error);
    } finally {
      isHandlingExternalUpdate = false;
    }
  }
}

function broadcastSync(): void {
  if (!broadcastChannel || isHandlingExternalUpdate) {
    return;
  }
  try {
    broadcastChannel.postMessage({ type: 'sync', originId: INSTANCE_ID });
  } catch (error) {
    console.warn('Failed to broadcast multibinds update:', error);
  }
}

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
  broadcastSync();
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
  const normalized = normalizeSnapshot(result ?? []);
  broadcastSync();
  return normalized;
}

export async function clear(): Promise<void> {
  await getMultibindStore().clear();
  broadcastSync();
}

export function toKey(roomId: number, index: number): string {
  return `${roomId}:${index}`;
}

export function normalizeMultibinds(list: unknown): StoredMultibindRecord[] {
  return normalizeSnapshot(list);
}
