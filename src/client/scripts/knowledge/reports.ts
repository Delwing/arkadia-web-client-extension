/**
 * The payloads the knowledge windows draw: libraries (which categories each one
 * still teaches) and details (which entries of each category the character knows).
 * Pure functions of a store snapshot.
 */
import type {
    KnowledgeCategoryStatus,
    KnowledgeLibraryEntry,
    KnowledgeLibraryProgress,
} from '@modules/data/dataStores/knowledgeStore';
import {
    canonicalizeKnowledgeEntryGender,
    formatKnowledgeEntryForGender,
    KNOWLEDGE_DETAILS_TYPES,
    KnowledgeCharacterGender,
    KnowledgeCharacterProgress,
    KnowledgeDetailsSnapshot,
    KnowledgeDetailsType,
} from '@modules/data/dataStores/knowledgeDetailsStore';
import {
    getBaseCategoryFromName,
    getDativeCategoryName,
    KNOWLEDGE_CATEGORY_CONFIG,
} from '../../knowledgeCategories';
import {
    getKnowledgeLevelFromLabel,
    KNOWLEDGE_LEVEL_MAX,
    lookupKnowledgeEntryInfo,
    normalizeKnowledgeEntry,
} from './parsing';

export type KnowledgeReportLibraryCategory = {
    name: string;
    dative: string;
    status: KnowledgeCategoryStatus;
};

type LibraryProgressSummary = {
    total: number;
    completed: number;
    in_progress: number;
    not_started: number;
    remaining: number;
    categories: KnowledgeReportLibraryCategory[];
};

export type KnowledgeReportLibrary = Omit<LibraryProgressSummary, 'categories'> & {
    id: string;
    name: string;
    locationId: string;
    /** The map room of `locationId`, for the window's distances and areas. */
    roomId?: number | null;
    categories: KnowledgeReportLibraryCategory[];
};

type KnowledgeReportCategoryLibrary = {
    id: string;
    name: string;
    status: KnowledgeCategoryStatus;
};

type KnowledgeReportCategory = {
    name: string;
    dative: string;
    libraries: KnowledgeReportCategoryLibrary[];
};

export type KnowledgeReportPayload = {
    libraries: KnowledgeReportLibrary[];
    categories: KnowledgeReportCategory[];
    currentLibraryId?: string | null;
};

type KnowledgeDetailsReportTypeEntry = {
    name: string;
    status: 'known' | 'missing';
    id?: number | null;
    lokalizacja?: string;
    note?: string;
};

type KnowledgeDetailsReportTypeSummary = {
    total: number;
    known: number;
    missing: string[];
    unknown: string[];
    entries: KnowledgeDetailsReportTypeEntry[];
    level?: string;
    levelIndex?: number;
    levelMax: number;
};

type KnowledgeDetailsReportCategory = {
    name: string;
    dative: string;
    updatedAt: number | null;
    types: Record<KnowledgeDetailsType, KnowledgeDetailsReportTypeSummary>;
};

export type KnowledgeDetailsReportPayload = {
    categories: KnowledgeDetailsReportCategory[];
};

/** The library's category as the library spells it, from any form the game used. */
export function normalizeCategory(category: string, library: KnowledgeLibraryEntry): string | null {
    const trimmed = category.trim();
    const lowerTrimmed = trimmed.toLowerCase();
    for (const entry of library.categories) {
        if (entry.toLowerCase() === lowerTrimmed) {
            return entry;
        }
    }

    const baseCandidate = getBaseCategoryFromName(trimmed);
    if (baseCandidate) {
        for (const entry of library.categories) {
            if (getBaseCategoryFromName(entry) === baseCandidate) {
                return entry;
            }
            if (entry.toLowerCase() === baseCandidate.toLowerCase()) {
                return entry;
            }
        }
    }

    return null;
}

export function getUniqueLibraryCategories(library: KnowledgeLibraryEntry): string[] {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const category of library.categories) {
        const key = category.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        unique.push(category);
    }
    return unique;
}

function summarizeLibraryProgress(
    library: KnowledgeLibraryEntry,
    libraryProgress: Record<string, KnowledgeCategoryStatus>,
): LibraryProgressSummary {
    const categories = getUniqueLibraryCategories(library);
    const categoryDetails: KnowledgeReportLibraryCategory[] = [];
    const summary: LibraryProgressSummary = {
        total: categories.length,
        completed: 0,
        in_progress: 0,
        not_started: 0,
        remaining: 0,
        categories: categoryDetails,
    };

    for (const category of categories) {
        const status = libraryProgress[category] ?? 'not_started';
        categoryDetails.push({
            name: category,
            dative: getDativeCategoryName(category),
            status,
        });
        if (status === 'completed') {
            summary.completed += 1;
        } else if (status === 'in_progress') {
            summary.in_progress += 1;
        } else {
            summary.not_started += 1;
        }
    }

    summary.remaining = summary.not_started + summary.in_progress;
    return summary;
}

export function buildKnowledgeReport(
    libraryEntries: [string, KnowledgeLibraryEntry][],
    characterProgress: Record<string, KnowledgeLibraryProgress>,
): KnowledgeReportPayload | null {
    const libraries: KnowledgeReportLibrary[] = [];
    const categoriesMap = new Map<
        string,
        {
            category: string;
            dative: string;
            libraries: KnowledgeReportCategoryLibrary[];
            hasRemaining: boolean;
        }
    >();

    for (const [libraryId, library] of libraryEntries) {
        const libraryProgress = characterProgress[libraryId] ?? {};
        const summary = summarizeLibraryProgress(library, libraryProgress);

        if (summary.total > 0) {
            libraries.push({
                id: libraryId,
                name: library.name,
                locationId: library.location_id,
                total: summary.total,
                remaining: summary.remaining,
                not_started: summary.not_started,
                in_progress: summary.in_progress,
                completed: summary.completed,
                categories: summary.categories,
            });
        }

        for (const {name: category, status, dative} of summary.categories) {
            let categoryEntry = categoriesMap.get(category);
            if (!categoryEntry) {
                categoryEntry = {category, dative, libraries: [], hasRemaining: false};
                categoriesMap.set(category, categoryEntry);
            }
            categoryEntry.libraries.push({id: libraryId, name: library.name, status});
            if (status !== 'completed') {
                categoryEntry.hasRemaining = true;
            }
        }
    }

    libraries.sort((a, b) => a.name.localeCompare(b.name));

    const categories = Array.from(categoriesMap.values())
        .filter((entry) => entry.hasRemaining)
        .map<KnowledgeReportCategory>((entry) => ({
            name: entry.category,
            dative: entry.dative,
            libraries: entry.libraries.sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

    if (libraries.length === 0 && categories.length === 0) {
        return null;
    }

    return {libraries, categories};
}

function sanitizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const result: string[] = [];
    for (const entry of value) {
        if (typeof entry !== 'string') {
            continue;
        }
        const trimmed = entry.trim();
        if (trimmed.length > 0) {
            result.push(trimmed);
        }
    }
    return result;
}

/** A category's defined entries, deduplicated, without the removed ones. */
function canonicalDefinitionEntries(
    rawEntries: unknown,
    gender: KnowledgeCharacterGender | null,
): { canonical: string; display: string; normalized: string }[] {
    const result: { canonical: string; display: string; normalized: string }[] = [];
    if (!Array.isArray(rawEntries)) {
        return result;
    }
    const seen = new Set<string>();
    for (const entry of rawEntries) {
        if (typeof entry !== 'string') {
            continue;
        }
        const canonical = canonicalizeKnowledgeEntryGender(entry);
        const normalized = normalizeKnowledgeEntry(canonical);
        if (normalized.length === 0 || seen.has(normalized)) {
            continue;
        }
        if (canonical === 'Usuniete' || normalized === 'usuniete') {
            continue;
        }
        seen.add(normalized);
        result.push({
            canonical,
            display: formatKnowledgeEntryForGender(canonical, gender),
            normalized,
        });
    }
    return result;
}

/**
 * The details window's payload. Without `characterKey` every entry is listed as
 * missing, in its masculine (canonical) form: the window still shows what there is
 * to learn before the character's progress is first built.
 */
export function buildKnowledgeDetailsReportPayload(
    snapshot: KnowledgeDetailsSnapshot,
    characterKey: string | null,
    overrideGender?: KnowledgeCharacterGender | null,
): KnowledgeDetailsReportPayload | null {
    const {definitions, progress} = snapshot.data;
    let characterProgress: KnowledgeCharacterProgress | null = null;
    let characterGender: KnowledgeCharacterGender | null = null;
    if (characterKey !== null) {
        characterProgress = progress[characterKey] ?? null;
        if (!characterProgress) {
            return null;
        }
        characterGender = overrideGender ?? snapshot.data.characters?.[characterKey]?.gender ?? null;
    }

    const categories: KnowledgeDetailsReportCategory[] = [];

    for (const config of KNOWLEDGE_CATEGORY_CONFIG) {
        const base = config.base;
        const progressEntry = characterProgress?.[base];
        if (characterProgress && !progressEntry) {
            continue;
        }

        const definition = definitions[base];
        const summaries = {} as Record<KnowledgeDetailsType, KnowledgeDetailsReportTypeSummary>;
        let hasData = false;
        let totalEntries = 0;

        for (const type of KNOWLEDGE_DETAILS_TYPES) {
            const canonicalEntries = canonicalDefinitionEntries(definition?.[type], characterGender);
            totalEntries += canonicalEntries.length;

            const knownSet = new Set<string>();
            for (const entry of sanitizeStringArray(progressEntry?.entries?.[type])) {
                knownSet.add(normalizeKnowledgeEntry(entry));
            }

            let known = 0;
            const missing: string[] = [];
            const entriesList: KnowledgeDetailsReportTypeEntry[] = [];
            for (const entry of canonicalEntries) {
                const isKnown = knownSet.has(entry.normalized);
                const reportEntry: KnowledgeDetailsReportTypeEntry = {
                    name: entry.display,
                    status: isKnown ? 'known' : 'missing',
                };
                const info = lookupKnowledgeEntryInfo(entry.canonical);
                if (info) {
                    reportEntry.id = info.id;
                    if (info.lokalizacja) reportEntry.lokalizacja = info.lokalizacja;
                    if (info.note) reportEntry.note = info.note;
                }
                entriesList.push(reportEntry);
                if (isKnown) {
                    known += 1;
                } else {
                    missing.push(entry.display);
                }
            }

            const unknown = sanitizeStringArray(progressEntry?.unknownEntries?.[type]).map((entry) =>
                formatKnowledgeEntryForGender(entry, characterGender),
            );
            const rawLevel = progressEntry?.levels?.[type];
            const levelResult = getKnowledgeLevelFromLabel(typeof rawLevel === 'string' ? rawLevel : undefined);

            if (known > 0 || missing.length > 0 || unknown.length > 0 || levelResult) {
                hasData = true;
            }

            const summary: KnowledgeDetailsReportTypeSummary = {
                total: canonicalEntries.length,
                known,
                missing,
                unknown,
                entries: entriesList,
                levelMax: Math.max(KNOWLEDGE_LEVEL_MAX, 0),
            };
            if (levelResult) {
                summary.level = levelResult.label;
                summary.levelIndex = levelResult.index;
            }
            summaries[type] = summary;
        }

        if (!hasData && totalEntries === 0) {
            continue;
        }

        categories.push({
            name: base,
            dative: getDativeCategoryName(base),
            updatedAt: typeof progressEntry?.updatedAt === 'number' ? progressEntry.updatedAt : null,
            types: summaries,
        });
    }

    if (categories.length === 0) {
        return null;
    }

    return {categories};
}
