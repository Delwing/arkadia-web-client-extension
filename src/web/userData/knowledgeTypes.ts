/**
 * Sync adapters for knowledge ("wiedza") data. The data stays in its three
 * stores; each adapter lists items and writes merged items back through the
 * same store API the knowledge script uses, so subscribers (the script, the
 * Wiedza window) see applied values.
 * See docs/dev/SYNC_V2_PLAN.md, sections 4.1, 5 and 6.
 *
 * - knowledgeLibraries: library status per (character, library, category), max.
 * - knowledgeBooks: book status per (character, book, category), max.
 * - knowledgeDetails: the latest `wiedza` reading per (character, category),
 *   plus the character metadata (gender) under the key `meta`.
 * - knowledgeTicks: one item per tick, union.
 * - knowledgeLevels: one item per (character, category, level), earliest.
 *
 * All are accumulated data: never deletable, a missing item is restored.
 */

import eventBus from '@modules/core/eventBus.ts';
import type { DataStore } from '@modules/data/dataStore/DataStore.ts';
import type { RefreshMetadata } from '@modules/data/dataStore/types.ts';
import {
    DEFAULT_KNOWLEDGE_CHARACTER_KEY,
    getKnowledgeStore,
    type KnowledgeCategoryStatus,
    type KnowledgeSnapshot,
} from '@modules/data/dataStores/knowledgeStore.ts';
import {
    getKnowledgeDetailsStore,
    type KnowledgeCategoryProgress,
    type KnowledgeCharacterMetadata,
    type KnowledgeCharacterProgress,
    type KnowledgeDetailsSnapshot,
    type KnowledgeEntriesMap,
} from '@modules/data/dataStores/knowledgeDetailsStore.ts';
import {
    loadKnowledgeEvents,
    saveKnowledgeEvents,
    type KnowledgeEvent,
    type KnowledgeEventsByCharacter,
    type KnowledgeEventsData,
} from '@modules/data/dataStores/knowledgeEventsStore.ts';
import { canonicalJson } from '@modules/userData/records.ts';
import {
    characterFromScope,
    characterScope,
    type ItemChange,
    type LocalItem,
    type UserDataType,
} from '@modules/userData/types.ts';

/** Where the adapters read and write; the app's stores by default, separate instances in tests. */
export interface KnowledgeSources {
    libraries: () => DataStore<KnowledgeSnapshot, RefreshMetadata>;
    details: () => DataStore<KnowledgeDetailsSnapshot, RefreshMetadata>;
    events: {
        load(): Promise<KnowledgeEventsByCharacter>;
        save(character: string, data: KnowledgeEventsData): Promise<void>;
    };
}

const defaultSources: KnowledgeSources = {
    libraries: getKnowledgeStore,
    details: getKnowledgeDetailsStore,
    events: { load: loadKnowledgeEvents, save: saveKnowledgeEvents },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Characters whose data is synced: `__default__` (no character set) is local only. */
function syncedCharacters<T>(byCharacter: Record<string, T> | undefined): [string, T][] {
    return Object.entries(byCharacter ?? {}).filter(([name]) => name !== DEFAULT_KNOWLEDGE_CHARACTER_KEY);
}

/** Changes carrying a value for a character scope (these types have no deletes). */
function characterChanges<V>(changes: ItemChange<V>[]): { character: string; key: string; value: V }[] {
    const result: { character: string; key: string; value: V }[] = [];
    for (const change of changes) {
        const character = characterFromScope(change.scope);
        if (!character || change.deleted || change.value === undefined) continue;
        result.push({ character, key: change.key, value: change.value });
    }
    return result;
}

/**
 * `${owner}/${category}`: categories never contain '/', so the owner (a
 * library id or book name) is everything before the last one.
 */
function pairKey(owner: string, category: string): string {
    return `${owner}/${category}`;
}

function splitPairKey(key: string): [string, string] | null {
    const index = key.lastIndexOf('/');
    if (index <= 0 || index === key.length - 1) return null;
    return [key.slice(0, index), key.slice(index + 1)];
}

/**
 * The store's snapshot, loading definitions first on a device that has none
 * yet. Throws rather than drop incoming data when they can't be loaded.
 */
async function loadedSnapshot<T>(store: DataStore<T, RefreshMetadata>, name: string): Promise<void> {
    if (await store.getSnapshot()) return;
    if (!await store.refresh()) throw new Error(`Knowledge ${name} are not loaded; cannot apply synced data`);
}

function requireSnapshot<T>(snapshot: T | undefined, name: string): T {
    if (!snapshot) throw new Error(`Knowledge ${name} were cleared; cannot apply synced data`);
    return snapshot;
}

// ---------------------------------------------------------------------------
// Libraries and books: progress that only moves forward
// ---------------------------------------------------------------------------

const LIBRARY_ORDER: Record<KnowledgeCategoryStatus, number> = { not_started: 0, in_progress: 1, completed: 2 };

function isLibraryStatus(value: unknown): value is KnowledgeCategoryStatus {
    return typeof value === 'string' && value in LIBRARY_ORDER;
}

type BookStatus = true | 'in_progress';

function bookOrder(value: BookStatus): number {
    return value === true ? 1 : 0;
}

function librariesType(sources: KnowledgeSources): UserDataType<KnowledgeCategoryStatus> {
    return {
        id: 'knowledgeLibraries',
        scope: 'character',
        rule: { kind: 'max', compare: (a, b) => LIBRARY_ORDER[a] - LIBRARY_ORDER[b] },
        async read() {
            const snapshot = await sources.libraries().getSnapshot();
            const items: LocalItem<KnowledgeCategoryStatus>[] = [];
            for (const [name, progress] of syncedCharacters(snapshot?.data.progress)) {
                for (const [libraryId, categories] of Object.entries(progress ?? {})) {
                    for (const [category, status] of Object.entries(categories ?? {})) {
                        if (!isLibraryStatus(status)) continue;
                        items.push({ scope: characterScope(name), key: pairKey(libraryId, category), value: status });
                    }
                }
            }
            return items;
        },
        async write(changes) {
            const updates = characterChanges(changes);
            if (updates.length === 0) return;
            const store = sources.libraries();
            await loadedSnapshot(store, 'libraries');
            // Libraries missing from this device's definitions are kept here,
            // but the store drops them on its next load (sanitizeProgress).
            await store.applyLocalChange((current) => {
                const snapshot = requireSnapshot(current, 'libraries');
                const progress = { ...snapshot.data.progress };
                for (const { character, key, value } of updates) {
                    const pair = splitPairKey(key);
                    if (!pair) continue;
                    const [libraryId, category] = pair;
                    const libraries = { ...(progress[character] ?? {}) };
                    libraries[libraryId] = { ...(libraries[libraryId] ?? {}), [category]: value };
                    progress[character] = libraries;
                }
                return { ...snapshot, data: { ...snapshot.data, progress } };
            });
        },
    };
}

function booksType(sources: KnowledgeSources): UserDataType<BookStatus> {
    return {
        id: 'knowledgeBooks',
        scope: 'character',
        rule: { kind: 'max', compare: (a, b) => bookOrder(a) - bookOrder(b) },
        async read() {
            const snapshot = await sources.libraries().getSnapshot();
            const items: LocalItem<BookStatus>[] = [];
            for (const [name, books] of syncedCharacters(snapshot?.data.bookProgress)) {
                for (const [book, categories] of Object.entries(books ?? {})) {
                    for (const [category, status] of Object.entries(categories ?? {})) {
                        if (status !== true && status !== 'in_progress') continue;
                        items.push({ scope: characterScope(name), key: pairKey(book, category), value: status });
                    }
                }
            }
            return items;
        },
        async write(changes) {
            const updates = characterChanges(changes);
            if (updates.length === 0) return;
            const store = sources.libraries();
            await loadedSnapshot(store, 'libraries');
            await store.applyLocalChange((current) => {
                const snapshot = requireSnapshot(current, 'libraries');
                const bookProgress = { ...snapshot.data.bookProgress };
                for (const { character, key, value } of updates) {
                    const pair = splitPairKey(key);
                    if (!pair) continue;
                    const [book, category] = pair;
                    const books = { ...(bookProgress[character] ?? {}) };
                    books[book] = { ...(books[book] ?? {}), [category]: value };
                    bookProgress[character] = books;
                }
                return { ...snapshot, data: { ...snapshot.data, bookProgress } };
            });
            // The script re-sends the library report on every store change,
            // but the book report only on request.
            eventBus.emit('requestKnowledgeBookReport');
        },
    };
}

// ---------------------------------------------------------------------------
// Details: the latest `wiedza` reading per category, and character metadata
// ---------------------------------------------------------------------------

const META_KEY = 'meta';

type DetailsValue = KnowledgeCategoryProgress | KnowledgeCharacterMetadata;

function sortedEntries(map: KnowledgeEntriesMap | undefined): KnowledgeEntriesMap {
    // Plain code-unit order: the same on every device (localeCompare may not be).
    const list = (value: unknown): string[] => (Array.isArray(value) ? [...value].sort() : []);
    return { fight: list(map?.fight), books: list(map?.books), exploration: list(map?.exploration) };
}

/**
 * One category's progress in a stable shape, so a value read back after
 * writing (or after the store reloads it sorted) equals the value written.
 */
function normalizeProgress(progress: KnowledgeCategoryProgress): KnowledgeCategoryProgress {
    const levels: KnowledgeCategoryProgress['levels'] = {};
    for (const [type, level] of Object.entries(progress.levels ?? {})) {
        if (typeof level === 'string' && level.length > 0) levels[type as keyof typeof levels] = level;
    }
    const result: KnowledgeCategoryProgress = {
        entries: sortedEntries(progress.entries),
        unknownEntries: sortedEntries(progress.unknownEntries),
        levels,
        updatedAt: progress.updatedAt,
    };
    if (progress.totalLevel) result.totalLevel = progress.totalLevel;
    return result;
}

/**
 * The later reading wins, by the reading's own `updatedAt`: a device that
 * seeds or captures an old reading after another device's newer one gets a
 * newer stamp, but must not replace it. Ties pick deterministically.
 */
function latestReading(a: DetailsValue, b: DetailsValue): DetailsValue {
    const ta = a?.updatedAt ?? 0;
    const tb = b?.updatedAt ?? 0;
    if (ta !== tb) return ta > tb ? a : b;
    return canonicalJson(a) >= canonicalJson(b) ? a : b;
}

function detailsType(sources: KnowledgeSources): UserDataType<DetailsValue> {
    return {
        id: 'knowledgeDetails',
        scope: 'character',
        rule: { kind: 'custom', merge: latestReading },
        async read() {
            const snapshot = await sources.details().getSnapshot();
            const items: LocalItem<DetailsValue>[] = [];
            for (const [name, categories] of syncedCharacters(snapshot?.data.progress)) {
                for (const [category, progress] of Object.entries(categories ?? {})) {
                    if (!progress || typeof progress !== 'object') continue;
                    items.push({ scope: characterScope(name), key: category, value: normalizeProgress(progress) });
                }
            }
            for (const [name, metadata] of syncedCharacters(snapshot?.data.characters)) {
                if (!metadata || typeof metadata !== 'object') continue;
                items.push({ scope: characterScope(name), key: META_KEY, value: { ...metadata } });
            }
            return items;
        },
        async write(changes) {
            const updates = characterChanges(changes);
            if (updates.length === 0) return;
            const store = sources.details();
            await loadedSnapshot(store, 'details');
            await store.applyLocalChange((current) => {
                const snapshot = requireSnapshot(current, 'details');
                const progress = { ...snapshot.data.progress };
                const characters = { ...snapshot.data.characters };
                for (const { character, key, value } of updates) {
                    if (key === META_KEY) {
                        characters[character] = { ...(value as KnowledgeCharacterMetadata) };
                    } else {
                        const categories: KnowledgeCharacterProgress = { ...(progress[character] ?? {}) };
                        categories[key as keyof KnowledgeCharacterProgress] = value as KnowledgeCategoryProgress;
                        progress[character] = categories;
                    }
                }
                return { ...snapshot, data: { ...snapshot.data, progress, characters } };
            });
        },
    };
}

// ---------------------------------------------------------------------------
// Events: ticks (union) and level changes (earliest)
// ---------------------------------------------------------------------------

function tickKey(event: KnowledgeEvent): string {
    return `tick/${event.category}/${event.timestamp}`;
}

function levelKey(event: { category: string; level?: string }): string {
    return `level/${event.category}/${event.level}`;
}

function byTimestamp(a: KnowledgeEvent, b: KnowledgeEvent): number {
    return a.timestamp - b.timestamp;
}

/**
 * Apply changes to each character's event list and save it through the
 * events store, which keeps its in-memory cache (read by the script and the
 * Wiedza window) in step. The list is read from the cache and saved with no
 * await in between, so a tick recorded meanwhile is not lost.
 */
async function writeEvents(
    sources: KnowledgeSources,
    changes: ItemChange<KnowledgeEvent>[],
    apply: (events: KnowledgeEvent[], event: KnowledgeEvent) => KnowledgeEvent[],
): Promise<void> {
    const byCharacter = new Map<string, KnowledgeEvent[]>();
    for (const { character, value } of characterChanges(changes)) {
        const list = byCharacter.get(character) ?? [];
        list.push(value);
        byCharacter.set(character, list);
    }
    if (byCharacter.size === 0) return;

    const all = await sources.events.load();
    const saves: Promise<void>[] = [];
    for (const [character, incoming] of byCharacter) {
        let events = [...(all[character]?.events ?? [])];
        for (const event of incoming) events = apply(events, event);
        events.sort(byTimestamp);
        saves.push(sources.events.save(character, { events }));
    }
    await Promise.all(saves);
    // The Wiedza window re-reads the history on this event.
    eventBus.emit('knowledgeEvents.changed', { characters: [...byCharacter.keys()] });
}

function ticksType(sources: KnowledgeSources): UserDataType<KnowledgeEvent> {
    return {
        id: 'knowledgeTicks',
        scope: 'character',
        rule: { kind: 'union' },
        async read() {
            const items: LocalItem<KnowledgeEvent>[] = [];
            for (const [name, data] of syncedCharacters(await sources.events.load())) {
                for (const event of data?.events ?? []) {
                    if (event.type !== 'tick') continue;
                    items.push({ scope: characterScope(name), key: tickKey(event), value: event });
                }
            }
            return items;
        },
        write(changes) {
            return writeEvents(sources, changes, (events, tick) => {
                const key = tickKey(tick);
                if (events.some(e => e.type === 'tick' && tickKey(e) === key)) return events;
                return [...events, { ...tick, type: 'tick' }];
            });
        },
    };
}

function levelsType(sources: KnowledgeSources): UserDataType<KnowledgeEvent> {
    return {
        id: 'knowledgeLevels',
        scope: 'character',
        rule: { kind: 'earliest', time: v => v.timestamp },
        async read() {
            const items: LocalItem<KnowledgeEvent>[] = [];
            for (const [name, data] of syncedCharacters(await sources.events.load())) {
                // The first observation of a level is when it was reached.
                const earliest = new Map<string, KnowledgeEvent>();
                for (const event of data?.events ?? []) {
                    if (event.type !== 'level_change' || !event.level) continue;
                    const key = levelKey(event);
                    const known = earliest.get(key);
                    if (!known || event.timestamp < known.timestamp) earliest.set(key, event);
                }
                for (const [key, event] of earliest) {
                    items.push({ scope: characterScope(name), key, value: event });
                }
            }
            return items;
        },
        write(changes) {
            return writeEvents(sources, changes, (events, level) => {
                const key = levelKey(level);
                // One event per level: the merged one replaces any other observation.
                const others = events.filter(e => e.type !== 'level_change' || levelKey(e) !== key);
                return [...others, { ...level, type: 'level_change' }];
            });
        },
    };
}

// ---------------------------------------------------------------------------

export function createKnowledgeTypes(sources: KnowledgeSources = defaultSources): UserDataType[] {
    return [
        librariesType(sources),
        booksType(sources),
        detailsType(sources),
        ticksType(sources),
        levelsType(sources),
    ];
}
