/**
 * Pure snapshot updates for the two knowledge stores. Each takes a snapshot and
 * returns the next one, or the same object when nothing changed.
 */
import type {
    KnowledgeBookEntry,
    KnowledgeLibraryProgress,
    KnowledgeSnapshot,
} from '@modules/data/dataStores/knowledgeStore';
import {
    KNOWLEDGE_DETAILS_TYPES,
    KnowledgeCharacterProgress,
    KnowledgeDetailsSnapshot,
    KnowledgeDetailsType,
    KnowledgeEntriesMap,
} from '@modules/data/dataStores/knowledgeDetailsStore';
import type {KnowledgeCategoryBaseName} from '../../knowledgeCategories';
import {normalizeKnowledgeEntry} from './parsing';

export type BookProgressStatus = true | 'in_progress';

function copyEntriesMap(value?: KnowledgeEntriesMap | null): KnowledgeEntriesMap {
    return {
        fight: value && Array.isArray(value.fight) ? [...value.fight] : [],
        books: value && Array.isArray(value.books) ? [...value.books] : [],
        exploration: value && Array.isArray(value.exploration) ? [...value.exploration] : [],
    };
}

function copyLevels(
    levels: Partial<Record<KnowledgeDetailsType, string>> | undefined,
): Partial<Record<KnowledgeDetailsType, string>> {
    const result: Partial<Record<KnowledgeDetailsType, string>> = {};
    if (!levels || typeof levels !== 'object') {
        return result;
    }
    for (const type of KNOWLEDGE_DETAILS_TYPES) {
        const value = levels[type];
        if (typeof value === 'string') {
            result[type] = value;
        }
    }
    return result;
}

function withDetailsProgress(
    snapshot: KnowledgeDetailsSnapshot,
    progress: KnowledgeDetailsSnapshot['data']['progress'],
): KnowledgeDetailsSnapshot {
    return {...snapshot, data: {...snapshot.data, progress}};
}

/** Moves an entry to the character's known list, out of the unrecognized one. */
export function markEntryKnown(
    snapshot: KnowledgeDetailsSnapshot,
    characterKey: string,
    category: KnowledgeCategoryBaseName,
    type: KnowledgeDetailsType,
    canonical: string,
    timestamp: number,
): KnowledgeDetailsSnapshot {
    if (!snapshot.data.definitions?.[category]) {
        return snapshot;
    }
    const normalized = normalizeKnowledgeEntry(canonical);

    const nextProgress = {...snapshot.data.progress};
    const characterProgress: KnowledgeCharacterProgress = {...(nextProgress[characterKey] ?? {})};
    const previousCategory = characterProgress[category];

    const entriesMap = copyEntriesMap(previousCategory?.entries);
    const unknownMap = copyEntriesMap(previousCategory?.unknownEntries);
    let changed = false;

    if (!entriesMap[type].some((value) => normalizeKnowledgeEntry(value) === normalized)) {
        entriesMap[type].push(canonical);
        changed = true;
    }

    const filteredUnknown = unknownMap[type].filter((value) => normalizeKnowledgeEntry(value) !== normalized);
    if (filteredUnknown.length !== unknownMap[type].length) {
        unknownMap[type] = filteredUnknown;
        changed = true;
    }

    if (!changed) {
        return snapshot;
    }

    characterProgress[category] = {
        entries: entriesMap,
        unknownEntries: unknownMap,
        levels: copyLevels(previousCategory?.levels),
        updatedAt: timestamp,
    };
    nextProgress[characterKey] = characterProgress;
    return withDetailsProgress(snapshot, nextProgress);
}

/** Stores each category's overall level, as the `wiedza` command reports it. */
export function applyTotalLevels(
    snapshot: KnowledgeDetailsSnapshot,
    characterKey: string,
    levels: Iterable<[KnowledgeCategoryBaseName, string]>,
    timestamp: number,
): KnowledgeDetailsSnapshot {
    const nextProgress = {...snapshot.data.progress};
    const characterProgress: KnowledgeCharacterProgress = {...(nextProgress[characterKey] ?? {})};
    for (const [category, level] of levels) {
        const existing = characterProgress[category];
        characterProgress[category] = existing
            ? {...existing, totalLevel: level, updatedAt: timestamp}
            : {
                entries: copyEntriesMap(),
                unknownEntries: copyEntriesMap(),
                levels: {},
                totalLevel: level,
                updatedAt: timestamp,
            };
    }
    nextProgress[characterKey] = characterProgress;
    return withDetailsProgress(snapshot, nextProgress);
}

/**
 * Edits one library's progress for a character; `mutate` returns whether it changed
 * anything. Empty progress is pruned on the way out.
 */
export function updateLibraryProgress(
    snapshot: KnowledgeSnapshot | undefined,
    characterKey: string,
    libraryId: string,
    mutate: (progress: KnowledgeLibraryProgress) => boolean,
): KnowledgeSnapshot | undefined {
    if (!snapshot || !snapshot.data.libraries[libraryId]) {
        return snapshot;
    }
    const nextProgress = {...snapshot.data.progress};
    const characterProgress = {...(nextProgress[characterKey] ?? {})};
    const libraryProgress = {...(characterProgress[libraryId] ?? {})};

    if (!mutate(libraryProgress)) {
        return snapshot;
    }

    if (Object.keys(libraryProgress).length === 0) {
        delete characterProgress[libraryId];
    } else {
        characterProgress[libraryId] = libraryProgress;
    }
    if (Object.keys(characterProgress).length === 0) {
        delete nextProgress[characterKey];
    } else {
        nextProgress[characterKey] = characterProgress;
    }
    return {...snapshot, data: {...snapshot.data, progress: nextProgress}};
}

/** The book's own spelling of a category, if the book teaches it. */
export function resolveBookCategory(book: KnowledgeBookEntry, category: string): string | null {
    const lower = category.toLowerCase();
    return book.categories.find((cat) => cat.toLowerCase() === lower) ?? null;
}

export function findBookProgValue(
    bookProg: Record<string, BookProgressStatus>,
    cat: string,
): BookProgressStatus | undefined {
    if (bookProg[cat] != null) return bookProg[cat];
    const lower = cat.toLowerCase();
    for (const [key, value] of Object.entries(bookProg)) {
        if (key.toLowerCase() === lower) return value;
    }
    return undefined;
}

/** Sets (or with `false` clears) a book's category; a finished one never goes back to started. */
export function updateBookProgress(
    snapshot: KnowledgeSnapshot | undefined,
    characterKey: string,
    bookKey: string,
    category: string,
    status: BookProgressStatus | false,
): KnowledgeSnapshot | undefined {
    if (!snapshot) {
        return snapshot;
    }

    const nextBookProgress = {...(snapshot.data.bookProgress ?? {})};
    const characterBookProgress = {...(nextBookProgress[characterKey] ?? {})};
    const bookCategories = {...(characterBookProgress[bookKey] ?? {})};

    if (status === false) {
        if (!bookCategories[category]) {
            return snapshot;
        }
        delete bookCategories[category];
    } else {
        if (bookCategories[category] === true && status === 'in_progress') {
            return snapshot;
        }
        if (bookCategories[category] === status) {
            return snapshot;
        }
        bookCategories[category] = status;
    }

    if (Object.keys(bookCategories).length > 0) {
        characterBookProgress[bookKey] = bookCategories;
    } else {
        delete characterBookProgress[bookKey];
    }

    if (Object.keys(characterBookProgress).length > 0) {
        nextBookProgress[characterKey] = characterBookProgress;
    } else {
        delete nextBookProgress[characterKey];
    }

    return {...snapshot, data: {...snapshot.data, bookProgress: nextBookProgress}};
}
