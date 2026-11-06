/** Open a single-store IndexedDB database keyed by `id`, creating the store when missing. */
export function openKeyedStore(dbName: string, storeName: string, label: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(storeName)) {
                db.createObjectStore(storeName, { keyPath: "id" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error(`Failed to open ${label} IndexedDB`));
    });
}
