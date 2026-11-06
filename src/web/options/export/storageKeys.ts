import type { StorageChangeTracker } from './storageChanges';

/**
 * Rebuild an object with keys in sorted order so JSON.stringify output is
 * canonical. Export envelopes are checksummed and compared across devices —
 * localStorage iteration order differs between browsers/profiles, and without
 * canonical ordering two devices holding identical data would produce
 * different checksums (phantom changes and spurious conflicts).
 */
export function sortedByKey<T>(obj: Record<string, T>): Record<string, T> {
    const result: Record<string, T> = {};
    for (const key of Object.keys(obj).sort()) {
        result[key] = obj[key];
    }
    return result;
}

/** Export categories backed by whole global localStorage keys: { key: raw }. */
export function exportGlobalKeys(keys: readonly string[]): string | null {
    const result: Record<string, string> = {};
    for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (raw) result[key] = raw;
    }
    return Object.keys(result).length > 0 ? JSON.stringify(result) : null;
}

export function importGlobalKeys(keys: readonly string[], data: Record<string, unknown>, storage: StorageChangeTracker): void {
    for (const key of keys) {
        const value = data[key];
        if (value && typeof value === 'string') storage.setItem(key, value);
    }
}

/** Export categories backed by one character-scoped localStorage key: { character: raw }. */
export function exportCharacterScopedKey(baseKey: string, selectedCharacters: string[]): string | null {
    const result: Record<string, string> = {};
    const selectedSet = new Set(selectedCharacters);
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const colonIdx = key.indexOf(':');
        if (colonIdx <= 0) continue;
        if (key.slice(colonIdx + 1) !== baseKey) continue;
        const charName = key.slice(0, colonIdx);
        if (!selectedSet.has(charName)) continue;
        const raw = localStorage.getItem(key);
        if (raw) result[charName] = raw;
    }
    return Object.keys(result).length > 0 ? JSON.stringify(sortedByKey(result)) : null;
}

export function importCharacterScopedKey(baseKey: string, data: Record<string, unknown>, storage: StorageChangeTracker): void {
    Object.entries(data).forEach(([charName, raw]) => {
        if (typeof raw !== 'string') return;
        storage.setItem(`${charName}:${baseKey}`, raw);
    });
}

/** Parse a stored JSON object, falling back to an empty object. */
export function readJsonObject(key: string): Record<string, unknown> {
    const existing = localStorage.getItem(key);
    if (!existing) return {};
    try {
        return JSON.parse(existing);
    } catch {
        return {};
    }
}
