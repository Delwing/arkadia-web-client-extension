/**
 * Sync adapters for data kept in localStorage. Each lists local items and
 * writes merged items back through the same storage the features use, so
 * storage listeners (and the UI) see applied values.
 * See docs/dev/SYNC_V2_PLAN.md, sections 4.1, 5 and 6.
 */

import { characterStorage, globalStorage } from '@modules/core/storage';
import { triggerSettingsReload } from '@modules/device/deviceStorage';
import { getKeymapStore, getActiveKeymapId, saveKeymapStore } from '@modules/core/keymapStorage';
import type { Keymap, KeymapStore } from '@modules/core/keymapTypes';
import { mergeProfessionStates, type ProfessionState } from '@client/scripts/profession';
import type { PersonEditEvent, PeopleLocalEventsSnapshot } from '@client/types/people';
import {
    applyCounterChange,
    characterFromScope,
    characterScope,
    deviceScope,
    GLOBAL_SCOPE,
    type ItemChange,
    type LocalItem,
    type UserDataType,
} from '@modules/userData/types';
import {
    collectCharacters,
    exportCategory,
    importCategory,
    isExcludedLocalStorageKey,
    parseCharacterStorageKey,
} from '@web/options/exportUtils';

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function parse(raw: string | null): unknown {
    if (raw === null) return undefined;
    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
}

function readGlobal<T>(key: string): T | undefined {
    return parse(localStorage.getItem(key)) as T | undefined;
}

function writeGlobal(key: string, value: unknown): void {
    // Through globalStorage so its listeners (and the UI) see the change.
    globalStorage.set(key as never, value as never);
}

function readCharacterKey<T>(character: string, baseKey: string): T | undefined {
    return parse(localStorage.getItem(`${character}:${baseKey}`)) as T | undefined;
}

/**
 * Write a character-scoped key. For the active character this goes through
 * characterStorage so its listeners fire; other characters are written
 * directly, as nothing is listening to them.
 */
function writeCharacterKey(character: string, baseKey: string, value: unknown): void {
    if (character === characterStorage.getCharacter()) {
        if (value === undefined) characterStorage.remove(baseKey as never);
        else characterStorage.set(baseKey as never, value as never);
        return;
    }
    const storageKey = `${character}:${baseKey}`;
    if (value === undefined) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, JSON.stringify(value));
}

function characterOf(change: { scope: string }): string | null {
    return characterFromScope(change.scope);
}

/** Group changes by character, skipping any that aren't character-scoped. */
function byCharacter<V>(changes: ItemChange<V>[]): Map<string, ItemChange<V>[]> {
    const groups = new Map<string, ItemChange<V>[]>();
    for (const change of changes) {
        const character = characterOf(change);
        if (!character) continue;
        const list = groups.get(character) ?? [];
        list.push(change);
        groups.set(character, list);
    }
    return groups;
}

// ---------------------------------------------------------------------------
// Global lists with ids (triggers, aliases, automation)
// ---------------------------------------------------------------------------

interface WithId {
    id?: string;
}

/** Items saved before ids existed are keyed by their content. */
function listItemKey(item: WithId): string {
    return item.id ? item.id : `content:${JSON.stringify(item)}`;
}

export function listType(id: string, storageKey: string): UserDataType<WithId> {
    return {
        id,
        scope: 'global',
        rule: { kind: 'newest' },
        deletable: true,
        read() {
            const list = readGlobal<WithId[]>(storageKey);
            if (!Array.isArray(list)) return [];
            return list.map(item => ({ scope: GLOBAL_SCOPE, key: listItemKey(item), value: item }));
        },
        write(changes) {
            const list = readGlobal<WithId[]>(storageKey);
            const current = Array.isArray(list) ? [...list] : [];
            for (const change of changes) {
                const index = current.findIndex(item => listItemKey(item) === change.key);
                if (change.deleted) {
                    if (index >= 0) current.splice(index, 1);
                } else if (index >= 0) {
                    current[index] = change.value!;
                } else {
                    current.push(change.value!);
                }
            }
            writeGlobal(storageKey, current);
        },
    };
}

// ---------------------------------------------------------------------------
// Global objects: one item per entry (shortcuts) or per field (settings)
// ---------------------------------------------------------------------------

export function objectEntriesType(id: string, storageKey: string, deletable: boolean): UserDataType {
    return {
        id,
        scope: 'global',
        rule: { kind: 'newest' },
        deletable,
        read() {
            const object = readGlobal<Record<string, unknown>>(storageKey);
            if (!object || typeof object !== 'object' || Array.isArray(object)) return [];
            return Object.entries(object).map(([key, value]) => ({ scope: GLOBAL_SCOPE, key, value }));
        },
        write(changes) {
            const object = readGlobal<Record<string, unknown>>(storageKey);
            const next: Record<string, unknown> = object && typeof object === 'object' && !Array.isArray(object) ? { ...object } : {};
            for (const change of changes) {
                if (change.deleted) delete next[change.key];
                else next[change.key] = change.value;
            }
            writeGlobal(storageKey, next);
        },
    };
}

// ---------------------------------------------------------------------------
// Keymaps: one item per keymap; the flat `binds` key follows the active one
// ---------------------------------------------------------------------------

export const keymapsType: UserDataType<Keymap> = {
    id: 'keymaps',
    scope: 'global',
    rule: { kind: 'newest' },
    deletable: true,
    read() {
        const store = readGlobal<KeymapStore>('keymaps');
        if (!store || store.version !== 1 || !store.keymaps) return [];
        return Object.entries(store.keymaps).map(([key, value]) => ({ scope: GLOBAL_SCOPE, key, value }));
    },
    write(changes) {
        const store = getKeymapStore();
        const keymaps = { ...store.keymaps };
        for (const change of changes) {
            if (change.deleted) delete keymaps[change.key];
            else keymaps[change.key] = change.value!;
        }
        saveKeymapStore({ ...store, keymaps });
        const active = getActiveKeymapId();
        if (changes.some(c => c.key === active) && keymaps[active]) {
            globalStorage.set('binds', keymaps[active].binds);
        }
    },
};

// ---------------------------------------------------------------------------
// Character keys
// ---------------------------------------------------------------------------

/** Character keys synced by their own types, with their own rules. */
const CHARACTER_KEYS_WITH_OWN_TYPE = new Set([
    'profession',
    'improve_counter_lifetime',
    'deposits',
    'containers',
    'peopleLocalEvents',
    'kill_counter',
]);

/** Logs stay on the device: they are large, change with every message and aren't settings. */
const CHARACTER_KEYS_NOT_SYNCED = new Set([
    'chat_history',
]);

/** Every other character-scoped setting: one item per character and key, newest wins. */
export const characterKeysType: UserDataType = {
    id: 'characterKeys',
    scope: 'character',
    rule: { kind: 'newest' },
    deletable: true,
    read() {
        const items: LocalItem[] = [];
        for (let i = 0; i < localStorage.length; i += 1) {
            const storageKey = localStorage.key(i);
            if (!storageKey) continue;
            const parsed = parseCharacterStorageKey(storageKey);
            if (!parsed) continue;
            if (isExcludedLocalStorageKey(parsed.baseKey)
                || CHARACTER_KEYS_WITH_OWN_TYPE.has(parsed.baseKey)
                || CHARACTER_KEYS_NOT_SYNCED.has(parsed.baseKey)) continue;
            items.push({
                scope: characterScope(parsed.name),
                key: parsed.baseKey,
                value: parse(localStorage.getItem(storageKey)),
            });
        }
        return items;
    },
    write(changes) {
        for (const change of changes) {
            const character = characterOf(change);
            if (!character) continue;
            writeCharacterKey(character, change.key, change.deleted ? undefined : change.value);
        }
    },
};

/** One whole value per character, newest wins (deposits, containers). */
export function characterValueType(id: string, baseKey: string): UserDataType {
    return {
        id,
        scope: 'character',
        rule: { kind: 'newest' },
        read() {
            return collectCharacters()
                .map(name => ({ scope: characterScope(name), key: baseKey, value: readCharacterKey(name, baseKey) }))
                .filter(item => item.value !== undefined);
        },
        write(changes) {
            for (const change of changes) {
                const character = characterOf(change);
                if (character && !change.deleted) writeCharacterKey(character, baseKey, change.value);
            }
        },
    };
}

/** Profession (staz): the existing CRDT merge of +staz events and explicit edits. */
export const professionType: UserDataType<ProfessionState> = {
    ...characterValueType('profession', 'profession'),
    rule: {
        kind: 'custom',
        merge: (a, b) => mergeProfessionStates(a, b) ?? a,
    },
} as UserDataType<ProfessionState>;

// ---------------------------------------------------------------------------
// Improvement counters (improve_counter_lifetime): per character and day
// ---------------------------------------------------------------------------

interface LifetimeDay {
    date: string;
    count: number;
    noFormCount?: number;
}

interface LifetimeData {
    entries: LifetimeDay[];
    enabled?: boolean;
}

/** Only the current `{date, count}` format; legacy formats are converted by the counter itself on load. */
function readLifetime(character: string): LifetimeData | null {
    const data = readCharacterKey<LifetimeData>(character, 'improve_counter_lifetime');
    if (!data || Array.isArray(data) || !Array.isArray(data.entries)) return null;
    if (data.entries.some(e => typeof e?.date !== 'string' || typeof e?.count !== 'number')) return null;
    return data;
}

function dateOrder(date: string): number {
    const [y, m, d] = date.split('/').map(Number);
    return (y || 0) * 10_000 + (m || 0) * 100 + (d || 0);
}

export const improveCountsType: UserDataType<Record<string, number>> = {
    id: 'improveCounts',
    scope: 'character',
    rule: { kind: 'counter' },
    read() {
        const items: LocalItem<Record<string, number>>[] = [];
        for (const name of collectCharacters()) {
            for (const day of readLifetime(name)?.entries ?? []) {
                const value: Record<string, number> = { count: day.count };
                if (day.noFormCount) value.noFormCount = day.noFormCount;
                items.push({ scope: characterScope(name), key: day.date, value });
            }
        }
        return items;
    },
    write(changes) {
        for (const [character, list] of byCharacter(changes)) {
            // No `enabled` default: that switch has its own type, and inventing
            // it here would read as a local edit on the next capture.
            const data = readLifetime(character) ?? { entries: [] };
            const days = new Map(data.entries.map(e => [e.date, e]));
            for (const change of list) {
                const stored = days.get(change.key);
                const value = applyCounterChange(
                    stored ? { count: stored.count, noFormCount: stored.noFormCount ?? 0 } : undefined,
                    change,
                );
                const day: LifetimeDay = { date: change.key, count: value.count ?? 0 };
                if (value.noFormCount) day.noFormCount = value.noFormCount;
                days.set(change.key, day);
            }
            const entries = [...days.values()].sort((a, b) => dateOrder(a.date) - dateOrder(b.date));
            writeCharacterKey(character, 'improve_counter_lifetime', { ...data, entries });
        }
    },
};

/** The "count improvements" switch of the same key, when it has been stored; newest wins. */
export const improveCountsEnabledType: UserDataType<boolean> = {
    id: 'improveCountsEnabled',
    scope: 'character',
    rule: { kind: 'newest' },
    read() {
        return collectCharacters()
            .map(name => ({ name, data: readLifetime(name) }))
            .filter(({ data }) => typeof data?.enabled === 'boolean')
            .map(({ name, data }) => ({ scope: characterScope(name), key: 'enabled', value: data!.enabled! }));
    },
    write(changes) {
        for (const change of changes) {
            const character = characterOf(change);
            if (!character || change.deleted) continue;
            const data = readLifetime(character) ?? { entries: [] };
            writeCharacterKey(character, 'improve_counter_lifetime', { ...data, enabled: change.value });
        }
    },
};

// ---------------------------------------------------------------------------
// People database edits: one item per edit event
// ---------------------------------------------------------------------------

function readPeopleEvents(character: string): PeopleLocalEventsSnapshot | null {
    const data = readCharacterKey<PeopleLocalEventsSnapshot>(character, 'peopleLocalEvents');
    return data && Array.isArray(data.events) ? data : null;
}

export const peopleEditsType: UserDataType<PersonEditEvent> = {
    id: 'peopleEdits',
    scope: 'character',
    rule: { kind: 'newest' },
    // Edits are undone by removing their event.
    deletable: true,
    read() {
        const items: LocalItem<PersonEditEvent>[] = [];
        for (const name of collectCharacters()) {
            for (const event of readPeopleEvents(name)?.events ?? []) {
                items.push({ scope: characterScope(name), key: event.id, value: event });
            }
        }
        return items;
    },
    write(changes) {
        for (const [character, list] of byCharacter(changes)) {
            const snapshot = readPeopleEvents(character) ?? { events: [], timestamp: 0 };
            const events = new Map(snapshot.events.map(e => [e.id, e]));
            for (const change of list) {
                if (change.deleted) events.delete(change.key);
                else events.set(change.key, change.value!);
            }
            const sorted = [...events.values()].sort((a, b) => a.timestamp - b.timestamp);
            const timestamp = Math.max(snapshot.timestamp ?? 0, ...sorted.map(e => e.timestamp));
            writeCharacterKey(character, 'peopleLocalEvents', { ...snapshot, events: sorted, timestamp });
        }
    },
};

// ---------------------------------------------------------------------------
// Interface: device-scoped settings and the shared radial menu
// ---------------------------------------------------------------------------

/** Time for the UI to settle after device settings are applied (layout re-saved by the window manager). */
export const DEVICE_SETTLE_MS = 1000;

export interface DeviceTypeOptions {
    /** How long a write waits for the UI to settle; 0 in tests. */
    settleMs?: number;
    /** Reload the UI after a write. */
    reload?: () => Promise<void>;
}

/**
 * Device-scoped settings of one backup category (interface, buttons), one
 * item per field (layout, trip routes, active keymap...): a change to one field
 * on another device of the sync group doesn't carry the others along.
 *
 * Written through the category import (layout migration, keymap switch, radial
 * kept), then the UI reloads. A write resolves once the UI has settled, so the
 * tracker adopts what this device made of the value (e.g. the layout
 * normalized and re-saved by the window manager) instead of taking it for a
 * new local edit.
 */
function deviceFieldsType(
    id: string,
    category: 'uiSettings' | 'buttons',
    deviceId: () => string,
    options: DeviceTypeOptions,
): UserDataType<string> {
    const settleMs = options.settleMs ?? DEVICE_SETTLE_MS;
    const reload = options.reload ?? triggerSettingsReload;
    return {
        id,
        scope: 'device',
        rule: { kind: 'newest' },
        async read() {
            const fields = parse(await exportCategory(category, []));
            if (!fields || typeof fields !== 'object') return [];
            const scope = deviceScope(deviceId());
            return Object.entries(fields as Record<string, unknown>)
                .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
                .map(([key, value]) => ({ scope, key, value }));
        },
        async write(changes) {
            const fields: Record<string, string> = {};
            for (const change of changes) {
                if (!change.deleted && typeof change.value === 'string') fields[change.key] = change.value;
            }
            if (Object.keys(fields).length === 0) return;
            const result = await importCategory(category, JSON.stringify(fields));
            if (!result.success) throw new Error(result.error ?? `Failed to apply ${category}`);
            await reload();
            if (settleMs > 0) await new Promise(resolve => setTimeout(resolve, settleMs));
        },
    };
}

/**
 * The radial menu, shared by all devices, as one value. Reuses the category's
 * export/import, which keeps the rest of mobileButtonSettings.
 */
const radialType: UserDataType<string> = {
    id: 'radial',
    scope: 'global',
    rule: { kind: 'newest' },
    async read() {
        const raw = await exportCategory('radial', []);
        return raw ? [{ scope: GLOBAL_SCOPE, key: 'radial', value: raw }] : [];
    },
    async write(changes) {
        for (const change of changes) {
            if (change.deleted || change.value === undefined) continue;
            const result = await importCategory('radial', change.value);
            if (!result.success) throw new Error(result.error ?? 'Failed to apply radial');
        }
    },
};

export function interfaceTypes(deviceId: () => string, options: DeviceTypeOptions = {}): UserDataType[] {
    return [
        deviceFieldsType('interfaceSettings', 'uiSettings', deviceId, options),
        deviceFieldsType('buttonSettings', 'buttons', deviceId, options),
        radialType,
    ];
}
