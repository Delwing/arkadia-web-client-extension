import { characterStorageKeys, globalStorageKeys } from '@modules/core/storageSchema';
import { globalStorage, characterStorage } from '@modules/core/storage';

interface GlobalChange { key: string; oldRaw: string | null; newRaw: string }
interface CharacterChange { storageKey: string; baseKey: string; oldRaw: string | null; newRaw: string }

function parseRaw(raw: string): any {
    try { return JSON.parse(raw); } catch { return raw; }
}

/**
 * Records raw localStorage writes made by an import and, afterwards, fires the
 * TypedStorage listeners for them. Direct localStorage.setItem() bypasses
 * TypedStorage listeners, so the UI would not pick up imported values without
 * this explicit notification.
 */
export class StorageChangeTracker {
    private readonly globalChanges: GlobalChange[] = [];
    private readonly characterChanges: CharacterChange[] = [];

    recordGlobal(key: string, oldRaw: string | null, newRaw: string): void {
        this.globalChanges.push({ key, oldRaw, newRaw });
    }

    recordCharacter(storageKey: string, baseKey: string, oldRaw: string | null, newRaw: string): void {
        this.characterChanges.push({ storageKey, baseKey, oldRaw, newRaw });
    }

    /** Write a key and record it; a key containing ':' counts as character-scoped. */
    setItem(key: string, value: string): void {
        const oldRaw = localStorage.getItem(key);
        localStorage.setItem(key, value);
        const colonIdx = key.lastIndexOf(':');
        if (colonIdx > -1) {
            this.recordCharacter(key, key.slice(colonIdx + 1), oldRaw, value);
        } else {
            this.recordGlobal(key, oldRaw, value);
        }
    }

    /**
     * Fire listeners for every changed schema key: global keys always, character
     * keys only for the current character.
     */
    notify(): void {
        const globalKeySet = new Set(globalStorageKeys as readonly string[]);
        for (const { key, oldRaw, newRaw } of this.globalChanges) {
            if (!globalKeySet.has(key)) continue;
            if (oldRaw === newRaw) continue;
            const oldValue = oldRaw !== null ? parseRaw(oldRaw) : undefined;
            globalStorage.fireListeners(key as any, parseRaw(newRaw), oldValue);
        }

        const currentChar = characterStorage.getCharacter();
        if (!currentChar) return;
        const charKeySet = new Set(characterStorageKeys as readonly string[]);
        for (const { storageKey, baseKey, oldRaw, newRaw } of this.characterChanges) {
            if (!charKeySet.has(baseKey)) continue;
            if (oldRaw === newRaw) continue;
            if (!storageKey.startsWith(currentChar + ':')) continue;
            const oldValue = oldRaw !== null ? parseRaw(oldRaw) : undefined;
            characterStorage.fireListeners(baseKey as any, parseRaw(newRaw), oldValue);
        }
    }
}
