import { characterStorageKeys } from '@modules/core/storageSchema';

/** Device-local caches and runtime state that are never exported or imported. */
const EXCLUDED_LOCAL_STORAGE_KEYS = new Set([
    "cachedMapData",
    "cachedColors",
    "magics",
    "magic_keys",
    "herbs_data",
    "mapperRoomId"
]);

const EXCLUDED_LOCAL_STORAGE_PREFIXES = ["http://", "https://"];

// Set of known character-scoped base keys from the storage schema
const CHARACTER_BASE_KEYS: ReadonlySet<string> = new Set(characterStorageKeys);

export function parseCharacterStorageKey(key: string): { name: string; baseKey: string } | null {
    if (!key) return null;
    if (key.includes("://")) return null;
    const firstColon = key.indexOf(":");
    if (firstColon <= 0) return null;
    const name = key.slice(0, firstColon).trim();
    const baseKey = key.slice(firstColon + 1);
    if (!name || !baseKey) return null;
    // Only recognize as character-scoped if the base key is in the schema
    if (!CHARACTER_BASE_KEYS.has(baseKey)) return null;
    return { name, baseKey };
}

export function isExcludedLocalStorageKey(key: string) {
    if (EXCLUDED_LOCAL_STORAGE_KEYS.has(key)) {
        return true;
    }
    return EXCLUDED_LOCAL_STORAGE_PREFIXES.some(prefix => key.startsWith(prefix));
}

/** Names of every character that has character-scoped data in localStorage, sorted. */
export function collectCharacters(): string[] {
    const names = new Set<string>();
    for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        const parsed = parseCharacterStorageKey(key);
        if (parsed?.name) {
            names.add(parsed.name);
        }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/**
 * Resolve one entry of an exported character map ({ character: { key: raw } })
 * to its localStorage key. Entries may hold the full `Character:key` storage
 * key or only the base key.
 */
export function resolveCharacterEntryKey(character: string, key: string): { storageKey: string; baseKey: string } {
    const storageKey = key.includes(":") ? key : `${character}:${key}`;
    const baseIdx = storageKey.lastIndexOf(":");
    const baseKey = baseIdx > -1 ? storageKey.slice(baseIdx + 1) : storageKey;
    return { storageKey, baseKey };
}
