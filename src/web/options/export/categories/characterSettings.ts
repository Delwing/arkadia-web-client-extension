import { mergeProfessionStates } from "@client/scripts/profession";
import { migrateImportedValue } from '@modules/core/settingsMigrations';
import type { CategoryHandler } from "../categoryHandler";
import { isExcludedLocalStorageKey, parseCharacterStorageKey, resolveCharacterEntryKey } from "../characterKeys";
import type { StorageChangeTracker } from "../storageChanges";
import { sortedByKey } from "../storageKeys";

/** Every character-scoped localStorage key, grouped by character: { character: { storageKey: raw } }. */
export type ExportedCharacterSettings = Record<string, Record<string, string>>;

/** Visit each string entry of a character map, skipping excluded keys. */
function forEachCharacterEntry(
    data: ExportedCharacterSettings,
    visit: (storageKey: string, baseKey: string, raw: string) => void,
): void {
    Object.entries(data).forEach(([character, entries]) => {
        if (!entries || typeof entries !== 'object') return;
        Object.entries(entries).forEach(([key, raw]) => {
            if (typeof raw !== 'string') return;
            const { storageKey, baseKey } = resolveCharacterEntryKey(character, key);
            if (isExcludedLocalStorageKey(baseKey)) return;
            visit(storageKey, baseKey, raw);
        });
    });
}

/**
 * CRDT-merge an incoming profession blob with the stored one. Returns null
 * when the merge yields nothing; throws when either side is not valid JSON.
 */
function mergeProfessionRaw(storageKey: string, incomingRaw: string): string | null {
    const cloudState = JSON.parse(incomingRaw);
    const localRaw = localStorage.getItem(storageKey);
    const localState = localRaw ? JSON.parse(localRaw) : null;
    const merged = mergeProfessionStates(localState, cloudState);
    return merged ? JSON.stringify(merged) : null;
}

/**
 * Write a character map into localStorage. Profession data is CRDT-merged with
 * the local state; with `migrate`, every other value is run through the
 * settings migration (imported values skip the startup migration pass).
 */
export function importCharacterEntries(
    data: ExportedCharacterSettings,
    storage: StorageChangeTracker,
    { migrate }: { migrate: boolean },
): void {
    forEachCharacterEntry(data, (storageKey, baseKey, raw) => {
        if (baseKey === 'profession') {
            try {
                const merged = mergeProfessionRaw(storageKey, raw);
                if (merged) storage.setItem(storageKey, merged);
            } catch {
                storage.setItem(storageKey, raw);
            }
            return;
        }
        // migrateImportedValue is a no-op for keys without a migration.
        storage.setItem(storageKey, migrate ? migrateImportedValue(baseKey, raw) : raw);
    });
}

/**
 * Merge only profession data from cloud characterSettings JSON into local storage.
 * Used before "keep-local" upload to preserve cloud +staz events via CRDT merge.
 */
export function mergeCloudProfessionData(cloudCharacterSettingsJson: string): void {
    try {
        const cloudData = JSON.parse(cloudCharacterSettingsJson) as ExportedCharacterSettings;
        forEachCharacterEntry(cloudData, (storageKey, baseKey, raw) => {
            if (baseKey !== 'profession') return;
            try {
                const merged = mergeProfessionRaw(storageKey, raw);
                if (merged) localStorage.setItem(storageKey, merged);
            } catch {
                // Skip if parse fails
            }
        });
    } catch {
        // Skip if cloud data is invalid
    }
}

export const characterSettingsCategory: CategoryHandler = {
    export(selectedCharacters) {
        const characters: ExportedCharacterSettings = {};
        const selectedSet = new Set(selectedCharacters);
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            const parsed = parseCharacterStorageKey(key);
            if (!parsed?.name) continue;
            if (!selectedSet.has(parsed.name)) continue;
            if (parsed.baseKey && isExcludedLocalStorageKey(parsed.baseKey)) continue;
            const raw = localStorage.getItem(key);
            if (raw === null) continue;
            if (!characters[parsed.name]) characters[parsed.name] = {};
            characters[parsed.name][key] = raw;
        }
        if (Object.keys(characters).length === 0) return null;
        // Canonical envelope: sorted characters and sorted keys within each
        const canonical = sortedByKey(characters);
        for (const name of Object.keys(canonical)) {
            canonical[name] = sortedByKey(canonical[name]);
        }
        return JSON.stringify(canonical);
    },

    import(data, { storage }) {
        importCharacterEntries(data as ExportedCharacterSettings, storage, { migrate: true });
    },
};
