export interface RefreshMetadata {
  refreshedAt: number;
  hash?: string;
}

export type ProgressListener = (progress: number, loaded?: number, total?: number) => void;

export interface LoaderContext<TSnapshot, TMeta extends RefreshMetadata> {
  previousSnapshot?: TSnapshot;
  metadata?: TMeta;
  force?: boolean;
  onProgress?: ProgressListener;
}

export interface LoaderResult<TSnapshot, TMeta extends RefreshMetadata> {
  snapshot: TSnapshot;
  metadata?: Partial<TMeta>;
}

export interface LoaderStrategy<TSnapshot, TMeta extends RefreshMetadata = RefreshMetadata> {
  load(context: LoaderContext<TSnapshot, TMeta>): Promise<LoaderResult<TSnapshot, TMeta>>;
}

export interface StorageStrategy<TSnapshot, TMeta extends RefreshMetadata = RefreshMetadata> {
  readSnapshot(): Promise<TSnapshot | undefined>;
  writeSnapshot(snapshot: TSnapshot | undefined): Promise<void>;
  readMetadata(): Promise<TMeta | undefined>;
  writeMetadata(metadata: TMeta | undefined): Promise<void>;
  clear(): Promise<void>;
}

export interface SubscriptionOptions {
  emitInitial?: boolean;
}

export type SnapshotListener<TSnapshot> = (snapshot: TSnapshot | undefined) => void;
