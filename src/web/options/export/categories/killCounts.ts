import { exportAllKillRecords, importAllKillRecords, migrateFromLocalStorage, type KillRecord } from "@client/scripts/killLifetimeStorage.ts";
import type { CategoryHandler } from "../categoryHandler";
import { exportCharacterScopedKey, importCharacterScopedKey } from "../storageKeys";

/** v2: IndexedDB records. v1 (still accepted on import): CharacterName -> kill_counter JSON. */
export type ExportedKillCounts = Record<string, string> | { _v: 2; records: KillRecord[] };

export const killCountsCategory: CategoryHandler = {
    async export(selectedCharacters) {
        const selectedSet = new Set(selectedCharacters);
        try {
            const allRecords = await exportAllKillRecords();
            const filtered = allRecords.filter(r => selectedSet.has(r.character));
            if (filtered.length > 0) {
                return JSON.stringify({_v: 2, records: filtered});
            }
        } catch {
            // Fallback to localStorage if IndexedDB fails
        }
        // Fallback: export from localStorage (pre-migration data)
        return exportCharacterScopedKey('kill_counter', selectedCharacters);
    },

    async import(data, { storage }) {
        if (data && typeof data === 'object' && '_v' in data && (data as any)._v === 2) {
            // New format: IndexedDB records with date info
            const records = (data as {_v: number; records: KillRecord[]}).records;
            if (Array.isArray(records) && records.length > 0) {
                // Move each character's pre-IndexedDB totals in first: the
                // aggregate written below would otherwise replace them, and a
                // later migration would count that aggregate a second time.
                for (const character of new Set(records.map(r => r.character))) {
                    await migrateFromLocalStorage(character);
                }
                await importAllKillRecords(records);
                // Also update localStorage for backward compat. Recompute from
                // the store after the merge — importAllKillRecords keeps the
                // higher count per record, so the imported payload alone may
                // undercount what the store now holds.
                const affected = new Set(records.map(r => r.character));
                const merged = (await exportAllKillRecords()).filter(r => affected.has(r.character));
                const byChar: Record<string, Record<string, number>> = {};
                for (const r of merged) {
                    if (!byChar[r.character]) byChar[r.character] = {};
                    byChar[r.character][r.mob] = (byChar[r.character][r.mob] ?? 0) + r.count;
                }
                for (const [charName, totals] of Object.entries(byChar)) {
                    storage.setItem(`${charName}:kill_counter`, JSON.stringify(totals));
                }
            }
        } else {
            // Old format: localStorage-based Record<string, string>
            importCharacterScopedKey('kill_counter', data as Record<string, unknown>, storage);
        }
    },
};
