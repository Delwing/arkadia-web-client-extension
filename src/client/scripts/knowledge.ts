import Client from '../Client';
import {colorString, createColorFormat, mudletColorLine} from '@modules/core/Colors';
import type {KnowledgeReportAction} from '@shared/events';
import {
    DEFAULT_KNOWLEDGE_CHARACTER_KEY,
    getKnowledgeStore,
    KnowledgeBookEntry,
    KnowledgeCategoryStatus,
    KnowledgeLibraryEntry,
    KnowledgeLibraryProgress,
    KnowledgeProgress,
    KnowledgeProgressByCharacter,
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
import {characterStorage, globalStorage} from '@modules/core/storage';
import {stripPolishCharacters} from '../stripPolishCharacters';
import {AnsiAwareBuffer, FormatStateSnapshot} from "@client/ansi/FormatState.ts";
import {
    setPluginLocationNote,
    removeAllPluginNotes,
} from '@modules/core/pluginLocationNotesRegistry';
import knowledgeData from '../knowledge.json';
import { showBookTooltip, hideBookTooltip } from '@web/bookTooltip';
import { showContextMenu } from '@web/contextMenu';
import {
    addKnowledgeEvent,
    parseDativeCategory,
    getKnowledgeEventsForCharacter,
} from '@modules/data/dataStores/knowledgeEventsStore';

interface KnowledgeJsonEntry {
    Rodzaj: string;
    Wiedza: string;
    id: number | null;
    lokalizacja?: string;
    note?: string;
}

type KnowledgeEntryInfo = {
    id: number | null;
    lokalizacja?: string;
    note?: string;
};

const knowledgeEntryLookup: Map<string, KnowledgeEntryInfo> = (() => {
    const map = new Map<string, KnowledgeEntryInfo>();
    for (const entry of knowledgeData as KnowledgeJsonEntry[]) {
        if (!entry.Wiedza) continue;
        const key = normalizeKnowledgeLookupKey(entry.Wiedza);
        if (key.length > 0 && !map.has(key)) {
            map.set(key, {
                id: entry.id,
                lokalizacja: entry.lokalizacja,
                note: entry.note,
            });
        }
    }
    return map;
})();

function normalizeKnowledgeLookupKey(value: string): string {
    return stripPolishCharacters(value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/u, ''));
}

function lookupKnowledgeEntryInfo(canonical: string): KnowledgeEntryInfo | undefined {
    return knowledgeEntryLookup.get(normalizeKnowledgeLookupKey(canonical));
}

type AliasEntry = { pattern: RegExp; callback: Function };

const STATUS_COLORS: Record<KnowledgeCategoryStatus, FormatStateSnapshot> = {
    not_started: createColorFormat('#ffffff'),
    in_progress: createColorFormat('#ffff00'),
    completed: createColorFormat('#00ff00'),
};

const HEADER_COLOR = createColorFormat('#7cfc00');
const KNOWLEDGE_ENTRY_HIGHLIGHT_COLOR = createColorFormat('#ffe066');
const BOOK_STATUS_COLORS = {
    in_progress: createColorFormat('#b8a960'),
    completed: createColorFormat('#7aab7a'),
};
const KNOWLEDGE_ENTRY_TRIGGER_TAG = 'knowledge-entry-triggers';
const BOOK_TRIGGER_TAG = 'book-triggers';

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

const KNOWLEDGE_TICK_PATTERN =
    /^Wydaje ci sie, ze twoja wiedza (.+) wzrosla .*\.$/;
const KNOWLEDGE_BOOK_START_PATTERN =
    /^Zaczynasz zglebiac (?!tutejsze zasoby,)(.+?), probujac dowiedziec sie czegos wiecej o (.*)\.$/;
const KNOWLEDGE_BOOK_COMPLETE_PATTERN =
    /^Masz wrazenie, ze z (.+?) nie dowiesz sie juz niczego wiecej (.*)\.$/;
const WIEDZA_TOTAL_LEVEL_PATTERN =
    /^(.+?):\s{2,}(.+)$/;

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
    gameReportedLevel: string | undefined,
): KnowledgeLevelResult | undefined {
    return getKnowledgeLevelFromLabel(gameReportedLevel);
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

function createEmptyEntriesMap(): KnowledgeEntriesMap {
    return {fight: [], books: [], exploration: []};
}

function upsertCategoryTotalLevel(
    characterProgress: KnowledgeCharacterProgress,
    category: KnowledgeCategoryBaseName,
    level: string,
    timestamp: number,
): void {
    const existing = characterProgress[category];
    if (existing) {
        characterProgress[category] = {...existing, totalLevel: level, updatedAt: timestamp};
    } else {
        characterProgress[category] = {
            entries: createEmptyEntriesMap(),
            unknownEntries: createEmptyEntriesMap(),
            levels: {},
            totalLevel: level,
            updatedAt: timestamp,
        };
    }
}

function applyTotalLevels(
    baseProgress: Record<string, KnowledgeCharacterProgress>,
    characterKey: string,
    levels: Iterable<[KnowledgeCategoryBaseName, string]>,
    timestamp: number,
): Record<string, KnowledgeCharacterProgress> {
    const nextProgress = {...baseProgress};
    const characterProgress = {...(nextProgress[characterKey] ?? {})};
    for (const [category, level] of levels) {
        upsertCategoryTotalLevel(characterProgress, category, level, timestamp);
    }
    nextProgress[characterKey] = characterProgress;
    return nextProgress;
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
                // Skip removed entries
                if (canonical === 'Usuniete' || normalizedCanonical === 'usuniete') {
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
                const info = lookupKnowledgeEntryInfo(entry.canonical);
                const reportEntry: KnowledgeDetailsReportTypeEntry = {
                    name: displayEntry,
                    status: isKnown ? 'known' : 'missing',
                };
                if (info) {
                    reportEntry.id = info.id;
                    if (info.lokalizacja) reportEntry.lokalizacja = info.lokalizacja;
                    if (info.note) reportEntry.note = info.note;
                }
                entriesList.push(reportEntry);
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
            const levelResult = computeKnowledgeLevel(rawLevelValue);

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

function buildKnowledgeDetailsReportPayloadWithoutProgress(
    snapshot: KnowledgeDetailsSnapshot,
): KnowledgeDetailsReportPayload | null {
    const {definitions} = snapshot.data;

    const categories: KnowledgeDetailsReportCategory[] = [];

    for (const config of KNOWLEDGE_CATEGORY_CONFIG) {
        const base = config.base;
        const definition = definitions[base];

        if (!definition) {
            continue;
        }

        const summaries = {} as Record<KnowledgeDetailsType, KnowledgeDetailsReportTypeSummary>;
        let totalEntries = 0;

        for (const type of KNOWLEDGE_DETAILS_TYPES) {
            const rawDefinitionEntries =
                Array.isArray(definition[type]) ? definition[type] : [];
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
                // Skip removed entries
                if (canonical === 'Usuniete' || normalizedCanonical === 'usuniete') {
                    continue;
                }
                seenCanonical.add(normalizedCanonical);
                // Show all entries in canonical form (male) when no character gender is known
                canonicalEntries.push({
                    canonical,
                    display: canonical,
                    normalized: normalizedCanonical,
                });
            }

            const total = canonicalEntries.length;
            totalEntries += total;

            // All entries are missing (no progress data)
            const missing: string[] = [];
            const entriesList: KnowledgeDetailsReportTypeEntry[] = [];
            for (const entry of canonicalEntries) {
                const info = lookupKnowledgeEntryInfo(entry.canonical);
                const reportEntry: KnowledgeDetailsReportTypeEntry = {
                    name: entry.display,
                    status: 'missing',
                };
                if (info) {
                    reportEntry.id = info.id;
                    if (info.lokalizacja) reportEntry.lokalizacja = info.lokalizacja;
                    if (info.note) reportEntry.note = info.note;
                }
                entriesList.push(reportEntry);
                missing.push(entry.display);
            }

            summaries[type] = {
                total,
                known: 0,
                missing,
                unknown: [],
                entries: entriesList,
                levelMax: Math.max(KNOWLEDGE_LEVEL_LABELS.length - 1, 0),
            };
        }

        if (totalEntries === 0) {
            continue;
        }

        categories.push({
            name: config.base,
            dative: getDativeCategoryName(config.base),
            updatedAt: null,
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
    let reportUpdateTimer: ReturnType<typeof setTimeout> | undefined;
    let knowledgeReportTimer: ReturnType<typeof setTimeout> | undefined;

    function scheduleReportUpdate() {
        // Debounce: cancel previous timer and schedule a new one
        // This ensures we emit the report only once after all updates settle
        if (reportUpdateTimer != null) {
            clearTimeout(reportUpdateTimer);
        }
        reportUpdateTimer = setTimeout(() => {
            reportUpdateTimer = undefined;
            if (!knowledgeDetailsSnapshot) return;
            const characterKey = getCharacterProgressKey();
            const payload = buildKnowledgeDetailsReportPayload(
                knowledgeDetailsSnapshot,
                characterKey,
                currentCharacterGender,
            );
            if (payload) {
                client.sendEvent('knowledgeDetailsReport', payload);
            }
            client.sendEvent('knowledgeDetailsUpdated', { character: characterKey });
        }, 50);
    }

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
            .then(() => {
                refreshKnowledgeHintsIfNeeded();
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

    type BookTriggerEntry = { bookKey: string; dopelniacz: string; categories: string[] };

    function findBookProgValue(
        bookProg: Record<string, true | 'in_progress'>,
        cat: string,
    ): true | 'in_progress' | undefined {
        if (bookProg[cat] != null) return bookProg[cat];
        const lower = cat.toLowerCase();
        for (const [key, value] of Object.entries(bookProg)) {
            if (key.toLowerCase() === lower) return value;
        }
        return undefined;
    }

    function getBookStatusColor(bookKey: string, categories: string[]): FormatStateSnapshot | null {
        if (!currentSnapshot) {
            return null;
        }
        const characterKey = getCharacterProgressKey();
        const bookProg = currentSnapshot.data.bookProgress?.[characterKey]?.[bookKey];
        if (!bookProg) {
            return null; // not_started — keep default gray
        }
        const allCompleted = categories.every((cat) => findBookProgValue(bookProg, cat) === true);
        if (allCompleted) {
            return BOOK_STATUS_COLORS.completed;
        }
        const anyStarted = categories.some((cat) => findBookProgValue(bookProg, cat) != null);
        if (anyStarted) {
            return BOOK_STATUS_COLORS.in_progress;
        }
        return null;
    }

    function registerBookTriggers(books: Record<string, KnowledgeBookEntry> | undefined) {
        client.Triggers.removeByTag(BOOK_TRIGGER_TAG);

        if (!books) {
            return;
        }

        const bookVariants = new Map<string, BookTriggerEntry>();

        for (const [key, book] of Object.entries(books)) {
            const categories = book.categories;
            if (!categories || categories.length === 0) {
                continue;
            }

            const variants = [
                book.mianownik, book.dopelniacz, book.biernik,
                book.mnoga_mianownik, book.mnoga_dopelniacz, book.mnoga_biernik,
            ].filter(
                (v): v is string => !!v && v.trim().length > 0,
            );

            for (const variant of variants) {
                const trimmed = variant.trim();
                if (trimmed.length === 0) {
                    continue;
                }

                const existing = bookVariants.get(trimmed);
                if (existing) {
                    for (const cat of categories) {
                        if (!existing.categories.includes(cat)) {
                            existing.categories.push(cat);
                        }
                    }
                } else {
                    bookVariants.set(trimmed, {
                        bookKey: key,
                        dopelniacz: book.dopelniacz,
                        categories: [...categories],
                    });
                }
            }
        }

        for (const [token, entry] of bookVariants.entries()) {
            client.Triggers.registerTokenTrigger(
                token,
                (line, matches) => {
                    const tokenText = matches[0];
                    if (!tokenText) {
                        return line;
                    }

                    // Color based on book progress status
                    const bookColor = getBookStatusColor(entry.bookKey, entry.categories);
                    if (bookColor) {
                        const startIndex =
                            typeof matches.index === 'number' && matches.index >= 0
                                ? matches.index
                                : line.text.indexOf(tokenText);
                        if (startIndex >= 0) {
                            line.replace([startIndex, startIndex + tokenText.length], tokenText, bookColor);
                        }
                    }

                    line.createLinksForText(tokenText, {
                        onMouseEnter: (ev) => showBookTooltip(entry.categories, ev.pageX, ev.pageY),
                        onMouseLeave: () => hideBookTooltip(),
                        onContextMenu: (ev) => {
                            hideBookTooltip();
                            const items = entry.categories.map((category) => {
                                const dative = getDativeCategoryName(category);
                                const cmd = `zglebiaj wiedze o ${dative} z ${entry.dopelniacz}`;
                                return { label: cmd, action: () => client.sendCommand(cmd) };
                            });
                            showContextMenu(items, ev.pageX, ev.pageY);
                        },
                    });

                    return line;
                },
                BOOK_TRIGGER_TAG,
            );
        }
    }

    function getCharacterProgressKey(): string {
        const current = characterStorage.getCharacter();
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
        registerBookTriggers(snapshot?.data.books);
        if (client.Map.currentRoom) {
            updateCurrentLibrary(client.Map.currentRoom);
        }
        if (knowledgeReportTimer != null) {
            clearTimeout(knowledgeReportTimer);
        }
        knowledgeReportTimer = setTimeout(() => {
            knowledgeReportTimer = undefined;
            dispatchKnowledgeReport();
        }, 50);
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

        scheduleReportUpdate();
        refreshKnowledgeHintsIfNeeded();

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

    let lastCharacterKey = getCharacterProgressKey();

    client.on('gmcp.char.info', (detail) => {
        const characterKey = getCharacterProgressKey();
        if (lastCharacterKey !== null && lastCharacterKey !== characterKey) {
            refreshKnowledgeHintsIfNeeded();
        }
        lastCharacterKey = characterKey;

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
        const internalId: string | undefined = room?.userData?.internal_id?.trim();
        if (!internalId || !currentSnapshot?.data.libraries[internalId]) {
            currentLibraryId = null;
            return;
        }
        currentLibraryId = internalId;
    }

    type LibraryProgressContext = {
        snapshot: KnowledgeSnapshot;
        libraryId: string;
        nextProgress: KnowledgeProgressByCharacter;
        characterKey: string;
        characterProgress: KnowledgeProgress;
        libraryProgress: KnowledgeLibraryProgress;
    };

    function prepareLibraryProgressUpdate(
        snapshot: KnowledgeSnapshot | undefined,
        libraryId: string,
    ): LibraryProgressContext | null {
        if (!snapshot || !snapshot.data.libraries[libraryId]) {
            return null;
        }
        const nextProgress = {...snapshot.data.progress};
        const characterKey = getCharacterProgressKey();
        const characterProgress = {...(nextProgress[characterKey] ?? {})};
        const libraryProgress = {...(characterProgress[libraryId] ?? {})};
        return {snapshot, libraryId, nextProgress, characterKey, characterProgress, libraryProgress};
    }

    function commitLibraryProgress(ctx: LibraryProgressContext): KnowledgeSnapshot {
        if (Object.keys(ctx.libraryProgress).length === 0) {
            delete ctx.characterProgress[ctx.libraryId];
        } else {
            ctx.characterProgress[ctx.libraryId] = ctx.libraryProgress;
        }
        if (Object.keys(ctx.characterProgress).length === 0) {
            delete ctx.nextProgress[ctx.characterKey];
        } else {
            ctx.nextProgress[ctx.characterKey] = ctx.characterProgress;
        }
        return {...ctx.snapshot, data: {...ctx.snapshot.data, progress: ctx.nextProgress}};
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
                const ctx = prepareLibraryProgressUpdate(snapshot, libraryId);
                if (!ctx) return snapshot;

                const previousStatus = ctx.libraryProgress[normalized];
                if (previousStatus === 'completed' && status !== 'completed') return snapshot;
                if (previousStatus === status) return snapshot;

                ctx.libraryProgress[normalized] = status;
                ctx.characterProgress[libraryId] = ctx.libraryProgress;
                ctx.nextProgress[ctx.characterKey] = ctx.characterProgress;
                return {...ctx.snapshot, data: {...ctx.snapshot.data, progress: ctx.nextProgress}};
            })
            .catch((error) => {
                console.error('Failed to update knowledge progress:', error);
            });
    }

    function resolveBookCategory(book: KnowledgeBookEntry, category: KnowledgeCategoryBaseName): string | null {
        const lower = category.toLowerCase();
        return book.categories.find((cat) => cat.toLowerCase() === lower) ?? null;
    }

    function setBookProgress(
        bookKey: string,
        category: KnowledgeCategoryBaseName,
        status: true | 'in_progress' | false,
    ) {
        void store
            .applyLocalChange((snapshot) => {
                if (!snapshot) {
                    return snapshot;
                }

                const nextBookProgress = {...(snapshot.data.bookProgress ?? {})};
                const characterKey = getCharacterProgressKey();
                const characterBookProgress = {...(nextBookProgress[characterKey] ?? {})};
                const bookCategories = {...(characterBookProgress[bookKey] ?? {})};

                if (status === false) {
                    if (!bookCategories[category]) {
                        return snapshot;
                    }
                    delete bookCategories[category];
                } else {
                    // Don't downgrade completed to in_progress
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

                return {
                    ...snapshot,
                    data: {
                        ...snapshot.data,
                        bookProgress: nextBookProgress,
                    },
                };
            })
            .catch((error) => {
                console.error('Failed to update book progress:', error);
            });
    }

    client.on('enterLocation', (detail) => {
        const prevLibraryId = currentLibraryId;
        updateCurrentLibrary((detail as { room?: any })?.room);
        if (currentLibraryId !== prevLibraryId) {
            client.sendEvent('knowledgeReportCurrentLibrary', currentLibraryId);
        }
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

    // Capture wiedza_total levels from the "wiedza" command output
    let activeWiedzaTotalRun: {
        tag: string;
        commandTimestamp: number;
        inactivityTimer: number | null;
        abortTimer: number;
        results: Map<KnowledgeCategoryBaseName, string>;
        tickCounts: Map<KnowledgeCategoryBaseName, number>;
    } | null = null;
    const WIEDZA_TOTAL_INACTIVITY_TIMEOUT = 1500;
    const WIEDZA_TOTAL_HARD_TIMEOUT = 10000;
    const WIEDZA_TOTAL_TAG_PREFIX = 'wiedza-total-';

    const LEVEL_COLORS: Record<number, string> = {
        0: '#808080', // brak - gray
        1: '#ef4444', // znikoma - red
        2: '#ef4444', // niewielka - red
        3: '#f59e0b', // czesciowa - amber
        4: '#f59e0b', // niezla - amber
        5: '#eab308', // dosc dobra - yellow
        6: '#eab308', // dobra - yellow
        7: '#22c55e', // bardzo dobra - green
        8: '#22c55e', // doskonala - green
        9: '#16a34a', // prawie pelna - dark green
        10: '#4ade80', // pelna - bright green
    };

    function finishWiedzaTotalRun() {
        if (!activeWiedzaTotalRun) {
            return;
        }
        const run = activeWiedzaTotalRun;
        activeWiedzaTotalRun = null;

        window.clearTimeout(run.abortTimer);
        if (run.inactivityTimer != null) {
            window.clearTimeout(run.inactivityTimer);
        }
        client.Triggers.removeByTag(run.tag);

        if (run.results.size === 0 || !knowledgeDetailsSnapshot) {
            return;
        }

        const timestamp = Date.now();
        // Use the command timestamp for level_change events so ticks
        // that arrived between command send and finish are counted correctly
        const levelChangeTimestamp = run.commandTimestamp;
        const characterKey = getCharacterProgressKey();

        // Store level_change events only if the level differs from the last known event
        void getKnowledgeEventsForCharacter(characterKey).then((events) => {
            const latestLevel = new Map<string, string>();
            for (const e of events) {
                if (e.type === 'level_change' && e.level) {
                    latestLevel.set(e.category, e.level);
                }
            }

            for (const [category, level] of run.results) {
                const prevLevel = latestLevel.get(category);
                if (prevLevel === level) continue;
                void addKnowledgeEvent(characterKey, {
                    category,
                    categoryDative: getDativeCategoryName(category),
                    type: 'level_change',
                    locationId: 0,
                    timestamp: levelChangeTimestamp,
                    level,
                });
            }
        });

        void detailsStore
            .applyLocalChange((snapshot) => {
                const baseSnapshot = snapshot ?? knowledgeDetailsSnapshot!;
                const nextProgress = applyTotalLevels(baseSnapshot.data.progress, characterKey, run.results, timestamp);
                return {...baseSnapshot, data: {...baseSnapshot.data, progress: nextProgress}};
            })
            .then(() => {
                scheduleReportUpdate();
            })
            .catch((error) => {
                console.error('Failed to store wiedza_total levels:', error);
            });
    }

    client.on('command', (command = '') => {
        const normalized = command.trim();
        if (normalized !== 'wiedza') {
            return;
        }

        // Cancel any existing run
        if (activeWiedzaTotalRun) {
            finishWiedzaTotalRun();
        }

        const tag = `${WIEDZA_TOTAL_TAG_PREFIX}${Date.now().toString(36)}`;
        const commandTimestamp = Date.now();
        activeWiedzaTotalRun = {
            tag,
            commandTimestamp,
            inactivityTimer: null,
            abortTimer: window.setTimeout(() => finishWiedzaTotalRun(), WIEDZA_TOTAL_HARD_TIMEOUT),
            results: new Map(),
            tickCounts: new Map(),
        };

        // Pre-load tick counts so they're available synchronously in the trigger
        const characterKey = getCharacterProgressKey();
        void getKnowledgeEventsForCharacter(characterKey).then((events) => {
            if (!activeWiedzaTotalRun || activeWiedzaTotalRun.tag !== tag) return;

            // Find the latest level_change timestamp per category
            const lastLevelChangeTs = new Map<string, number>();
            for (const e of events) {
                if (e.type === 'level_change') {
                    const prev = lastLevelChangeTs.get(e.category) ?? 0;
                    if (e.timestamp > prev) {
                        lastLevelChangeTs.set(e.category, e.timestamp);
                    }
                }
            }

            for (const config of KNOWLEDGE_CATEGORY_CONFIG) {
                const cat = config.base;
                const sinceTs = lastLevelChangeTs.get(cat) ?? 0;
                let count = 0;
                for (const e of events) {
                    if (e.type === 'tick' && e.category === cat && e.timestamp > sinceTs) {
                        count++;
                    }
                }
                if (count > 0) {
                    activeWiedzaTotalRun.tickCounts.set(cat, count);
                }
            }
        });

        function scheduleWiedzaTotalInactivity() {
            if (!activeWiedzaTotalRun || activeWiedzaTotalRun.tag !== tag) {
                return;
            }
            if (activeWiedzaTotalRun.inactivityTimer != null) {
                window.clearTimeout(activeWiedzaTotalRun.inactivityTimer);
            }
            activeWiedzaTotalRun.inactivityTimer = window.setTimeout(
                () => finishWiedzaTotalRun(),
                WIEDZA_TOTAL_INACTIVITY_TIMEOUT,
            );
        }

        scheduleWiedzaTotalInactivity();

        client.Triggers.registerTrigger(
            WIEDZA_TOTAL_LEVEL_PATTERN,
            (line, matches) => {
                if (!activeWiedzaTotalRun || activeWiedzaTotalRun.tag !== tag) {
                    return line;
                }

                const categoryName = matches[1]?.trim();
                const levelText = matches[2]?.trim();
                if (!categoryName || !levelText) {
                    return line;
                }

                const category = getBaseCategoryFromName(categoryName);
                if (!category) {
                    return line;
                }

                const sanitizedLevel = sanitizeKnowledgeLevel(levelText);
                if (!sanitizedLevel) {
                    return line;
                }

                scheduleWiedzaTotalInactivity();
                activeWiedzaTotalRun.results.set(category, sanitizedLevel);

                // Suffix colored progress bar onto the original line
                const levelIndex = KNOWLEDGE_LEVEL_LABELS.indexOf(
                    sanitizedLevel as (typeof KNOWLEDGE_LEVEL_LABELS)[number],
                );
                const barColor = createColorFormat(LEVEL_COLORS[levelIndex] ?? '#808080');
                const dimColor = createColorFormat('#4a5568');
                const BAR_LEN = 10;
                const filled = levelIndex > 0 ? '='.repeat(levelIndex) : '';
                const empty = ' '.repeat(BAR_LEN - Math.max(0, levelIndex));
                const percent = levelIndex >= 0 ? Math.round((levelIndex / BAR_LEN) * 100) : 0;

                // Pad level text so bars align (longest level = "prawie pelna" = 12 chars)
                const MAX_LEVEL_LEN = 12;
                const levelPad = ' '.repeat(Math.max(0, MAX_LEVEL_LEN - levelText.length));
                const endPos = line.text.length;
                line.insert(endPos, levelPad + ' [', dimColor);
                if (filled) {
                    line.insert(line.text.length, filled, barColor);
                }
                if (empty) {
                    line.insert(line.text.length, empty, dimColor);
                }
                line.insert(line.text.length, ']', dimColor);

                if (percent < 100) {
                    line.insert(line.text.length, ` ${percent}%`, createColorFormat('#94a3b8'));
                    const ticks = activeWiedzaTotalRun.tickCounts.get(category) ?? 0;
                    line.insert(line.text.length, ` + ${ticks}`, createColorFormat(ticks > 0 ? '#fbbf24' : '#94a3b8'));
                    line.insert(line.text.length, ' ticks', createColorFormat('#94a3b8'));
                } else {
                    line.insert(line.text.length, ' 100%', barColor);
                }

                return line;
            },
            tag,
        );
    });

    client.Triggers.registerTrigger(
        START_LIBRARY_PATTERN,
        (line, matches) => {
            const category = matches[1];
            if (category) {
                setProgress(category, 'in_progress');
                window.setTimeout(() => dispatchKnowledgeReport(), 50);
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
                window.setTimeout(() => dispatchKnowledgeReport(), 50);
            }
            return line;
        },
        'knowledge-progress',
    );

    // Tick event: "Wydaje ci sie, ze twoja wiedza o X wzrosla ..."
    client.Triggers.registerTrigger(
        KNOWLEDGE_TICK_PATTERN,
        (line, matches) => {
            const dativeText = matches[1];
            if (dativeText) {
                const category = parseDativeCategory(dativeText);
                const roomId = client.Map.currentRoom?.userData?.internal_id;
                if (category) {
                    void addKnowledgeEvent(getCharacterProgressKey(), {
                        category,
                        categoryDative: dativeText.trim(),
                        type: 'tick',
                        locationId: roomId ? parseInt(roomId, 10) : 0,
                        timestamp: Date.now(),
                    });
                    client.sendEvent('knowledgeTickEvent', {
                        category,
                        dative: dativeText.trim(),
                    });
                }
            }

            // Color the entire line
            const tickColor = createColorFormat('#fbbf24');
            line.replace([0, line.text.length], line.text, tickColor);
            return line;
        },
        'knowledge-progress',
    );

    // Book start: "Zaczynasz zglebiac X, probujac dowiedziec sie czegos wiecej o Y."
    client.Triggers.registerTrigger(
        KNOWLEDGE_BOOK_START_PATTERN,
        (line, matches) => {
            const bookBiernik = matches[1]?.trim();
            const categoryDative = matches[2]?.trim();
            if (bookBiernik && categoryDative && currentSnapshot) {
                const category = getBaseCategoryFromName(categoryDative);
                if (category) {
                    const books = currentSnapshot.data.books;
                    let bookKey: string | null = null;
                    let resolvedCategory: string | null = null;
                    for (const [key, book] of Object.entries(books)) {
                        if (book.biernik === bookBiernik) {
                            bookKey = key;
                            resolvedCategory = resolveBookCategory(book, category);
                            break;
                        }
                    }
                    if (bookKey && resolvedCategory) {
                        setBookProgress(bookKey, resolvedCategory as KnowledgeCategoryBaseName, 'in_progress');
                        window.setTimeout(() => dispatchBookReport(), 50);
                    } else if (!bookKey) {
                        client.println(mudletColorLine(`<tomato>Nieznana ksiazka "<sky_blue>${bookBiernik}<tomato>" - zglos ja na Discordzie!`));
                    }
                }
            }
            return line;
        },
        'knowledge-progress',
    );

    // Book completion: "Masz wrazenie, ze z X nie dowiesz sie juz niczego wiecej o Y."
    client.Triggers.registerTrigger(
        KNOWLEDGE_BOOK_COMPLETE_PATTERN,
        (line, matches) => {
            const bookDopelniacz = matches[1]?.trim();
            const categoryDative = matches[2]?.trim();
            if (bookDopelniacz && categoryDative && currentSnapshot) {
                const category = getBaseCategoryFromName(categoryDative);
                if (category) {
                    // Find book by dopelniacz
                    const books = currentSnapshot.data.books;
                    let bookKey: string | null = null;
                    let resolvedCategory: string | null = null;
                    for (const [key, book] of Object.entries(books)) {
                        if (book.dopelniacz === bookDopelniacz) {
                            bookKey = key;
                            resolvedCategory = resolveBookCategory(book, category);
                            break;
                        }
                    }
                    if (bookKey && resolvedCategory) {
                        setBookProgress(bookKey, resolvedCategory as KnowledgeCategoryBaseName, true);
                        window.setTimeout(() => dispatchBookReport(), 50);
                    }
                }
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
            const dativeCategory = getDativeCategoryName(category);
            const buffer = new AnsiAwareBuffer(' - ');
            const startPos = buffer.text.length;
            buffer.insert(startPos, category, STATUS_COLORS[status]);
            buffer.createLink([startPos, startPos + category.length], {
                onClick: () => {
                    client.sendCommand(`zglebiaj wiedze o ${dativeCategory}`);
                },
                title: `Kliknij aby zgłębić wiedzę o: ${dativeCategory}`
            });
            buffer.suffix('\n');
            return buffer;
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
        if (report) {
            report.currentLibraryId = currentLibraryId;
        }
        client.sendEvent('knowledgeReport', report);
    }

    function dispatchBookReport(overrideCharacter?: string) {
        if (!currentSnapshot) {
            client.sendEvent('knowledgeBookReport', null);
            return;
        }

        const characterKey = overrideCharacter || getCharacterProgressKey();
        const bookProgress = currentSnapshot.data.bookProgress?.[characterKey] ?? {};
        const books = currentSnapshot.data.books ?? {};

        client.sendEvent('knowledgeBookReport', {
            books,
            bookProgress,
        });
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
                const ctx = prepareLibraryProgressUpdate(snapshot, libraryId);
                if (!ctx) return snapshot;

                if (status === 'not_started') {
                    let removedAny = false;
                    for (const category of categories) {
                        if (ctx.libraryProgress[category]) {
                            delete ctx.libraryProgress[category];
                            removedAny = true;
                        }
                    }
                    if (!removedAny) return snapshot;
                } else {
                    let changedAny = false;
                    for (const category of categories) {
                        if (ctx.libraryProgress[category] === status) continue;
                        ctx.libraryProgress[category] = status;
                        changedAny = true;
                    }
                    if (!changedAny) return snapshot;
                }

                updated = true;
                return commitLibraryProgress(ctx);
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

    // Handle request events for popups that auto-open after reload
    client.on('requestKnowledgeReport', (detail) => {
        if (!currentSnapshot) {
            return;
        }
        const libraryEntries = Object.entries(currentSnapshot.data.libraries);
        if (libraryEntries.length === 0) {
            return;
        }
        const overrideChar = (detail as { character?: string } | undefined)?.character;
        const characterKey = overrideChar || getCharacterProgressKey();
        const characterProgress = currentSnapshot.data.progress[characterKey] ?? {};
        const report = buildKnowledgeReport(libraryEntries, characterProgress);
        if (report) {
            report.currentLibraryId = currentLibraryId;
            client.sendEvent('knowledgeReport', report);
        }
    });

    client.on('requestKnowledgeDetailsReport', () => {
        if (!knowledgeDetailsSnapshot) {
            return;
        }
        const characterKey = getCharacterProgressKey();
        const payload = buildKnowledgeDetailsReportPayload(
            knowledgeDetailsSnapshot,
            characterKey,
            currentCharacterGender,
        );
        if (payload) {
            client.sendEvent('knowledgeDetailsReport', payload);
        } else {
            const emptyPayload = buildKnowledgeDetailsReportPayloadWithoutProgress(
                knowledgeDetailsSnapshot,
            );
            if (emptyPayload) {
                client.sendEvent('knowledgeDetailsReport', emptyPayload);
            }
        }
    });

    client.on('requestKnowledgeBookReport', (detail) => {
        const overrideChar = (detail as { character?: string } | undefined)?.character;
        dispatchBookReport(overrideChar);
    });

    client.on('knowledgeBookReportAction', (detail) => {
        const action = detail as { type: string; bookKey: string; category: string } | undefined | null;
        if (!action) {
            return;
        }
        if (!getBaseCategoryFromName(action.category)) {
            return;
        }
        if (action.type === 'toggleBook') {
            const characterKey = getCharacterProgressKey();
            // Use action.category directly — it comes from the book's own categories array
            const bookProg = currentSnapshot?.data.bookProgress?.[characterKey]?.[action.bookKey] ?? {};
            const currentBookProgress = findBookProgValue(bookProg, action.category);
            setBookProgress(action.bookKey, action.category as KnowledgeCategoryBaseName, !currentBookProgress);
            // Re-dispatch after a short delay to allow store update
            window.setTimeout(() => dispatchBookReport(), 50);
        }
    });

    // Import handlers
    function resolveLibraryKey(
        snapshot: KnowledgeSnapshot,
        numericId: number,
    ): string | null {
        // Try map lookup: numeric room ID → room → userData.internal_id → library key
        const room = client.Map.getRoomById(numericId);
        const internalId = room?.userData?.internal_id?.trim();
        if (internalId && snapshot.data.libraries[internalId]) {
            return internalId;
        }

        return null;
    }

    // Import handlers
    function getImportCharacterKey(payloadCharacter: string): string {
        return payloadCharacter || getCharacterProgressKey();
    }

    client.on('wiedzaImportLibraries', (detail) => {
        const payload = detail as { character: string; libraries: { locationId: number; categoryDative: string }[] } | undefined;
        if (!payload || !currentSnapshot) return;

        const resolvedKeys = new Map<number, string>();
        for (const lib of payload.libraries) {
            if (!resolvedKeys.has(lib.locationId)) {
                const key = resolveLibraryKey(currentSnapshot, lib.locationId);
                if (key) resolvedKeys.set(lib.locationId, key);
            }
        }
        if (resolvedKeys.size === 0) return;

        void store.applyLocalChange((snapshot) => {
            if (!snapshot) return snapshot;
            const characterKey = getImportCharacterKey(payload.character);
            const nextProgress = {...snapshot.data.progress};
            const characterProgress = {...(nextProgress[characterKey] ?? {})};

            for (const lib of payload.libraries) {
                const libraryKey = resolvedKeys.get(lib.locationId);
                if (!libraryKey) continue;
                const library = snapshot.data.libraries[libraryKey];
                if (!library) continue;
                const category = getBaseCategoryFromName(lib.categoryDative);
                if (!category) continue;
                const normalized = normalizeCategory(category, library);
                if (!normalized) continue;
                const libraryProgress = {...(characterProgress[libraryKey] ?? {})};
                libraryProgress[normalized] = 'completed';
                characterProgress[libraryKey] = libraryProgress;
            }

            nextProgress[characterKey] = characterProgress;
            return {...snapshot, data: {...snapshot.data, progress: nextProgress}};
        }).catch((e) => console.error('Failed to import libraries:', e));
    });

    client.on('wiedzaImportBooks', (detail) => {
        const payload = detail as { character: string; books: { bookName: string; categoryDative: string }[] } | undefined;
        if (!payload) return;

        void store.applyLocalChange((snapshot) => {
            if (!snapshot) return snapshot;
            const characterKey = getImportCharacterKey(payload.character);
            const nextBookProgress = {...(snapshot.data.bookProgress ?? {})};
            const characterBookProgress = {...(nextBookProgress[characterKey] ?? {})};

            for (const book of payload.books) {
                const category = getBaseCategoryFromName(book.categoryDative);
                if (!category) continue;
                const bookEntry = snapshot.data.books?.[book.bookName];
                const resolvedCat = bookEntry ? resolveBookCategory(bookEntry, category) : null;
                if (!resolvedCat) continue;
                const bookCategories = {...(characterBookProgress[book.bookName] ?? {})};
                bookCategories[resolvedCat] = true;
                characterBookProgress[book.bookName] = bookCategories;
            }

            nextBookProgress[characterKey] = characterBookProgress;
            return {...snapshot, data: {...snapshot.data, bookProgress: nextBookProgress}};
        }).catch((e) => console.error('Failed to import books:', e));
    });

    client.on('wiedzaImportTotalLevels', (detail) => {
        const payload = detail as { character: string; levels: { categoryName: string; level: string }[] } | undefined;
        if (!payload || !knowledgeDetailsSnapshot) return;

        const latestLevels = new Map<KnowledgeCategoryBaseName, string>();
        for (const entry of payload.levels) {
            const category = getBaseCategoryFromName(entry.categoryName);
            if (category) latestLevels.set(category, entry.level);
        }
        if (latestLevels.size === 0) return;

        void detailsStore.applyLocalChange((snapshot) => {
            const baseSnapshot = snapshot ?? knowledgeDetailsSnapshot!;
            const characterKey = getImportCharacterKey(payload.character);
            const nextProgress = applyTotalLevels(baseSnapshot.data.progress, characterKey, latestLevels, Date.now());
            return {...baseSnapshot, data: {...baseSnapshot.data, progress: nextProgress}};
        }).catch((e) => console.error('Failed to import total levels:', e));
    });

    aliasList.push({pattern: /\/zglebiaj$/, callback: showLibraryCategories});
    aliasList.push({pattern: /\/biblioteki$/, callback: showLibrariesReport});
    aliasList.push({pattern: /\/wiedza$/, callback: openKnowledgeDetailsReport});
    aliasList.push({pattern: /\/wiedza_buduj$/, callback: buildKnowledgeDetailsData});

    function openKnowledgeDetailsReport() {
        if (!knowledgeDetailsSnapshot) {
            const msg = new AnsiAwareBuffer('Dane wiedzy nie sa jeszcze dostepne. Uzyj /wiedza_buduj, aby je zbudowac.');
            const cmdStart = msg.text.indexOf('/wiedza_buduj');
            if (cmdStart >= 0) {
                msg.createLink([cmdStart, cmdStart + 13], {
                    onClick: () => client.sendCommand('/wiedza_buduj'),
                    title: 'Kliknij aby zbudować dane wiedzy'
                });
            }
            client.println(msg);
            client.sendEvent('knowledgeDetailsReport', null);
            return;
        }

        const characterKey = getCharacterProgressKey();
        const payload = buildKnowledgeDetailsReportPayload(
            knowledgeDetailsSnapshot,
            characterKey,
            currentCharacterGender,
        );

        // Show report even if no progress data exists (all entries will be shown as missing)
        if (!payload) {
            // Build a payload with empty progress to show all entries as unmarked
            const emptyPayload = buildKnowledgeDetailsReportPayloadWithoutProgress(
                knowledgeDetailsSnapshot,
            );

            if (!emptyPayload) {
                const msg = new AnsiAwareBuffer(
                    'Brak danych definicji wiedzy. Uzyj /wiedza_buduj, aby je zaktualizowac.',
                );
                const cmdStart = msg.text.indexOf('/wiedza_buduj');
                if (cmdStart >= 0) {
                    msg.createLink([cmdStart, cmdStart + 13], {
                        onClick: () => client.sendCommand('/wiedza_buduj'),
                        title: 'Kliknij aby zbudować dane wiedzy'
                    });
                }
                client.println(msg);
                client.sendEvent('knowledgeDetailsReport', null);
                return;
            }

            client.sendEvent('knowledgeDetails.popup.open');
            client.sendEvent('knowledgeDetailsReport', emptyPayload);
            return;
        }

        client.sendEvent('knowledgeDetails.popup.open');
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

            const msgText = messages.join('\n');
            const msg = new AnsiAwareBuffer(msgText);
            const cmdStart = msg.text.indexOf('/wiedza');
            if (cmdStart >= 0) {
                msg.createLink([cmdStart, cmdStart + 7], {
                    onClick: () => client.sendCommand('/wiedza'),
                    title: 'Kliknij aby otworzyć raport wiedzy'
                });
            }
            client.println(msg);
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

        report.currentLibraryId = currentLibraryId;
        client.sendEvent('knowledgeReport', report);
        client.sendEvent('knowledgeReport.popup.open');
    }

    // Knowledge hints: orange highlights + plugin location notes
    const KNOWLEDGE_HINTS_PLUGIN_ID = '__knowledge_hints__';
    const KNOWLEDGE_HINTS_PLUGIN_NAME = 'Wiedza';
    let knowledgeHintsHighlighter: ReturnType<typeof client.Map.createHighlighter> | null = null;
    let knowledgeHintsEnabled = false;
    let knowledgeHintsHideCompleted = false;

    function buildKnownEntriesSet(): Set<string> {
        const known = new Set<string>();
        if (!knowledgeDetailsSnapshot) return known;
        const characterKey = getCharacterProgressKey();
        const characterProgress = knowledgeDetailsSnapshot.data.progress[characterKey];
        if (!characterProgress) return known;
        for (const category of KNOWLEDGE_CATEGORY_ORDER) {
            const progress = characterProgress[category];
            if (!progress?.entries) continue;
            for (const type of KNOWLEDGE_DETAILS_TYPES) {
                const entries = progress.entries[type];
                if (!Array.isArray(entries)) continue;
                for (const entry of entries) {
                    if (typeof entry === 'string') {
                        known.add(normalizeKnowledgeEntry(entry));
                    }
                }
            }
        }
        return known;
    }

    function enableKnowledgeHints(hideCompleted: boolean) {
        // Clear previous state without resetting flags
        if (knowledgeHintsHighlighter) {
            knowledgeHintsHighlighter.destroy();
            knowledgeHintsHighlighter = null;
        }
        removeAllPluginNotes(KNOWLEDGE_HINTS_PLUGIN_ID);

        knowledgeHintsEnabled = true;
        knowledgeHintsHideCompleted = hideCompleted;
        knowledgeHintsHighlighter = client.Map.createHighlighter({color: '#FF9F43'});

        const knownEntries = buildKnownEntriesSet();
        const roomIds: number[] = [];
        const notesByRoom = new Map<number, string[]>();
        for (const entry of knowledgeData as KnowledgeJsonEntry[]) {
            if (entry.id == null) continue;
            const isKnown = knownEntries.has(normalizeKnowledgeLookupKey(entry.Wiedza));
            if (isKnown && hideCompleted) continue;
            roomIds.push(entry.id);
            const parts: string[] = [];
            if (entry.lokalizacja) parts.push(entry.lokalizacja);
            if (entry.note) parts.push(entry.note);
            if (parts.length > 0) {
                const prefix = isKnown ? '\u2713 ' : '';
                const line = `${prefix}[${entry.Rodzaj}] ${entry.Wiedza}\n${parts.join(' — ')}`;
                const existing = notesByRoom.get(entry.id);
                if (existing) {
                    existing.push(line);
                } else {
                    notesByRoom.set(entry.id, [line]);
                }
            }
        }
        for (const [roomId, lines] of notesByRoom) {
            setPluginLocationNote(
                KNOWLEDGE_HINTS_PLUGIN_ID,
                KNOWLEDGE_HINTS_PLUGIN_NAME,
                roomId,
                lines.join('\n\n'),
            );
        }
        knowledgeHintsHighlighter.add(roomIds);
    }

    function disableKnowledgeHints() {
        knowledgeHintsEnabled = false;
        knowledgeHintsHideCompleted = false;
        if (knowledgeHintsHighlighter) {
            knowledgeHintsHighlighter.destroy();
            knowledgeHintsHighlighter = null;
        }
        removeAllPluginNotes(KNOWLEDGE_HINTS_PLUGIN_ID);
    }

    function refreshKnowledgeHintsIfNeeded() {
        if (knowledgeHintsEnabled) {
            enableKnowledgeHints(knowledgeHintsHideCompleted);
        }
    }

    function readPersistedHintsSettings(): { showHints: boolean; hideCompleted: boolean } {
        try {
            const state = globalStorage.get('layoutManagerState');
            if (!state) return {showHints: false, hideCompleted: false};
            const settings = state?.popupPanels?.['popup:knowledgeDetails']?.settings;
            return {
                showHints: settings?.showHints === true,
                hideCompleted: settings?.hideCompleted === true,
            };
        } catch {
            return {showHints: false, hideCompleted: false};
        }
    }

    client.on('knowledgeHints', (detail) => {
        const payload = detail as { enabled: boolean; hideCompleted: boolean } | undefined;
        if (payload?.enabled) {
            enableKnowledgeHints(payload.hideCompleted);
        } else {
            disableKnowledgeHints();
        }
    });

    // Restore hints from persisted settings on init
    const persistedHints = readPersistedHintsSettings();
    if (persistedHints.showHints) {
        enableKnowledgeHints(persistedHints.hideCompleted);
    }
}
