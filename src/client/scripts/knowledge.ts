import Client from '../Client';
import {colorString, createColorFormat} from '@modules/core/Colors';
import type {KnowledgeReportAction} from '@shared/events';
import {
    DEFAULT_KNOWLEDGE_CHARACTER_KEY,
    getKnowledgeStore,
    KnowledgeCategoryStatus,
    KnowledgeLibraryEntry,
    KnowledgeLibraryProgress,
    KnowledgeSnapshot,
} from '@modules/data/dataStores/knowledgeStore';
import {
    buildNormalizedDefinitions,
    canonicalizeKnowledgeEntryGender,
    formatKnowledgeEntryForGender,
    getKnowledgeDetailsStore,
    KNOWLEDGE_DETAILS_TYPES,
    KnowledgeCharacterGender,
    KnowledgeCharacterProgress,
    KnowledgeDetailsSnapshot,
    KnowledgeDetailsType,
    KnowledgeEntriesMap,
    parseKnowledgeGender,
} from '@modules/data/dataStores/knowledgeDetailsStore';
import {
    getBaseCategoryFromName,
    getDativeCategoryName,
    KNOWLEDGE_CATEGORY_CONFIG,
    KNOWLEDGE_CATEGORY_ORDER,
    KnowledgeCategoryBaseName,
} from '../knowledgeCategories';
import {getCurrentCharacter} from '@modules/core/storage';
import {stripPolishCharacters} from '../stripPolishCharacters';
import {AnsiAwareBuffer, FormatStateSnapshot} from "@client/ansi/FormatState.ts";

type AliasEntry = { pattern: RegExp; callback: Function };

const STATUS_COLORS: Record<KnowledgeCategoryStatus, FormatStateSnapshot> = {
    not_started: createColorFormat('#ffffff'),
    in_progress: createColorFormat('#ffff00'),
    completed: createColorFormat('#00ff00'),
};

const HEADER_COLOR = createColorFormat('#7cfc00');
const KNOWLEDGE_ENTRY_HIGHLIGHT_COLOR = createColorFormat('#ffe066');
const KNOWLEDGE_ENTRY_TRIGGER_TAG = 'knowledge-entry-triggers';

type KnowledgeEntryTriggerTarget = {
    category: KnowledgeCategoryBaseName;
    type: KnowledgeDetailsType;
    canonical: string;
};

const START_LIBRARY_PATTERN =
    /^Zaczynasz zglebiac tutejsze zasoby, probujac dowiedziec sie czegos wiecej o (.*)\.$/;
const COMPLETE_LIBRARY_PATTERN =
    /^Masz wrazenie, ze tutaj nie dowiesz sie juz niczego wiecej o (.*)\.$/;
const KNOWLEDGE_PROMPT_PATTERN =
    /^Wiedze o czym chcesz zglebiac\? (.*)$/;

const KNOWLEDGE_COMMANDS = KNOWLEDGE_CATEGORY_CONFIG.map((config) => config.command);
const KNOWLEDGE_COMMAND_SEQUENCE = KNOWLEDGE_COMMANDS.join(';');
const KNOWLEDGE_TYPE_IDENTIFIERS: Record<KnowledgeDetailsType, string[]> = {
    fight: ['walki', 'walkach'],
    books: ['ksiazek i bibliotek', 'ksiazkach i bibliotekach', 'bibliotekach i ksiazkach'],
    exploration: ['eksploracji', 'eksploracjach'],
};
const KNOWLEDGE_LEVEL_LABELS = [
    'brak',
    'znikoma',
    'niewielka',
    'czesciowa',
    'niezla',
    'dosc dobra',
    'dobra',
    'bardzo dobra',
    'doskonala',
    'prawie pelna',
    'pelna',
] as const;
const KNOWLEDGE_LEVEL_SET = new Set<string>(KNOWLEDGE_LEVEL_LABELS);
type KnowledgeLevelResult = { label: string; index: number };
const KNOWLEDGE_TYPE_LOOKUP: Map<string, KnowledgeDetailsType> = (() => {
    const map = new Map<string, KnowledgeDetailsType>();
    for (const type of KNOWLEDGE_DETAILS_TYPES) {
        for (const identifier of KNOWLEDGE_TYPE_IDENTIFIERS[type]) {
            const key = normalizeKnowledgeTypeKey(identifier);
            if (!map.has(key)) {
                map.set(key, type);
            }
        }
    }
    return map;
})();
const KNOWLEDGE_HEADER_PATTERN = /^Wiedza o (.+?):?$/;
const KNOWLEDGE_SUMMARY_PATTERN = /^\s*z\s+(.+?)\s*-\s*(.+)$/i;
const KNOWLEDGE_SECTION_HEADER_PATTERN = /^Szczegoly(?:\s+z)?\s+(.+?):$/i;
const KNOWLEDGE_ENTRY_PATTERN = /^\s*[*]\s*(.+)$/;
const KNOWLEDGE_REPORT_INACTIVITY_TIMEOUT = 1500;
const KNOWLEDGE_REPORT_HARD_TIMEOUT = 15000;

function normalizeKnowledgeEntry(value: string): string {
    return stripPolishCharacters(
        value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/u, ''),
    );
}

function normalizeKnowledgeTypeKey(value: string): string {
    return stripPolishCharacters(value.trim().toLowerCase().replace(/\s+/g, ' '));
}

function detectKnowledgeDetailsType(text: string): KnowledgeDetailsType | null {
    const normalized = normalizeKnowledgeTypeKey(text);
    return KNOWLEDGE_TYPE_LOOKUP.get(normalized) ?? null;
}

function sanitizeKnowledgeLevel(level: string | undefined): string | undefined {
    if (!level) {
        return undefined;
    }

    const normalized = level.trim().toLowerCase();

    if (normalized.length === 0) {
        return undefined;
    }

    return KNOWLEDGE_LEVEL_SET.has(normalized) ? normalized : undefined;
}

function getKnowledgeLevelFromLabel(level: string | undefined): KnowledgeLevelResult | undefined {
    const normalized = sanitizeKnowledgeLevel(level);
    if (!normalized) {
        return undefined;
    }

    const index = KNOWLEDGE_LEVEL_LABELS.indexOf(
        normalized as (typeof KNOWLEDGE_LEVEL_LABELS)[number],
    );
    if (index === -1) {
        return undefined;
    }

    return {label: KNOWLEDGE_LEVEL_LABELS[index], index};
}

function computeKnowledgeLevel(
    known: number,
    total: number,
    fallback: string | undefined,
): KnowledgeLevelResult | undefined {
    if (total > 0) {
        const clampedKnown = Math.max(0, Math.min(known, total));
        const ratio = clampedKnown / total;
        const maxIndex = Math.max(KNOWLEDGE_LEVEL_LABELS.length - 1, 0);

        if (maxIndex === 0) {
            return {label: KNOWLEDGE_LEVEL_LABELS[0], index: 0};
        }

        if (ratio >= 1) {
            return {label: KNOWLEDGE_LEVEL_LABELS[maxIndex], index: maxIndex};
        }

        let index = Math.max(0, Math.min(Math.floor(ratio * maxIndex), maxIndex));

        if (index === 0 && clampedKnown > 0) {
            index = 1;
        }

        return {label: KNOWLEDGE_LEVEL_LABELS[index], index};
    }

    return getKnowledgeLevelFromLabel(fallback);
}

type KnowledgeRunCategoryState = {
    levels: Partial<Record<KnowledgeDetailsType, string>>;
    knownEntries: Record<KnowledgeDetailsType, Set<string>>;
    unknownEntries: Record<KnowledgeDetailsType, Set<string>>;
};

function createKnowledgeRunSets(): Record<KnowledgeDetailsType, Set<string>> {
    return {
        fight: new Set<string>(),
        books: new Set<string>(),
        exploration: new Set<string>(),
    };
}

function createEmptyKnowledgeRunCategoryState(): KnowledgeRunCategoryState {
    return {
        levels: {},
        knownEntries: createKnowledgeRunSets(),
        unknownEntries: createKnowledgeRunSets(),
    };
}

function ensureKnowledgeEntriesMap(value?: KnowledgeEntriesMap | null): KnowledgeEntriesMap {
    const fight = value && Array.isArray(value.fight) ? [...value.fight] : [];
    const books = value && Array.isArray(value.books) ? [...value.books] : [];
    const exploration = value && Array.isArray(value.exploration) ? [...value.exploration] : [];

    return {
        fight,
        books,
        exploration,
    };
}

function ensureKnowledgeLevels(
    levels: Partial<Record<KnowledgeDetailsType, string>> | undefined,
): Partial<Record<KnowledgeDetailsType, string>> {
    if (!levels || typeof levels !== 'object') {
        return {};
    }

    const result: Partial<Record<KnowledgeDetailsType, string>> = {};
    for (const type of KNOWLEDGE_DETAILS_TYPES) {
        const value = levels[type];
        if (typeof value === 'string') {
            result[type] = value;
        }
    }

    return result;
}

function ensureKnowledgeCharacterProgress(
    progress: KnowledgeCharacterProgress | undefined | null,
): KnowledgeCharacterProgress {
    return progress ? {...progress} : {};
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
        if (trimmed.length === 0) {
            continue;
        }
        result.push(trimmed);
    }
    return result;
}

function buildKnowledgeDetailsReportPayload(
    snapshot: KnowledgeDetailsSnapshot,
    characterKey: string,
    overrideGender?: KnowledgeCharacterGender | null,
): KnowledgeDetailsReportPayload | null {
    const {definitions, progress} = snapshot.data;
    const characterProgress = progress[characterKey];

    if (!characterProgress) {
        return null;
    }

    const metadataGender = snapshot.data.characters?.[characterKey]?.gender ?? null;
    const characterGender = overrideGender ?? metadataGender ?? null;

    const categories: KnowledgeDetailsReportCategory[] = [];

    for (const config of KNOWLEDGE_CATEGORY_CONFIG) {
        const base = config.base;
        const progressEntry = characterProgress[base];

        if (!progressEntry) {
            continue;
        }

        const definition = definitions[base];
        const summaries = {} as Record<KnowledgeDetailsType, KnowledgeDetailsReportTypeSummary>;
        let hasData = false;
        let totalEntries = 0;

        for (const type of KNOWLEDGE_DETAILS_TYPES) {
            const rawDefinitionEntries =
                definition && Array.isArray(definition[type]) ? definition[type] : [];
            const canonicalEntries: {
                canonical: string;
                display: string;
                normalized: string;
            }[] = [];
            const seenCanonical = new Set<string>();

            for (const entry of rawDefinitionEntries) {
                if (typeof entry !== 'string') {
                    continue;
                }
                const canonical = canonicalizeKnowledgeEntryGender(entry);
                const normalizedCanonical = normalizeKnowledgeEntry(canonical);
                if (normalizedCanonical.length === 0 || seenCanonical.has(normalizedCanonical)) {
                    continue;
                }
                seenCanonical.add(normalizedCanonical);
                canonicalEntries.push({
                    canonical,
                    display: formatKnowledgeEntryForGender(canonical, characterGender),
                    normalized: normalizedCanonical,
                });
            }

            const total = canonicalEntries.length;
            totalEntries += total;

            const knownSet = new Set<string>();
            const entries = progressEntry?.entries?.[type];
            if (Array.isArray(entries)) {
                for (const entry of entries) {
                    if (typeof entry !== 'string') {
                        continue;
                    }
                    const normalized = normalizeKnowledgeEntry(entry);
                    if (normalized.length > 0) {
                        knownSet.add(normalized);
                    }
                }
            }

            const missing: string[] = [];
            const entriesList: KnowledgeDetailsReportTypeEntry[] = [];
            for (const entry of canonicalEntries) {
                const isKnown = knownSet.has(entry.normalized);
                const displayEntry = entry.display;
                entriesList.push({
                    name: displayEntry,
                    status: isKnown ? 'known' : 'missing',
                });
                if (!isKnown) {
                    missing.push(displayEntry);
                }
            }

            const unknown = sanitizeStringArray(progressEntry?.unknownEntries?.[type]).map((entry) =>
                formatKnowledgeEntryForGender(entry, characterGender),
            );
            const rawLevelValue =
                typeof progressEntry?.levels?.[type] === 'string' ? progressEntry?.levels?.[type] : undefined;
            const known = canonicalEntries.reduce(
                (count, entry) => (knownSet.has(entry.normalized) ? count + 1 : count),
                0,
            );
            const levelResult = computeKnowledgeLevel(known, total, rawLevelValue);

            if (known > 0 || missing.length > 0 || unknown.length > 0 || levelResult) {
                hasData = true;
            }

            const summary: KnowledgeDetailsReportTypeSummary = {
                total,
                known,
                missing,
                unknown,
                entries: entriesList,
                levelMax: Math.max(KNOWLEDGE_LEVEL_LABELS.length - 1, 0),
            };

            if (levelResult) {
                summary.level = levelResult.label;
                summary.levelIndex = levelResult.index;
            }

            summaries[type] = summary;
        }

        const updatedAt =
            progressEntry && typeof progressEntry.updatedAt === 'number'
                ? progressEntry.updatedAt
                : null;

        if (!hasData && totalEntries === 0) {
            continue;
        }

        categories.push({
            name: config.base,
            dative: getDativeCategoryName(config.base),
            updatedAt,
            types: summaries,
        });
    }

    if (categories.length === 0) {
        return null;
    }

    return {categories};
}

function normalizeCategory(category: string, library: KnowledgeLibraryEntry): string | null {
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

function formatCategory(
    client: Client,
    category: string,
    status: KnowledgeCategoryStatus,
): AnsiAwareBuffer {
    const dativeCategory = getDativeCategoryName(category);
    const buffer = colorString(category, STATUS_COLORS[status]);
    buffer.createLink([0, category.length], {
        onClick: () => {
            client.sendCommand(`zglebiaj wiedze o ${dativeCategory}`);
        },
        title: `Kliknij aby zgłębić wiedzę o: ${dativeCategory}`
    });
    return buffer;
}

function getUniqueLibraryCategories(library: KnowledgeLibraryEntry): string[] {
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

type KnowledgeReportLibraryCategory = {
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

type KnowledgeReportLibrary = Omit<LibraryProgressSummary, 'categories'> & {
    id: string;
    name: string;
    locationId: string;
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

type KnowledgeReportPayload = {
    libraries: KnowledgeReportLibrary[];
    categories: KnowledgeReportCategory[];
};

type KnowledgeDetailsReportTypeEntry = {
    name: string;
    status: 'known' | 'missing';
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

type KnowledgeDetailsReportPayload = {
    categories: KnowledgeDetailsReportCategory[];
};

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
        const dative = getDativeCategoryName(category);

        categoryDetails.push({
            name: category,
            dative,
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

function buildKnowledgeReport(
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

        if (summary.categories.length === 0) {
            continue;
        }

        for (const detail of summary.categories) {
            const category = detail.name;
            const {status, dative} = detail;
            let categoryEntry = categoriesMap.get(category);
            if (!categoryEntry) {
                categoryEntry = {
                    category,
                    dative,
                    libraries: [],
                    hasRemaining: false,
                };
                categoriesMap.set(category, categoryEntry);
            }

            categoryEntry.libraries.push({
                id: libraryId,
                name: library.name,
                status,
            });

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

export default function initKnowledge(client: Client, aliases?: AliasEntry[]) {
    const aliasList = aliases ?? client.aliases;
    const store = getKnowledgeStore();
    const detailsStore = getKnowledgeDetailsStore();
    let currentLibraryId: string | null = null;
    let currentSnapshot: KnowledgeSnapshot | undefined;
    let knowledgeDetailsSnapshot: KnowledgeDetailsSnapshot | undefined;
    let currentCharacterGender: KnowledgeCharacterGender | null = null;
    let pendingGenderUpdate = false;
    let activeKnowledgeRun:
        | { tag: string; abortTimer: number; inactivityTimer: number | null }
        | null = null;
    let pendingPromptTrigger: {
        trigger: ReturnType<typeof client.Triggers.registerOneTimeTrigger>;
        timeoutId: number;
    } | null = null;
    const pendingEntryUpdates: KnowledgeEntryTriggerTarget[] = [];
    let suppressEntryHighlighting = false;

    function markKnowledgeEntryKnown(
        category: KnowledgeCategoryBaseName,
        type: KnowledgeDetailsType,
        entry: string,
    ) {
        const canonical = canonicalizeKnowledgeEntryGender(entry);
        const normalized = normalizeKnowledgeEntry(canonical);
        if (normalized.length === 0) {
            return;
        }

        if (!knowledgeDetailsSnapshot) {
            const alreadyQueued = pendingEntryUpdates.some(
                (update) =>
                    update.category === category &&
                    update.type === type &&
                    normalizeKnowledgeEntry(update.canonical) === normalized,
            );
            if (!alreadyQueued) {
                pendingEntryUpdates.push({category, type, canonical});
            }
            return;
        }

        const timestamp = Date.now();
        const characterKey = getCharacterProgressKey();

        void detailsStore
            .applyLocalChange((snapshot) => {
                const baseSnapshot = snapshot ?? knowledgeDetailsSnapshot!;
                const definitions = baseSnapshot.data.definitions;
                if (!definitions?.[category]) {
                    return baseSnapshot;
                }

                const nextProgress = {...baseSnapshot.data.progress};
                const characterProgress = ensureKnowledgeCharacterProgress(
                    nextProgress[characterKey] as KnowledgeCharacterProgress | undefined,
                );
                const previousCategory = characterProgress[category];

                const entriesMap = ensureKnowledgeEntriesMap(previousCategory?.entries);
                const unknownMap = ensureKnowledgeEntriesMap(previousCategory?.unknownEntries);
                const levels = ensureKnowledgeLevels(previousCategory?.levels);

                const knownList = entriesMap[type];
                let changed = false;

                if (!knownList.some((value) => normalizeKnowledgeEntry(value) === normalized)) {
                    knownList.push(canonical);
                    changed = true;
                }

                const unknownList = unknownMap[type];
                const filteredUnknown = unknownList.filter(
                    (value) => normalizeKnowledgeEntry(value) !== normalized,
                );

                if (filteredUnknown.length !== unknownList.length) {
                    unknownMap[type] = filteredUnknown;
                    changed = true;
                }

                if (!changed) {
                    return baseSnapshot;
                }

                characterProgress[category] = {
                    entries: entriesMap,
                    unknownEntries: unknownMap,
                    levels,
                    updatedAt: timestamp,
                };
                nextProgress[characterKey] = characterProgress;

                return {
                    ...baseSnapshot,
                    data: {
                        ...baseSnapshot.data,
                        progress: nextProgress,
                    },
                };
            })
            .catch((error) => {
                console.error('Failed to mark knowledge entry as known:', error);
            });
    }

    function addEntryVariant(
        variants: Map<string, KnowledgeEntryTriggerTarget[]>,
        variant: string,
        target: KnowledgeEntryTriggerTarget,
    ) {
        const trimmed = variant.trim();
        if (trimmed.length === 0) {
            return;
        }

        const existing = variants.get(trimmed);
        if (existing) {
            const alreadyPresent = existing.some(
                (entry) =>
                    entry.category === target.category &&
                    entry.type === target.type &&
                    normalizeKnowledgeEntry(entry.canonical) === normalizeKnowledgeEntry(target.canonical),
            );
            if (!alreadyPresent) {
                existing.push(target);
            }
            return;
        }

        variants.set(trimmed, [target]);
    }

    function registerKnowledgeEntryTriggers(snapshot: KnowledgeDetailsSnapshot | undefined) {
        client.Triggers.removeByTag(KNOWLEDGE_ENTRY_TRIGGER_TAG);

        if (!snapshot) {
            return;
        }

        const variantMap = new Map<string, KnowledgeEntryTriggerTarget[]>();

        for (const config of KNOWLEDGE_CATEGORY_CONFIG) {
            const definition = snapshot.data.definitions[config.base];
            if (!definition) {
                continue;
            }

            for (const type of KNOWLEDGE_DETAILS_TYPES) {
                const entries = definition[type] ?? [];
                for (const entry of entries) {
                    if (typeof entry !== 'string') {
                        continue;
                    }

                    const canonical = canonicalizeKnowledgeEntryGender(entry);
                    if (canonical.trim().length === 0) {
                        continue;
                    }

                    const target: KnowledgeEntryTriggerTarget = {
                        category: config.base,
                        type,
                        canonical,
                    };

                    addEntryVariant(variantMap, canonical, target);
                    const femaleVariant = formatKnowledgeEntryForGender(canonical, 'female');
                    if (femaleVariant !== canonical) {
                        addEntryVariant(variantMap, femaleVariant, target);
                    }
                }
            }
        }

        for (const [token, targets] of variantMap.entries()) {
            client.Triggers.registerTokenTrigger(
                token,
                (line, matches) => {
                    const tokenText = matches[0];
                    if (!tokenText) {
                        return line;
                    }

                    const startIndex =
                        typeof matches.index === 'number' && matches.index >= 0
                            ? matches.index
                            : line.text.indexOf(tokenText);

                    if (!suppressEntryHighlighting && startIndex >= 0) {
                        const endIndex = startIndex + tokenText.length;
                        line.replace([startIndex, endIndex], tokenText, KNOWLEDGE_ENTRY_HIGHLIGHT_COLOR);
                    }

                    for (const target of targets) {
                        markKnowledgeEntryKnown(target.category, target.type, target.canonical);
                    }

                    return line;
                },
                KNOWLEDGE_ENTRY_TRIGGER_TAG,
            );
        }
    }

    function getCharacterProgressKey(): string {
        const current = getCurrentCharacter();
        if (!current) {
            return DEFAULT_KNOWLEDGE_CHARACTER_KEY;
        }
        const trimmed = current.trim();
        return trimmed.length > 0 ? trimmed : DEFAULT_KNOWLEDGE_CHARACTER_KEY;
    }

    void store.refresh().catch((error) => {
        console.error('Failed to refresh knowledge data:', error);
    });

    store.subscribe((snapshot) => {
        currentSnapshot = snapshot ?? undefined;
        if (client.Map.currentRoom) {
            updateCurrentLibrary(client.Map.currentRoom);
        }
    });

    void detailsStore.refresh().catch((error) => {
        console.error('Failed to refresh knowledge details:', error);
    });

    function persistCharacterGender(gender: KnowledgeCharacterGender) {
        if (!knowledgeDetailsSnapshot) {
            pendingGenderUpdate = true;
            return;
        }

        const characterKey = getCharacterProgressKey();
        const storedGender = knowledgeDetailsSnapshot.data.characters?.[characterKey]?.gender ?? null;
        if (storedGender === gender) {
            pendingGenderUpdate = false;
            return;
        }

        const timestamp = Date.now();

        void detailsStore
            .applyLocalChange((snapshot) => {
                const baseSnapshot = snapshot ?? knowledgeDetailsSnapshot!;
                const nextCharacters = {...(baseSnapshot.data.characters ?? {})};
                const previousMetadata = nextCharacters[characterKey] ?? {};
                nextCharacters[characterKey] = {
                    ...previousMetadata,
                    gender,
                    updatedAt: timestamp,
                };

                return {
                    ...baseSnapshot,
                    data: {
                        ...baseSnapshot.data,
                        characters: nextCharacters,
                    },
                };
            })
            .catch((error) => {
                console.error('Failed to store knowledge character metadata:', error);
            });

        pendingGenderUpdate = false;
    }

    detailsStore.subscribe((snapshot) => {
        knowledgeDetailsSnapshot = snapshot ?? undefined;

        registerKnowledgeEntryTriggers(knowledgeDetailsSnapshot);

        if (knowledgeDetailsSnapshot && pendingEntryUpdates.length > 0) {
            const queued = pendingEntryUpdates.splice(0, pendingEntryUpdates.length);
            for (const update of queued) {
                markKnowledgeEntryKnown(update.category, update.type, update.canonical);
            }
        }

        if (!pendingGenderUpdate || !knowledgeDetailsSnapshot) {
            if (knowledgeDetailsSnapshot && pendingGenderUpdate) {
                pendingGenderUpdate = false;
            }
            return;
        }

        const characterKey = getCharacterProgressKey();
        const storedGender = knowledgeDetailsSnapshot.data.characters?.[characterKey]?.gender ?? null;

        if (currentCharacterGender && storedGender !== currentCharacterGender) {
            persistCharacterGender(currentCharacterGender);
        } else {
            pendingGenderUpdate = false;
        }
    });

    client.on('gmcp.char.info', (detail) => {
        const parsedGender = parseKnowledgeGender(detail);
        if (!parsedGender) {
            return;
        }
        if (currentCharacterGender === parsedGender) {
            return;
        }

        currentCharacterGender = parsedGender;
        persistCharacterGender(parsedGender);
    });

    function clearPendingPrompt(removeTrigger: boolean) {
        if (!pendingPromptTrigger) {
            return;
        }

        window.clearTimeout(pendingPromptTrigger.timeoutId);
        if (removeTrigger) {
            client.Triggers.removeTrigger(pendingPromptTrigger.trigger);
        }
        pendingPromptTrigger = null;
    }

    function updateCurrentLibrary(room: any) {
        const internalId: string | undefined = room?.userData?.internal_id;
        if (!internalId || !currentSnapshot?.data.libraries[internalId]) {
            currentLibraryId = null;
            return;
        }
        currentLibraryId = internalId;
    }

    function setProgress(category: string, status: KnowledgeCategoryStatus) {
        if (!currentSnapshot) {
            return;
        }
        const libraryId = currentLibraryId;
        if (!libraryId) {
            return;
        }
        const library = currentSnapshot.data.libraries[libraryId];
        if (!library) {
            return;
        }
        const normalized = normalizeCategory(category, library);
        if (!normalized) {
            return;
        }

        void store
            .applyLocalChange((snapshot) => {
                if (!snapshot) {
                    return snapshot;
                }

                if (!snapshot.data.libraries[libraryId]) {
                    return snapshot;
                }

                const nextProgress = {...snapshot.data.progress};
                const characterKey = getCharacterProgressKey();
                const characterProgress = {...(nextProgress[characterKey] ?? {})};
                const libraryProgress = {...(characterProgress[libraryId] ?? {})};
                const previousStatus = libraryProgress[normalized];

                if (previousStatus === 'completed' && status !== 'completed') {
                    return snapshot;
                }

                if (previousStatus === status) {
                    return snapshot;
                }

                libraryProgress[normalized] = status;
                characterProgress[libraryId] = libraryProgress;
                nextProgress[characterKey] = characterProgress;

                return {
                    ...snapshot,
                    data: {
                        ...snapshot.data,
                        progress: nextProgress,
                    },
                };
            })
            .catch((error) => {
                console.error('Failed to update knowledge progress:', error);
            });
    }

    client.on('enterLocation', (detail) => {
        updateCurrentLibrary((detail as { room?: any })?.room);
    });

    client.on('command', (command = '') => {
        const normalized = command.trim();
        if (normalized !== 'zglebiaj wiedze') {
            return;
        }

        clearPendingPrompt(true);
        const trigger = client.Triggers.registerOneTimeTrigger(
            KNOWLEDGE_PROMPT_PATTERN,
            (line, matches) => {
                clearPendingPrompt(false);
                const categoriesText = matches[1];
                if (categoriesText) {
                    handleKnowledgePrompt(categoriesText);
                }
                return line;
            },
            'knowledge-progress',
        );

        const timeoutId = window.setTimeout(() => {
            clearPendingPrompt(true);
        }, 5000);

        pendingPromptTrigger = {trigger, timeoutId};
    });

    client.Triggers.registerTrigger(
        START_LIBRARY_PATTERN,
        (line, matches) => {
            const category = matches[1];
            if (category) {
                setProgress(category, 'in_progress');
            }
            return line;
        },
        'knowledge-progress',
    );

    client.Triggers.registerTrigger(
        COMPLETE_LIBRARY_PATTERN,
        (line, matches) => {
            const category = matches[1];
            if (category) {
                setProgress(category, 'completed');
            }
            return line;
        },
        'knowledge-progress',
    );

    function getActiveLibraryContext():
        | {
        libraryId: string;
        library: KnowledgeLibraryEntry;
        libraryProgress: Record<string, KnowledgeCategoryStatus>;
    }
        | null {
        if (!currentSnapshot) {
            return null;
        }

        const libraryId = currentLibraryId;
        if (!libraryId) {
            return null;
        }

        const library = currentSnapshot.data.libraries[libraryId];
        if (!library) {
            return null;
        }

        const characterKey = getCharacterProgressKey();
        const characterProgress = currentSnapshot.data.progress[characterKey] ?? {};
        const libraryProgress = characterProgress[libraryId] ?? {};

        return {libraryId, library, libraryProgress};
    }

    function printLibraryCategories(
        library: KnowledgeLibraryEntry,
        libraryProgress: Record<string, KnowledgeCategoryStatus>,
        categories: string[],
    ) {
        const header = colorString(library.name, HEADER_COLOR);
        const lines = categories.map((category) => {
            const status = libraryProgress[category] ?? 'not_started';
            return formatCategory(client, category, status).prepend(' - ').suffix('\n');
        });

        [header, ...lines].forEach((line) => {
            client.print(line);
        })
    }

    function handleKnowledgePrompt(categoriesText: string) {
        if (!currentSnapshot) {
            client.println('Dane wiedzy nie sa jeszcze dostepne.');
            return;
        }

        const libraryId = currentLibraryId;
        if (!libraryId) {
            client.println('Nie jestes w bibliotece.');
            return;
        }

        const library = currentSnapshot.data.libraries[libraryId];
        if (!library) {
            client.println('Brak danych o tej bibliotece.');
            return;
        }

        const cleaned = categoriesText.trim().replace(/\?$/, '').replace(/\s+/g, ' ');
        const normalizedPrompt = cleaned.replace(/\s+czy o\s+/gi, ', o ');
        const rawCategories = normalizedPrompt
            .split(/, o /i)
            .map((entry) => entry.trim().replace(/^[Oo]\s+/, '').trim())
            .filter((entry) => entry.length > 0);

        const normalizedCategories: string[] = [];
        const seenNormalized = new Set<string>();
        const unrecognized: string[] = [];
        for (const rawCategory of rawCategories) {
            const normalized = normalizeCategory(rawCategory, library);
            if (!normalized) {
                unrecognized.push(rawCategory);
                continue;
            }
            const key = normalized.toLowerCase();
            if (seenNormalized.has(key)) {
                continue;
            }

            seenNormalized.add(key);
            normalizedCategories.push(normalized);
        }

        const uniqueLibraryCategories = getUniqueLibraryCategories(library);
        const expectedSet = new Set(uniqueLibraryCategories);
        const seenSet = new Set(normalizedCategories);
        const missing = uniqueLibraryCategories.filter((category) => !seenSet.has(category));
        const unexpected = normalizedCategories.filter((category) => !expectedSet.has(category));

        if (
            unrecognized.length > 0 ||
            missing.length > 0 ||
            unexpected.length > 0 ||
            normalizedCategories.length !== uniqueLibraryCategories.length
        ) {
            const messages: string[] = [];
            if (unrecognized.length > 0) {
                messages.push(
                    `Nie rozpoznano kategorii: ${unrecognized.join(', ')}.`,
                );
            }
            if (missing.length > 0) {
                messages.push(`Brakuje kategorii: ${missing.join(', ')}.`);
            }
            if (unexpected.length > 0) {
                messages.push(`Nieoczekiwane kategorie: ${unexpected.join(', ')}.`);
            }
            messages.push('Prosze zglosic to do developera.');
            client.println(messages.join('\n'));
            console.warn('Knowledge prompt mismatch', {
                categoriesText,
                rawCategories,
                unrecognized,
                missing,
                unexpected,
            });
            return;
        }

        const characterKey = getCharacterProgressKey();
        const characterProgress = currentSnapshot.data.progress[characterKey] ?? {};
        const libraryProgress = characterProgress[libraryId] ?? {};

        printLibraryCategories(
            library,
            libraryProgress,
            getUniqueLibraryCategories(library),
        );
    }

    function showLibraryCategories() {
        if (!currentSnapshot) {
            client.println('Dane wiedzy nie sa jeszcze dostepne.');
            return;
        }

        const context = getActiveLibraryContext();
        if (!context) {
            if (!currentLibraryId) {
                client.println('Nie jestes w bibliotece.');
                return;
            }

            client.println('Brak danych o tej bibliotece.');
            return;
        }

        printLibraryCategories(
            context.library,
            context.libraryProgress,
            getUniqueLibraryCategories(context.library),
        );
    }

    function dispatchKnowledgeReport() {
        if (!currentSnapshot) {
            client.sendEvent('knowledgeReport', null);
            return;
        }

        const libraryEntries = Object.entries(currentSnapshot.data.libraries);
        if (libraryEntries.length === 0) {
            client.sendEvent('knowledgeReport', null);
            return;
        }

        const characterKey = getCharacterProgressKey();
        const characterProgress = currentSnapshot.data.progress[characterKey] ?? {};
        const report = buildKnowledgeReport(libraryEntries, characterProgress);
        client.sendEvent('knowledgeReport', report);
    }

    async function updateLibraryCategoriesStatus(
        libraryId: string,
        status: KnowledgeCategoryStatus,
    ): Promise<boolean> {
        if (!currentSnapshot) {
            return false;
        }

        const library = currentSnapshot.data.libraries[libraryId];
        if (!library) {
            return false;
        }

        const categories = getUniqueLibraryCategories(library);
        if (categories.length === 0) {
            return false;
        }

        let updated = false;

        try {
            await store.applyLocalChange((snapshot) => {
                if (!snapshot) {
                    return snapshot;
                }

                if (!snapshot.data.libraries[libraryId]) {
                    return snapshot;
                }

                const nextProgress = {...snapshot.data.progress};
                const characterKey = getCharacterProgressKey();
                const characterProgress = {...(nextProgress[characterKey] ?? {})};
                const libraryProgress = {...(characterProgress[libraryId] ?? {})};

                if (status === 'not_started') {
                    let removedAny = false;
                    for (const category of categories) {
                        if (libraryProgress[category]) {
                            delete libraryProgress[category];
                            removedAny = true;
                        }
                    }

                    if (!removedAny) {
                        return snapshot;
                    }
                } else {
                    let changedAny = false;
                    for (const category of categories) {
                        if (libraryProgress[category] === status) {
                            continue;
                        }
                        libraryProgress[category] = status;
                        changedAny = true;
                    }

                    if (!changedAny) {
                        return snapshot;
                    }
                }

                updated = true;

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

                return {
                    ...snapshot,
                    data: {
                        ...snapshot.data,
                        progress: nextProgress,
                    },
                };
            });
        } catch (error) {
            console.error('Failed to update knowledge library status:', error);
            return false;
        }

        if (updated) {
            dispatchKnowledgeReport();
        }

        return updated;
    }

    client.on('knowledgeReportAction', (detail) => {
        const action = detail as KnowledgeReportAction | undefined | null;
        if (!action) {
            return;
        }
        if (action.type === 'completeLibrary') {
            void updateLibraryCategoriesStatus(action.libraryId, 'completed');
        } else if (action.type === 'resetLibrary') {
            void updateLibraryCategoriesStatus(action.libraryId, 'not_started');
        }
    });

    aliasList.push({pattern: /\/zglebiaj$/, callback: showLibraryCategories});
    aliasList.push({pattern: /\/biblioteki$/, callback: showLibrariesReport});
    aliasList.push({pattern: /\/wiedza$/, callback: openKnowledgeDetailsReport});
    aliasList.push({pattern: /\/wiedza_buduj$/, callback: buildKnowledgeDetailsData});

    function openKnowledgeDetailsReport() {
        if (!knowledgeDetailsSnapshot) {
            client.println('Dane wiedzy nie sa jeszcze dostepne. Uzyj /wiedza_buduj, aby je zbudowac.');
            client.sendEvent('knowledgeDetailsReport', null);
            return;
        }

        const characterKey = getCharacterProgressKey();
        const payload = buildKnowledgeDetailsReportPayload(
            knowledgeDetailsSnapshot,
            characterKey,
            currentCharacterGender,
        );

        if (!payload) {
            client.println(
                'Brak zapisanych danych raportu wiedzy dla tej postaci. Uzyj /wiedza_buduj, aby je zaktualizowac.',
            );
            client.sendEvent('knowledgeDetailsReport', null);
            return;
        }

        client.sendEvent('knowledgeDetailsReport', payload);
    }

    function buildKnowledgeDetailsData() {
        if (!knowledgeDetailsSnapshot) {
            client.println('Dane wiedzy nie sa jeszcze dostepne.');
            return;
        }

        if (activeKnowledgeRun) {
            client.println('Raport wiedzy jest juz generowany.');
            return;
        }

        const runTag = `knowledge-details-${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2)}`;
        const definitions = knowledgeDetailsSnapshot.data.definitions;
        const normalizedDefinitions = buildNormalizedDefinitions(definitions);
        const results = new Map<KnowledgeCategoryBaseName, KnowledgeRunCategoryState>();
        const categoriesRemaining = new Set<KnowledgeCategoryBaseName>(KNOWLEDGE_CATEGORY_ORDER);
        let currentCategory: KnowledgeCategoryBaseName | null = null;
        let currentSection: KnowledgeDetailsType | null = null;

        function ensureCategoryState(category: KnowledgeCategoryBaseName): KnowledgeRunCategoryState {
            let state = results.get(category);
            if (!state) {
                state = createEmptyKnowledgeRunCategoryState();
                results.set(category, state);
            }
            return state;
        }

        function scheduleInactivity() {
            if (!activeKnowledgeRun || activeKnowledgeRun.tag !== runTag) {
                return;
            }
            if (activeKnowledgeRun.inactivityTimer != null) {
                window.clearTimeout(activeKnowledgeRun.inactivityTimer);
            }
            activeKnowledgeRun.inactivityTimer = window.setTimeout(
                () => finishRun(false),
                KNOWLEDGE_REPORT_INACTIVITY_TIMEOUT,
            );
        }

        function finishRun(dueToTimeout: boolean) {
            if (!activeKnowledgeRun || activeKnowledgeRun.tag !== runTag) {
                return;
            }

            window.clearTimeout(activeKnowledgeRun.abortTimer);
            if (activeKnowledgeRun.inactivityTimer != null) {
                window.clearTimeout(activeKnowledgeRun.inactivityTimer);
            }
            activeKnowledgeRun = null;
            suppressEntryHighlighting = false;
            client.Triggers.removeByTag(runTag);

            if (results.size === 0) {
                client.println(dueToTimeout ? 'Nie odebrano odpowiedzi raportu wiedzy.' : 'Brak danych o wiedzy.');
                return;
            }

            const timestamp = Date.now();
            const characterKey = getCharacterProgressKey();

            for (const [category, state] of results) {
                for (const type of KNOWLEDGE_DETAILS_TYPES) {
                    const unknownList = Array.from(state.unknownEntries[type]);
                    if (unknownList.length > 0) {
                        console.warn('Nieznane wpisy wiedzy', {
                            category,
                            type,
                            entries: unknownList,
                        });
                    }
                }
            }

            void detailsStore
                .applyLocalChange((snapshot) => {
                    const baseSnapshot = snapshot ?? knowledgeDetailsSnapshot!;
                    const nextProgress = {...baseSnapshot.data.progress};
                    const characterProgress = {...(nextProgress[characterKey] ?? {})};
                    const nextCharacters = {...(baseSnapshot.data.characters ?? {})};
                    const existingMetadata = nextCharacters[characterKey] ?? {};

                    if (currentCharacterGender) {
                        nextCharacters[characterKey] = {
                            ...existingMetadata,
                            gender: currentCharacterGender,
                            updatedAt: timestamp,
                        };
                    } else if (existingMetadata && Object.keys(existingMetadata).length > 0) {
                        nextCharacters[characterKey] = {
                            ...existingMetadata,
                            updatedAt: timestamp,
                        };
                    }

                    for (const [category, state] of results) {
                        const knownEntries: Record<KnowledgeDetailsType, string[]> = {
                            fight: Array.from(state.knownEntries.fight).sort((a, b) => a.localeCompare(b)),
                            books: Array.from(state.knownEntries.books).sort((a, b) => a.localeCompare(b)),
                            exploration: Array.from(state.knownEntries.exploration).sort((a, b) =>
                                a.localeCompare(b),
                            ),
                        };

                        const unknownEntries: Record<KnowledgeDetailsType, string[]> = {
                            fight: Array.from(state.unknownEntries.fight).sort((a, b) => a.localeCompare(b)),
                            books: Array.from(state.unknownEntries.books).sort((a, b) => a.localeCompare(b)),
                            exploration: Array.from(state.unknownEntries.exploration).sort((a, b) =>
                                a.localeCompare(b),
                            ),
                        };

                        const levels: Partial<Record<KnowledgeDetailsType, string>> = {};
                        for (const type of KNOWLEDGE_DETAILS_TYPES) {
                            const level = state.levels[type];
                            if (level) {
                                levels[type] = level;
                            }
                        }

                        characterProgress[category] = {
                            entries: knownEntries,
                            unknownEntries,
                            levels,
                            updatedAt: timestamp,
                        };
                    }

                    nextProgress[characterKey] = characterProgress;

                    return {
                        ...baseSnapshot,
                        data: {
                            ...baseSnapshot.data,
                            progress: nextProgress,
                            characters: nextCharacters,
                        },
                    };
                })
                .catch((error) => {
                    console.error('Failed to store knowledge details report:', error);
                });

            const messages: string[] = [];
            if (dueToTimeout) {
                messages.push(
                    'Raport zakonczyl sie z powodu przekroczenia czasu – zebrano dostepne dane.',
                );
            }
            if (categoriesRemaining.size > 0) {
                messages.push(
                    `Nie odebrano danych dla kategorii: ${Array.from(categoriesRemaining).join(', ')}.`,
                );
            }
            messages.push(
                'Zaktualizowano dane raportu wiedzy. Uzyj /wiedza, aby wyswietlic raport w oknie.',
            );

            client.println(messages.join('\n'));
        }

        suppressEntryHighlighting = true;
        activeKnowledgeRun = {
            tag: runTag,
            abortTimer: window.setTimeout(() => finishRun(true), KNOWLEDGE_REPORT_HARD_TIMEOUT),
            inactivityTimer: null,
        };
        scheduleInactivity();

        client.Triggers.registerTrigger(
            KNOWLEDGE_HEADER_PATTERN,
            (line, matches) => {
                scheduleInactivity();
                const base = getBaseCategoryFromName(matches[1]);
                if (!base) {
                    currentCategory = null;
                    currentSection = null;
                    return line;
                }

                currentCategory = base;
                currentSection = null;
                categoriesRemaining.delete(base);
                ensureCategoryState(base);
                return line;
            },
            runTag,
        );

        client.Triggers.registerTrigger(
            KNOWLEDGE_SUMMARY_PATTERN,
            (line, matches) => {
                if (!currentCategory) {
                    return line;
                }

                const type = detectKnowledgeDetailsType(matches[1]);
                if (!type) {
                    return line;
                }

                scheduleInactivity();
                const state = ensureCategoryState(currentCategory);
                state.levels[type] = matches[2].trim();
                return line;
            },
            runTag,
        );

        client.Triggers.registerTrigger(
            KNOWLEDGE_SECTION_HEADER_PATTERN,
            (line, matches) => {
                scheduleInactivity();
                currentSection = detectKnowledgeDetailsType(matches[1]) ?? null;
                return line;
            },
            runTag,
        );

        client.Triggers.registerTrigger(
            KNOWLEDGE_ENTRY_PATTERN,
            (line, matches) => {
                if (!currentCategory || !currentSection) {
                    return line;
                }

                const entry = matches[1].trim();
                if (entry.length === 0) {
                    return line;
                }

                scheduleInactivity();
                const normalized = normalizeKnowledgeEntry(entry);
                const state = ensureCategoryState(currentCategory);
                const definitionMap = normalizedDefinitions[currentCategory]?.[currentSection];

                if (definitionMap?.has(normalized)) {
                    state.knownEntries[currentSection].add(
                        definitionMap.get(normalized) ?? entry,
                    );
                } else {
                    state.unknownEntries[currentSection].add(entry);
                }
                return line;
            },
            runTag,
        );

        client.sendCommand(KNOWLEDGE_COMMAND_SEQUENCE);
    }

    function showLibrariesReport() {
        if (!currentSnapshot) {
            client.println('Dane wiedzy nie sa jeszcze dostepne.');
            return;
        }

        const libraryEntries = Object.entries(currentSnapshot.data.libraries);
        if (libraryEntries.length === 0) {
            client.println('Brak danych o bibliotekach.');
            client.sendEvent('knowledgeReport', null);
            return;
        }

        const characterKey = getCharacterProgressKey();
        const characterProgress = currentSnapshot.data.progress[characterKey] ?? {};
        const report = buildKnowledgeReport(libraryEntries, characterProgress);

        if (!report) {
            client.println('Brak wiedzy do zglebiania w znanych bibliotekach.');
            client.sendEvent('knowledgeReport', null);
            return;
        }

        client.sendEvent('knowledgeReport', report);
    }
}
