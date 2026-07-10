import { DataStore } from '@modules/data/dataStore/DataStore';
import {
  FetchJsonLoader,
  JsonDatasetSnapshot,
} from '@modules/data/dataStore/strategies/FetchJsonLoader';
import {
  LoaderContext,
  LoaderResult,
  LoaderStrategy,
  RefreshMetadata,
  StorageStrategy,
} from '@modules/data/dataStore/types';
import {
  clearIndexedDB,
  getFromIndexedDB,
  IndexedDBConfig,
  storeInIndexedDB,
} from '@client/utils/dataCache';

const NPC_DATA_URL = 'https://delwing.github.io/arkadia-mapa/data/npc.json';
const TTL_MS = 24 * 60 * 60 * 1000;

export interface NpcRecord {
  name: string;
  loc: number;
}

export type NpcSource = 'remote' | 'local';

export interface NpcListEntry extends NpcRecord {
  source: NpcSource;
}

export interface LocalNpcDataset {
  data: NpcRecord[];
  timestamp: number;
}

export interface NpcStoreSnapshot {
  remote?: JsonDatasetSnapshot<NpcRecord[]>;
  local: LocalNpcDataset;
  all: JsonDatasetSnapshot<NpcListEntry[]>;
}

interface NpcStorageOptions {
  snapshot: IndexedDBConfig;
  local: IndexedDBConfig;
  metadata: IndexedDBConfig;
}

const EMPTY_LOCAL: LocalNpcDataset = { data: [], timestamp: 0 };

function npcKey(npc: NpcRecord): string {
  return `${npc.name}-${npc.loc}`;
}

function mergeNpcEntries(remote: NpcRecord[], local: NpcRecord[]): NpcListEntry[] {
  const seen = new Set<string>();
  const merged: NpcListEntry[] = [];

  for (const entry of remote) {
    const key = npcKey(entry);
    if (seen.has(key)) {
      continue;
    }
    merged.push({ ...entry, source: 'remote' });
    seen.add(key);
  }

  for (const entry of local) {
    const key = npcKey(entry);
    if (seen.has(key)) {
      continue;
    }
    merged.push({ ...entry, source: 'local' });
    seen.add(key);
  }

  return merged;
}

function normalizeLocalEntries(entries: NpcRecord[]): NpcRecord[] {
  const seen = new Set<string>();
  const normalized: NpcRecord[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry.name !== 'string' || typeof entry.loc !== 'number') {
      continue;
    }
    const key = npcKey(entry);
    if (seen.has(key)) {
      continue;
    }
    normalized.push({ name: entry.name, loc: entry.loc });
    seen.add(key);
  }
  return normalized;
}

class NpcStorageStrategy implements StorageStrategy<NpcStoreSnapshot, RefreshMetadata> {
  private readonly remoteConfig: IndexedDBConfig;
  private readonly localConfig: IndexedDBConfig;
  private readonly metadataConfig: IndexedDBConfig;

  private remoteSnapshot: JsonDatasetSnapshot<NpcRecord[]> | undefined;
  private localDataset: LocalNpcDataset = EMPTY_LOCAL;
  private metadata: RefreshMetadata | undefined;

  constructor(options: NpcStorageOptions) {
    this.remoteConfig = options.snapshot;
    this.localConfig = options.local;
    this.metadataConfig = options.metadata;
  }

  async readSnapshot(): Promise<NpcStoreSnapshot | undefined> {
    const [remote, local] = await Promise.all([
      this.loadRemoteSnapshot(),
      this.loadLocalDataset(),
    ]);

    this.remoteSnapshot = remote ?? undefined;
    this.localDataset = local ?? EMPTY_LOCAL;

    return this.composeSnapshot();
  }

  async writeSnapshot(snapshot: NpcStoreSnapshot | undefined): Promise<void> {
    if (!snapshot) {
      await this.clear();
      return;
    }

    this.remoteSnapshot = snapshot.remote;
    this.localDataset = snapshot.local ?? EMPTY_LOCAL;

    await Promise.all([
      this.persistRemote(this.remoteSnapshot),
      this.persistLocal(this.localDataset),
    ]);
  }

  async readMetadata(): Promise<RefreshMetadata | undefined> {
    const stored = await this.loadMetadata();
    this.metadata = stored ?? undefined;
    return this.metadata;
  }

  async writeMetadata(metadata: RefreshMetadata | undefined): Promise<void> {
    this.metadata = metadata;
    await this.persistMetadata(metadata);
  }

  async clear(): Promise<void> {
    this.remoteSnapshot = undefined;
    this.localDataset = EMPTY_LOCAL;
    this.metadata = undefined;

    await Promise.all([
      clearIndexedDB(this.remoteConfig).catch(this.reportWarning.bind(this, 'clear remote snapshot')),
      clearIndexedDB(this.localConfig).catch(this.reportWarning.bind(this, 'clear local snapshot')),
      clearIndexedDB(this.metadataConfig).catch(this.reportWarning.bind(this, 'clear metadata')),
    ]);
  }

  async clearRemote(): Promise<void> {
    this.remoteSnapshot = undefined;
    this.metadata = undefined;

    await Promise.all([
      clearIndexedDB(this.remoteConfig).catch(this.reportWarning.bind(this, 'clear remote snapshot')),
      clearIndexedDB(this.metadataConfig).catch(this.reportWarning.bind(this, 'clear metadata')),
    ]);
  }

  async clearLocal(): Promise<void> {
    this.localDataset = EMPTY_LOCAL;
    await clearIndexedDB(this.localConfig).catch(this.reportWarning.bind(this, 'clear local snapshot'));
  }

  getSnapshotInMemory(): NpcStoreSnapshot | undefined {
    return this.composeSnapshot();
  }

  private composeSnapshot(): NpcStoreSnapshot | undefined {
    const remote = this.remoteSnapshot;
    const local = this.localDataset ?? EMPTY_LOCAL;

    if (!remote && local.data.length === 0) {
      return undefined;
    }

    const merged = mergeNpcEntries(remote?.data ?? [], local.data);
    const timestamp = Math.max(remote?.timestamp ?? 0, local.timestamp ?? 0, 0);

    return {
      remote,
      local,
      all: {
        data: merged,
        timestamp,
      },
    };
  }

  private async loadRemoteSnapshot(): Promise<JsonDatasetSnapshot<NpcRecord[]> | undefined> {
    try {
      const value = await getFromIndexedDB<JsonDatasetSnapshot<NpcRecord[]>>(this.remoteConfig);
      return value ?? undefined;
    } catch (error) {
      this.reportWarning('load remote snapshot', error);
      return undefined;
    }
  }

  private async loadLocalDataset(): Promise<LocalNpcDataset | undefined> {
    try {
      const value = await getFromIndexedDB<LocalNpcDataset>(this.localConfig);
      if (value && Array.isArray(value.data)) {
        return value;
      }
    } catch (error) {
      this.reportWarning('load local dataset', error);
    }
    return undefined;
  }

  private async loadMetadata(): Promise<RefreshMetadata | undefined> {
    try {
      const value = await getFromIndexedDB<RefreshMetadata>(this.metadataConfig);
      return value ?? undefined;
    } catch (error) {
      this.reportWarning('load metadata', error);
      return undefined;
    }
  }

  private async persistRemote(snapshot: JsonDatasetSnapshot<NpcRecord[]> | undefined): Promise<void> {
    if (!snapshot) {
      await clearIndexedDB(this.remoteConfig).catch(this.reportWarning.bind(this, 'clear remote snapshot'));
      return;
    }
    await storeInIndexedDB(this.remoteConfig, snapshot).catch(this.reportWarning.bind(this, 'store remote snapshot'));
  }

  private async persistLocal(dataset: LocalNpcDataset): Promise<void> {
    if (!dataset || dataset.data.length === 0) {
      await clearIndexedDB(this.localConfig).catch(this.reportWarning.bind(this, 'clear local snapshot'));
      return;
    }
    await storeInIndexedDB(this.localConfig, dataset).catch(this.reportWarning.bind(this, 'store local dataset'));
  }

  private async persistMetadata(metadata: RefreshMetadata | undefined): Promise<void> {
    if (!metadata) {
      await clearIndexedDB(this.metadataConfig).catch(this.reportWarning.bind(this, 'clear metadata'));
      return;
    }
    await storeInIndexedDB(this.metadataConfig, metadata).catch(this.reportWarning.bind(this, 'store metadata'));
  }

  private reportWarning(action: string, error: unknown): void {
    console.warn(`Failed to ${action} for NPC store:`, error);
  }
}

class NpcLoader implements LoaderStrategy<NpcStoreSnapshot, RefreshMetadata> {
  private readonly remoteLoader: FetchJsonLoader<NpcRecord[]>;

  constructor(remoteLoader: FetchJsonLoader<NpcRecord[]>) {
    this.remoteLoader = remoteLoader;
  }

  async load(
    context: LoaderContext<NpcStoreSnapshot, RefreshMetadata>,
  ): Promise<LoaderResult<NpcStoreSnapshot, RefreshMetadata>> {
    const local = context.previousSnapshot?.local ?? EMPTY_LOCAL;
    const remoteContext: LoaderContext<JsonDatasetSnapshot<NpcRecord[]>, RefreshMetadata> = {
      previousSnapshot: context.previousSnapshot?.remote,
      metadata: context.metadata,
      force: context.force,
      onProgress: context.onProgress,
    };

    const remoteResult = await this.remoteLoader.load(remoteContext);
    const merged = mergeNpcEntries(remoteResult.snapshot.data, local.data);
    const timestamp = Math.max(remoteResult.snapshot.timestamp, local.timestamp ?? 0, 0);

    return {
      snapshot: {
        remote: remoteResult.snapshot,
        local,
        all: {
          data: merged,
          timestamp,
        },
      },
      metadata: remoteResult.metadata,
    };
  }
}

const storage = new NpcStorageStrategy({
  snapshot: { dbName: 'ArkadiaNpcDB', storeName: 'npcData', key: 'npc' },
  local: { dbName: 'ArkadiaNpcDB', storeName: 'npcData', key: 'npc-local' },
  metadata: { dbName: 'ArkadiaNpcDB', storeName: 'npcData', key: 'npc-metadata' },
});

const loader = new NpcLoader(
  new FetchJsonLoader<NpcRecord[]>({
    url: NPC_DATA_URL,
  }),
);

const store = new DataStore<NpcStoreSnapshot, RefreshMetadata>({
  loader,
  storage,
  ttlMs: TTL_MS,
});

function ensureSnapshot(snapshot: NpcStoreSnapshot | undefined): NpcStoreSnapshot {
  if (snapshot) {
    return snapshot;
  }
  return {
    remote: undefined,
    local: EMPTY_LOCAL,
    all: {
      data: [],
      timestamp: 0,
    },
  };
}

export function subscribe(listener: (snapshot: NpcStoreSnapshot | undefined) => void) {
  return store.subscribe(listener);
}

export async function refresh(options: { force?: boolean } = {}) {
  return store.refresh(options);
}

export async function getSnapshot(): Promise<NpcStoreSnapshot | undefined> {
  return store.getSnapshot();
}

export async function getMetadata(): Promise<RefreshMetadata | undefined> {
  return store.getMetadata();
}

export async function addLocalNpc(npc: NpcRecord) {
  await store.applyLocalChange(current => {
    const snapshot = ensureSnapshot(current);
    const existingLocal = snapshot.local.data;
    if (existingLocal.some(item => npcKey(item) === npcKey(npc))) {
      return snapshot;
    }
    const nextLocal: LocalNpcDataset = {
      data: normalizeLocalEntries([...existingLocal, npc]),
      timestamp: Date.now(),
    };
    return {
      remote: snapshot.remote,
      local: nextLocal,
      all: {
        data: mergeNpcEntries(snapshot.remote?.data ?? [], nextLocal.data),
        timestamp: Math.max(snapshot.remote?.timestamp ?? 0, nextLocal.timestamp),
      },
    };
  });
}

export async function removeLocalNpc(npc: NpcRecord) {
  await store.applyLocalChange(current => {
    const snapshot = ensureSnapshot(current);
    const remaining = snapshot.local.data.filter(item => npcKey(item) !== npcKey(npc));
    if (remaining.length === snapshot.local.data.length) {
      return snapshot;
    }
    const nextLocal: LocalNpcDataset = {
      data: remaining,
      timestamp: Date.now(),
    };
    return {
      remote: snapshot.remote,
      local: nextLocal,
      all: {
        data: mergeNpcEntries(snapshot.remote?.data ?? [], nextLocal.data),
        timestamp: Math.max(snapshot.remote?.timestamp ?? 0, nextLocal.timestamp),
      },
    };
  });
}

export async function setLocalNpcs(list: NpcRecord[]) {
  const normalized = normalizeLocalEntries(list);
  await store.applyLocalChange(current => {
    const snapshot = ensureSnapshot(current);
    const nextLocal: LocalNpcDataset = {
      data: normalized,
      timestamp: Date.now(),
    };
    return {
      remote: snapshot.remote,
      local: nextLocal,
      all: {
        data: mergeNpcEntries(snapshot.remote?.data ?? [], nextLocal.data),
        timestamp: Math.max(snapshot.remote?.timestamp ?? 0, nextLocal.timestamp),
      },
    };
  });
}

export async function clearRemote() {
  await storage.clearRemote();
  await store.applyLocalChange(current => {
    const snapshot = ensureSnapshot(current);
    return {
      remote: undefined,
      local: snapshot.local,
      all: {
        data: mergeNpcEntries([], snapshot.local.data),
        timestamp: snapshot.local.timestamp,
      },
    };
  });
  (store as unknown as { currentMetadata?: RefreshMetadata | undefined }).currentMetadata = undefined;
}

export async function clearLocal() {
  await storage.clearLocal();
  await store.applyLocalChange(current => {
    const snapshot = ensureSnapshot(current);
    return {
      remote: snapshot.remote,
      local: EMPTY_LOCAL,
      all: {
        data: mergeNpcEntries(snapshot.remote?.data ?? [], []),
        timestamp: snapshot.remote?.timestamp ?? 0,
      },
    };
  });
}

export async function clearAll() {
  await store.clear();
}

