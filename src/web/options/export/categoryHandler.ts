import type { StorageChangeTracker } from './storageChanges';

export interface ImportContext {
    /** Tracked localStorage writes; listeners fire once the category is imported. */
    storage: StorageChangeTracker;
    /** Leave device-scoped keys (layout, interface settings…) untouched. */
    skipDeviceScoped: boolean;
}

/**
 * Hand-written export/import for one `customSync` category of the registry
 * (IndexedDB-backed data, CRDT merges, key splitting). Categories without
 * customSync go through the generic key handling in `storageKeys`.
 */
export interface CategoryHandler {
    /** The category's data as a JSON string, or null when there is nothing to export. */
    export(selectedCharacters: string[]): MaybePromise<string | null>;
    /** Apply already-parsed category data. */
    import(data: any, ctx: ImportContext): MaybePromise<void>;
}

/**
 * Handlers backed only by localStorage stay synchronous, so a batch of
 * category exports settles in the same order as before the handlers existed.
 */
export type MaybePromise<T> = T | Promise<T>;
