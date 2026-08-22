import { DataStore, createDataStoreSingleton, createDatasetStoreRegistry } from '@modules/data/dataStore/DataStore';
import { SnapshotEventEmitter } from '@modules/data/dataStore/events';
import { LoaderStrategy, RefreshMetadata, StorageStrategy } from '@modules/data/dataStore/types';

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

  it('refreshes when no snapshot exists (undefined snapshot forces refresh regardless of TTL)', async () => {
    const now = 10_000;
    // Storage has metadata but no snapshot
    const storage = new InMemoryStorage(undefined, { refreshedAt: now });
    const freshSnapshot: Snapshot = { value: 77 };
    const loader: LoaderStrategy<Snapshot, Metadata> = {
      load: jest.fn(async () => ({ snapshot: freshSnapshot })),
    };
    const clock = () => now;
    const store = new DataStore({ loader, storage, ttlMs: 9_999_999, clock });

    const snapshot = await store.refresh();

    expect(loader.load).toHaveBeenCalledTimes(1);
    expect(snapshot).toEqual(freshSnapshot);
  });

  it('refreshes when no metadata exists (undefined metadata forces refresh)', async () => {
    const now = 10_000;
    // Storage has snapshot but no metadata
    const storage = new InMemoryStorage({ value: 5 }, undefined);
    const freshSnapshot: Snapshot = { value: 55 };
    const loader: LoaderStrategy<Snapshot, Metadata> = {
      load: jest.fn(async () => ({ snapshot: freshSnapshot })),
    };
    const clock = () => now;
    const store = new DataStore({ loader, storage, ttlMs: 9_999_999, clock });

    const snapshot = await store.refresh();

    expect(loader.load).toHaveBeenCalledTimes(1);
    expect(snapshot).toEqual(freshSnapshot);
  });

  it('always refreshes when no TTL is configured', async () => {
    const now = 10_000;
    const storage = new InMemoryStorage({ value: 5 }, { refreshedAt: now });
    const freshSnapshot: Snapshot = { value: 88 };
    const loader: LoaderStrategy<Snapshot, Metadata> = {
      load: jest.fn(async () => ({ snapshot: freshSnapshot })),
    };
    const clock = () => now;
    // ttlMs is deliberately not set
    const store = new DataStore({ loader, storage, clock });

    const snapshot = await store.refresh();

    expect(loader.load).toHaveBeenCalledTimes(1);
    expect(snapshot).toEqual(freshSnapshot);
  });

  it('triggers refresh when age is exactly equal to ttlMs (boundary condition)', async () => {
    const now = 10_000;
    const ttlMs = 500;
    // refreshedAt = now - ttlMs means age === ttlMs exactly
    const storage = new InMemoryStorage({ value: 5 }, { refreshedAt: now - ttlMs });
    const freshSnapshot: Snapshot = { value: 99 };
    const loader: LoaderStrategy<Snapshot, Metadata> = {
      load: jest.fn(async () => ({ snapshot: freshSnapshot })),
    };
    const clock = () => now;
    const store = new DataStore({ loader, storage, ttlMs, clock });

    const snapshot = await store.refresh();

    expect(loader.load).toHaveBeenCalledTimes(1);
    expect(snapshot).toEqual(freshSnapshot);
  });

  it('coalesces concurrent refresh calls so loader is only called once', async () => {
    const storage = new InMemoryStorage(undefined, undefined);
    const freshSnapshot: Snapshot = { value: 42 };
    let resolveLoad!: () => void;
    const loadPromise = new Promise<void>((resolve) => { resolveLoad = resolve; });

    const loader: LoaderStrategy<Snapshot, Metadata> = {
      load: jest.fn(async () => {
        await loadPromise;
        return { snapshot: freshSnapshot };
      }),
    };
    const store = new DataStore({ loader, storage, ttlMs: 10_000 });

    const p1 = store.refresh();
    const p2 = store.refresh();

    resolveLoad();

    const [result1, result2] = await Promise.all([p1, p2]);

    expect(loader.load).toHaveBeenCalledTimes(1);
    expect(result1).toEqual(freshSnapshot);
    expect(result2).toEqual(freshSnapshot);
  });

  it('delivers progress updates to both callers on concurrent refreshes', async () => {
    // Both callers register before the loader emits progress.
    // We use a gate: the loader waits for a "proceed" signal before emitting progress.
    // We open that gate only after BOTH refresh() calls have registered their listeners
    // (confirmed by waiting for ensureInitialized on both + one microtask flush).
    const storage = new InMemoryStorage(undefined, undefined);

    let openGate!: () => void;
    const gatePromise = new Promise<void>((r) => { openGate = r; });

    const loader: LoaderStrategy<Snapshot, Metadata> = {
      load: jest.fn(async (ctx) => {
        // Wait until the test confirms both callers are registered
        await gatePromise;
        // Emit a mid-stream progress event
        ctx.onProgress?.(60);
        return { snapshot: { value: 1 } };
      }),
    };
    const store = new DataStore({ loader, storage });

    const progressA: number[] = [];
    const progressB: number[] = [];

    const p1 = store.refresh({ onProgress: (p) => progressA.push(p) });
    const p2 = store.refresh({ onProgress: (p) => progressB.push(p) });

    // Flush microtasks so both refresh() calls complete their setup
    // (ensureInitialized + shouldRefresh + pendingProgressListeners registration)
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Now open the gate — both listeners are registered
    openGate();

    await Promise.all([p1, p2]);

    // Both callers should have received the 60 emitted from inside the loader
    expect(progressA).toContain(60);
    expect(progressB).toContain(60);
    // Both callers should have received the final 100 completion signal
    expect(progressA).toContain(100);
    expect(progressB).toContain(100);
  });

  it('does not overwrite local changes made during an in-flight refresh', async () => {
    const storage = new InMemoryStorage(undefined, undefined);
    let resolveLoad!: () => void;
    const loadPromise = new Promise<void>((resolve) => { resolveLoad = resolve; });

    const loaderSnapshot: Snapshot = { value: 999 };
    const loader: LoaderStrategy<Snapshot, Metadata> = {
      load: jest.fn(async () => {
        await loadPromise;
        return { snapshot: loaderSnapshot };
      }),
    };
    const store = new DataStore({ loader, storage });

    const refreshPromise = store.refresh();

    // Apply a local change while refresh is in-flight
    await store.applyLocalChange(() => ({ value: 7 }));

    // Now let the loader finish
    resolveLoad();
    await refreshPromise;

    // The local change should have won — snapshot is 7, not 999
    const snapshot = await store.getSnapshot();
    expect(snapshot).toEqual({ value: 7 });

    // Metadata should still be updated (refreshedAt written)
    const metadata = await store.getMetadata();
    expect(metadata?.refreshedAt).toBeDefined();
  });

  it('does not emit the stored snapshot when subscribing with emitInitial: false', async () => {
    const storage = new InMemoryStorage({ value: 10 }, { refreshedAt: 0 });
    const loader: LoaderStrategy<Snapshot, Metadata> = {
      load: jest.fn(async () => ({ snapshot: { value: 10 } })),
    };
    const store = new DataStore({ loader, storage, ttlMs: 9_999_999 });

    const received: Array<Snapshot | undefined> = [];
    store.subscribe((snapshot) => received.push(snapshot), { emitInitial: false });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(received).toHaveLength(0);
  });

  it('stops delivering updates after unsubscribing', async () => {
    const storage = new InMemoryStorage({ value: 0 }, { refreshedAt: 0 });
    const loader: LoaderStrategy<Snapshot, Metadata> = {
      load: jest.fn(async () => ({ snapshot: { value: 100 } })),
    };
    const store = new DataStore({ loader, storage, ttlMs: 9_999_999 });

    const received: Array<Snapshot | undefined> = [];
    const unsubscribe = store.subscribe((snapshot) => received.push(snapshot), { emitInitial: false });

    unsubscribe();

    await store.applyLocalChange(() => ({ value: 1 }));
    await store.applyLocalChange(() => ({ value: 2 }));

    expect(received).toHaveLength(0);
  });

  it('getSnapshot returns the current snapshot', async () => {
    const initial: Snapshot = { value: 55 };
    const storage = new InMemoryStorage(initial, { refreshedAt: 0 });
    const loader: LoaderStrategy<Snapshot, Metadata> = {
      load: jest.fn(async () => ({ snapshot: { value: 0 } })),
    };
    const store = new DataStore({ loader, storage, ttlMs: 9_999_999 });

    const snapshot = await store.getSnapshot();

    expect(snapshot).toEqual(initial);
  });

  it('getMetadata returns the current metadata', async () => {
    const metadata: Metadata = { refreshedAt: 12345, hash: 'v1' };
    const storage = new InMemoryStorage({ value: 1 }, metadata);
    const loader: LoaderStrategy<Snapshot, Metadata> = {
      load: jest.fn(async () => ({ snapshot: { value: 1 } })),
    };
    const store = new DataStore({ loader, storage, ttlMs: 9_999_999 });

    const result = await store.getMetadata();

    expect(result).toEqual(metadata);
  });

  it('clear() resets snapshot and metadata, calls storage.clear(), and notifies subscribers with undefined', async () => {
    const storage = new InMemoryStorage({ value: 10 }, { refreshedAt: 100 });
    const loader: LoaderStrategy<Snapshot, Metadata> = {
      load: jest.fn(async () => ({ snapshot: { value: 10 } })),
    };
    const store = new DataStore({ loader, storage, ttlMs: 9_999_999 });

    const received: Array<Snapshot | undefined> = [];
    store.subscribe((s) => received.push(s), { emitInitial: false });

    await store.clear();

    expect(storage.cleared).toBe(1);
    expect(storage.snapshot).toBeUndefined();
    expect(storage.metadata).toBeUndefined();

    const snapshot = await store.getSnapshot();
    expect(snapshot).toBeUndefined();

    const metadata = await store.getMetadata();
    expect(metadata).toBeUndefined();

    expect(received).toEqual([undefined]);
  });

  it('merges partial metadata returned by loader with existing metadata and adds refreshedAt', async () => {
    const now = 5_000;
    const storage = new InMemoryStorage(undefined, { refreshedAt: 0, hash: 'old-hash' });
    const loader: LoaderStrategy<Snapshot, Metadata> = {
      load: jest.fn(async () => ({
        snapshot: { value: 1 },
        metadata: { hash: 'new-hash' },
      })),
    };
    const clock = () => now;
    const store = new DataStore({ loader, storage, clock });

    await store.refresh();

    const metadata = await store.getMetadata();
    expect(metadata?.hash).toBe('new-hash');
    expect(metadata?.refreshedAt).toBe(now);
  });

  it('initialization is idempotent — storage is read only once even with multiple calls', async () => {
    let readCount = 0;
    const storage: StorageStrategy<Snapshot, Metadata> = {
      readSnapshot: jest.fn(async () => {
        readCount++;
        return { value: 1 };
      }),
      writeSnapshot: jest.fn(async () => {}),
      readMetadata: jest.fn(async () => ({ refreshedAt: 9_999_999 })),
      writeMetadata: jest.fn(async () => {}),
      clear: jest.fn(async () => {}),
    };
    const loader: LoaderStrategy<Snapshot, Metadata> = {
      load: jest.fn(async () => ({ snapshot: { value: 1 } })),
    };
    const store = new DataStore({ loader, storage, ttlMs: 9_999_999 });

    await store.getSnapshot();
    await store.getSnapshot();
    await store.getMetadata();
    await store.getSnapshot();

    // readSnapshot should have been called exactly once during initialization
    expect(readCount).toBe(1);
  });

  it('propagates loader errors to the refresh() caller', async () => {
    const storage = new InMemoryStorage(undefined, undefined);
    const loaderError = new Error('load failed');
    const loader: LoaderStrategy<Snapshot, Metadata> = {
      load: jest.fn(async () => { throw loaderError; }),
    };
    const store = new DataStore({ loader, storage });

    await expect(store.refresh()).rejects.toThrow('load failed');
  });
});

describe('SnapshotEventEmitter', () => {
  it('emits to all subscribed listeners', () => {
    const emitter = new SnapshotEventEmitter<number>();
    const calls: number[] = [];

    emitter.subscribe((v) => calls.push(v ?? -1));
    emitter.subscribe((v) => calls.push((v ?? -1) * 10));

    emitter.emit(5);

    expect(calls).toEqual([5, 50]);
  });

  it('unsubscribing removes only that listener', () => {
    const emitter = new SnapshotEventEmitter<number>();
    const aValues: Array<number | undefined> = [];
    const bValues: Array<number | undefined> = [];

    const unsubA = emitter.subscribe((v) => aValues.push(v));
    emitter.subscribe((v) => bValues.push(v));

    emitter.emit(1);
    unsubA();
    emitter.emit(2);

    expect(aValues).toEqual([1]);
    expect(bValues).toEqual([1, 2]);
  });

  it('listener added during emit is NOT called in the same emit cycle', () => {
    const emitter = new SnapshotEventEmitter<number>();
    const calls: number[] = [];

    emitter.subscribe((v) => {
      calls.push(v ?? -1);
      // This listener is added while emit is iterating; should not be called this cycle
      emitter.subscribe((v2) => calls.push((v2 ?? -1) * 100));
    });

    emitter.emit(3);

    // Only the original listener fires for this emit
    expect(calls).toEqual([3]);

    // On the next emit, the newly added listener also fires
    emitter.emit(4);
    expect(calls).toEqual([3, 4, 400]);
  });

  it('listener removed during emit still fires in the same emit cycle', () => {
    const emitter = new SnapshotEventEmitter<number>();
    const calls: number[] = [];
    // eslint-disable-next-line prefer-const -- assigned below, but A's handler closes over it first
    let unsubB!: () => void;

    emitter.subscribe((v) => {
      calls.push(v ?? -1);
      // Remove B from inside A's handler — but B was already captured in the spread
      unsubB();
    });
    unsubB = emitter.subscribe((v) => {
      calls.push((v ?? -1) * 10);
    });

    emitter.emit(2);

    // Both A and B fired because the listener list was spread before iteration
    expect(calls).toEqual([2, 20]);

    // B is now gone — should not fire on subsequent emit
    calls.length = 0;
    emitter.emit(5);
    expect(calls).toEqual([5]);
  });

  it('does not throw when emitting with no listeners', () => {
    const emitter = new SnapshotEventEmitter<number>();
    expect(() => emitter.emit(42)).not.toThrow();
  });
});

describe('createDatasetStoreRegistry', () => {
  it('returns the same store instance for the same key', () => {
    const loader: LoaderStrategy<Snapshot, Metadata> = {
      load: jest.fn(async () => ({ snapshot: { value: 0 } })),
    };
    const registry = createDatasetStoreRegistry((_key: string) =>
      new DataStore({ loader, storage: new InMemoryStorage(), ttlMs: 1000 }),
    );

    const storeA1 = registry('alpha');
    const storeA2 = registry('alpha');

    expect(storeA1).toBe(storeA2);
  });

  it('returns different store instances for different keys', () => {
    const loader: LoaderStrategy<Snapshot, Metadata> = {
      load: jest.fn(async () => ({ snapshot: { value: 0 } })),
    };
    const registry = createDatasetStoreRegistry((_key: string) =>
      new DataStore({ loader, storage: new InMemoryStorage(), ttlMs: 1000 }),
    );

    const storeA = registry('alpha');
    const storeB = registry('beta');

    expect(storeA).not.toBe(storeB);
  });
});
