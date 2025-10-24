import { SnapshotEventEmitter } from './events';
import {
  LoaderStrategy,
  ProgressListener,
  RefreshMetadata,
  SnapshotListener,
  StorageStrategy,
  SubscriptionOptions,
} from './types';

type Clock = () => number;

type RefreshOptions = {
  force?: boolean;
  onProgress?: ProgressListener;
};

export interface DataStoreOptions<TSnapshot, TMeta extends RefreshMetadata> {
  loader: LoaderStrategy<TSnapshot, TMeta>;
  storage: StorageStrategy<TSnapshot, TMeta>;
  ttlMs?: number;
  clock?: Clock;
}

export class DataStore<TSnapshot, TMeta extends RefreshMetadata = RefreshMetadata> {
  private readonly loader: LoaderStrategy<TSnapshot, TMeta>;
  private readonly storage: StorageStrategy<TSnapshot, TMeta>;
  private readonly ttlMs?: number;
  private readonly clock: Clock;
  private readonly emitter = new SnapshotEventEmitter<TSnapshot>();

  private currentSnapshot: TSnapshot | undefined;
  private currentMetadata: TMeta | undefined;
  private initializationPromise: Promise<void> | null = null;
  private activeRefresh: Promise<TSnapshot | undefined> | null = null;
  private pendingProgressListeners: ProgressListener[] | null = null;
  private readonly progressDispatcher: ProgressListener = (progress, loaded, total) => {
    if (!this.pendingProgressListeners) {
      return;
    }
    for (const listener of [...this.pendingProgressListeners]) {
      listener(progress, loaded, total);
    }
  };

  constructor(options: DataStoreOptions<TSnapshot, TMeta>) {
    this.loader = options.loader;
    this.storage = options.storage;
    this.ttlMs = options.ttlMs;
    this.clock = options.clock ?? (() => Date.now());
  }

  subscribe(listener: SnapshotListener<TSnapshot>, options: SubscriptionOptions = {}): () => void {
    const { emitInitial = true } = options;
    void this.ensureInitialized().then(() => {
      if (emitInitial) {
        listener(this.currentSnapshot);
      }
    });
    return this.emitter.subscribe(listener);
  }

  async refresh(options: RefreshOptions = {}): Promise<TSnapshot | undefined> {
    await this.ensureInitialized();

    if (!options.force && !this.shouldRefresh()) {
      options.onProgress?.(100);
      return this.currentSnapshot;
    }

    if (!this.activeRefresh) {
      this.pendingProgressListeners = [];
      if (options.onProgress) {
        this.pendingProgressListeners.push(options.onProgress);
      }
      this.activeRefresh = this.performRefresh(options.force === true);
    } else if (options.onProgress) {
      if (!this.pendingProgressListeners) {
        this.pendingProgressListeners = [];
      }
      this.pendingProgressListeners.push(options.onProgress);
    }

    try {
      const result = await this.activeRefresh;
      if (options.onProgress && (!this.pendingProgressListeners || this.pendingProgressListeners.length === 0)) {
        options.onProgress(100);
      }
      return result;
    } finally {
      this.activeRefresh = null;
      this.pendingProgressListeners = null;
    }
  }

  async getSnapshot(): Promise<TSnapshot | undefined> {
    await this.ensureInitialized();
    return this.currentSnapshot;
  }

  async applyLocalChange(mutator: (current: TSnapshot | undefined) => TSnapshot): Promise<TSnapshot> {
    await this.ensureInitialized();
    const nextSnapshot = mutator(this.currentSnapshot);
    this.currentSnapshot = nextSnapshot;
    await this.storage.writeSnapshot(this.currentSnapshot);
    this.emitter.emit(this.currentSnapshot);
    return nextSnapshot;
  }

  async clear(): Promise<void> {
    await this.ensureInitialized();
    this.currentSnapshot = undefined;
    this.currentMetadata = undefined;
    await this.storage.clear();
    this.emitter.emit(this.currentSnapshot);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = (async () => {
        const [snapshot, metadata] = await Promise.all([
          this.storage.readSnapshot(),
          this.storage.readMetadata(),
        ]);
        this.currentSnapshot = snapshot;
        this.currentMetadata = metadata ?? undefined;
      })();
    }
    await this.initializationPromise;
  }

  private shouldRefresh(): boolean {
    if (this.currentSnapshot === undefined) {
      return true;
    }
    if (this.currentMetadata === undefined) {
      return true;
    }
    if (this.ttlMs == null) {
      return true;
    }
    const age = this.clock() - this.currentMetadata.refreshedAt;
    return age >= this.ttlMs;
  }

  private async performRefresh(force: boolean): Promise<TSnapshot | undefined> {
    const onProgress = this.pendingProgressListeners ? this.progressDispatcher : undefined;

    const result = await this.loader.load({
      previousSnapshot: this.currentSnapshot,
      metadata: this.currentMetadata,
      force,
      onProgress,
    });

    this.currentSnapshot = result.snapshot;
    const nextMetadata: TMeta = {
      ...(this.currentMetadata ?? {}),
      refreshedAt: this.clock(),
      ...(result.metadata ?? {}),
    } as TMeta;
    this.currentMetadata = nextMetadata;

    await Promise.all([
      this.storage.writeSnapshot(this.currentSnapshot),
      this.storage.writeMetadata(this.currentMetadata),
    ]);

    onProgress?.(100);

    this.emitter.emit(this.currentSnapshot);
    return this.currentSnapshot;
  }
}

export function createDataStoreSingleton<TSnapshot, TMeta extends RefreshMetadata>(
  factory: () => DataStore<TSnapshot, TMeta>,
): () => DataStore<TSnapshot, TMeta> {
  let instance: DataStore<TSnapshot, TMeta> | null = null;
  return () => {
    if (!instance) {
      instance = factory();
    }
    return instance;
  };
}

export function createDatasetStoreRegistry<TKey, TSnapshot, TMeta extends RefreshMetadata>(
  factory: (key: TKey) => DataStore<TSnapshot, TMeta>,
): (key: TKey) => DataStore<TSnapshot, TMeta> {
  const registry = new Map<TKey, DataStore<TSnapshot, TMeta>>();
  return (key: TKey) => {
    let store = registry.get(key);
    if (!store) {
      store = factory(key);
      registry.set(key, store);
    }
    return store;
  };
}
