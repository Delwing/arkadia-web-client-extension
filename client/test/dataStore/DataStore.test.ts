import { DataStore, createDataStoreSingleton } from '../../src/dataStore/DataStore';
import { LoaderStrategy, RefreshMetadata, StorageStrategy } from '../../src/dataStore/types';

type Snapshot = { value: number };

type Metadata = RefreshMetadata;

class InMemoryStorage implements StorageStrategy<Snapshot, Metadata> {
  public snapshot: Snapshot | undefined;
  public metadata: Metadata | undefined;
  public snapshotWrites = 0;
  public metadataWrites = 0;
  public cleared = 0;

  constructor(snapshot?: Snapshot, metadata?: Metadata) {
    this.snapshot = snapshot;
    this.metadata = metadata;
  }

  async readSnapshot(): Promise<Snapshot | undefined> {
    return this.snapshot;
  }

  async writeSnapshot(snapshot: Snapshot | undefined): Promise<void> {
    this.snapshot = snapshot;
    this.snapshotWrites += 1;
  }

  async readMetadata(): Promise<Metadata | undefined> {
    return this.metadata;
  }

  async writeMetadata(metadata: Metadata | undefined): Promise<void> {
    this.metadata = metadata;
    this.metadataWrites += 1;
  }

  async clear(): Promise<void> {
    this.snapshot = undefined;
    this.metadata = undefined;
    this.cleared += 1;
  }
}

describe('DataStore', () => {
  it('emits the stored snapshot immediately when subscribing', async () => {
    const initialSnapshot: Snapshot = { value: 42 };
    const metadata: Metadata = { refreshedAt: 1 };
    const storage = new InMemoryStorage(initialSnapshot, metadata);
    const loader: LoaderStrategy<Snapshot, Metadata> = {
      load: jest.fn(async () => ({ snapshot: initialSnapshot })),
    };

    const store = new DataStore({ loader, storage, ttlMs: 1000 });

    const received: Array<Snapshot | undefined> = [];
    store.subscribe((snapshot) => {
      received.push(snapshot);
    }, { emitInitial: true });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(received).toEqual([initialSnapshot]);
    expect(loader.load).not.toHaveBeenCalled();
  });

  it('skips refresh when TTL has not expired', async () => {
    const now = 10_000;
    const metadata: Metadata = { refreshedAt: now - 100 };
    const storage = new InMemoryStorage({ value: 5 }, metadata);
    const loader: LoaderStrategy<Snapshot, Metadata> = {
      load: jest.fn(),
    };
    const clock = () => now;
    const store = new DataStore({ loader, storage, ttlMs: 1_000, clock });

    const snapshot = await store.refresh();

    expect(snapshot).toEqual({ value: 5 });
    expect(loader.load).not.toHaveBeenCalled();
  });

  it('forces refresh even when TTL is valid', async () => {
    const now = 5_000;
    const storage = new InMemoryStorage({ value: 1 }, { refreshedAt: now });
    const loaderResult: Snapshot = { value: 99 };
    const loader: LoaderStrategy<Snapshot, Metadata> = {
      load: jest.fn(async () => ({ snapshot: loaderResult, metadata: { hash: 'abc' } })),
    };
    let currentTime = now;
    const clock = () => currentTime;
    const store = new DataStore({ loader, storage, ttlMs: 10_000, clock });

    currentTime += 10;
    const refreshed = await store.refresh({ force: true });

    expect(loader.load).toHaveBeenCalledTimes(1);
    expect(refreshed).toEqual(loaderResult);
    expect(storage.snapshot).toEqual(loaderResult);
    expect(storage.metadata?.hash).toBe('abc');
    expect(storage.metadata?.refreshedAt).toBe(currentTime);
    expect(storage.snapshotWrites).toBe(1);
    expect(storage.metadataWrites).toBe(1);
  });

  it('propagates changes to all subscribers', async () => {
    const storage = new InMemoryStorage({ value: 0 }, { refreshedAt: 0 });
    const loader: LoaderStrategy<Snapshot, Metadata> = {
      load: jest.fn(async () => ({ snapshot: { value: 123 } })),
    };
    const store = new DataStore({ loader, storage, ttlMs: 1000 });

    const a: Array<Snapshot | undefined> = [];
    const b: Array<Snapshot | undefined> = [];

    store.subscribe((snapshot) => a.push(snapshot));
    store.subscribe((snapshot) => b.push(snapshot));

    await new Promise((resolve) => setTimeout(resolve, 0));

    await store.applyLocalChange((current) => ({ value: (current?.value ?? 0) + 1 }));

    expect(a).toEqual([{ value: 0 }, { value: 1 }]);
    expect(b).toEqual([{ value: 0 }, { value: 1 }]);
  });

  it('supports creating singleton stores per dataset', () => {
    const storageFactory = () => new InMemoryStorage({ value: 0 }, { refreshedAt: 0 });
    const loader: LoaderStrategy<Snapshot, Metadata> = {
      load: jest.fn(async () => ({ snapshot: { value: 0 } })),
    };

    const createSingleton = createDataStoreSingleton(() => new DataStore({
      loader,
      storage: storageFactory(),
      ttlMs: 1000,
    }));

    const first = createSingleton();
    const second = createSingleton();

    expect(first).toBe(second);
  });
});
