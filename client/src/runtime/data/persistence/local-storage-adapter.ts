import type { DataPersistenceAdapter } from './types';

export class LocalStoragePersistenceAdapter<T> implements DataPersistenceAdapter<T> {
    constructor(
        private readonly key: string,
        private readonly serialize: (value: T) => string = JSON.stringify,
        private readonly deserialize: (value: string) => T = JSON.parse as (value: string) => T,
    ) {}

    async read(): Promise<T | undefined> {
        const storage = this.getStorage();
        const raw = storage.getItem(this.key);
        if (raw === null) {
            return undefined;
        }

        return this.deserialize(raw);
    }

    async write(value: T): Promise<void> {
        const storage = this.getStorage();
        storage.setItem(this.key, this.serialize(value));
    }

    async clear(): Promise<void> {
        const storage = this.getStorage();
        storage.removeItem(this.key);
    }

    private getStorage(): Storage {
        const storage = typeof window !== 'undefined' ? window.localStorage : (globalThis as unknown as { localStorage?: Storage }).localStorage;
        if (!storage) {
            throw new Error('LocalStorage is not available in this environment.');
        }

        return storage;
    }
}
