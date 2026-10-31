/**
 * The game's knowledge vocabulary: the lines this script listens for, the level
 * ladder, and how an entry's text is normalized for comparing.
 */
import {
    KNOWLEDGE_DETAILS_TYPES,
    KnowledgeDetailsType,
} from '@modules/data/dataStores/knowledgeDetailsStore';
import {stripPolishCharacters} from '../../stripPolishCharacters';
import knowledgeData from '../../knowledge.json';

export const START_LIBRARY_PATTERN =
    /^Zaczynasz zglebiac tutejsze zasoby, probujac dowiedziec sie czegos wiecej o (.*)\.$/;
export const COMPLETE_LIBRARY_PATTERN =
    /^Masz wrazenie, ze tutaj nie dowiesz sie juz niczego wiecej o (.*)\.$/;
export const KNOWLEDGE_PROMPT_PATTERN =
    /^Wiedze o czym chcesz zglebiac\? (.*)$/;

export const KNOWLEDGE_TICK_PATTERN =
    /^Wydaje ci sie, ze twoja wiedza (.+) wzrosla .*\.$/;
export const KNOWLEDGE_BOOK_START_PATTERN =
    /^Zaczynasz zglebiac (?!tutejsze zasoby,)(.+?), probujac dowiedziec sie czegos wiecej o (.*)\.$/;
export const KNOWLEDGE_BOOK_COMPLETE_PATTERN =
    /^Masz wrazenie, ze z (.+?) nie dowiesz sie juz niczego wiecej (.*)\.$/;
export const WIEDZA_TOTAL_LEVEL_PATTERN =
    /^(.+?):\s{2,}(.+)$/;

export const KNOWLEDGE_HEADER_PATTERN = /^Wiedza o (.+?):?$/;
export const KNOWLEDGE_SUMMARY_PATTERN = /^\s*z\s+(.+?)\s*-\s*(.+)$/i;
export const KNOWLEDGE_SECTION_HEADER_PATTERN = /^Szczegoly(?:\s+z)?\s+(.+?):$/i;
export const KNOWLEDGE_ENTRY_PATTERN = /^\s*[*]\s*(.+)$/;

const KNOWLEDGE_TYPE_IDENTIFIERS: Record<KnowledgeDetailsType, string[]> = {
    fight: ['walki', 'walkach'],
    books: ['ksiazek i bibliotek', 'ksiazkach i bibliotekach', 'bibliotekach i ksiazkach'],
    exploration: ['eksploracji', 'eksploracjach'],
};

export const KNOWLEDGE_LEVEL_LABELS = [
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
export const KNOWLEDGE_LEVEL_MAX = KNOWLEDGE_LEVEL_LABELS.length - 1;
const KNOWLEDGE_LEVEL_SET = new Set<string>(KNOWLEDGE_LEVEL_LABELS);
export type KnowledgeLevelResult = { label: string; index: number };

function normalizeKnowledgeTypeKey(value: string): string {
    return stripPolishCharacters(value.trim().toLowerCase().replace(/\s+/g, ' '));
}

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

/** An entry's text as compared: lower case, plain letters, no closing punctuation. */
export function normalizeKnowledgeEntry(value: string): string {
    return stripPolishCharacters(
        value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/u, ''),
    );
}

export function detectKnowledgeDetailsType(text: string): KnowledgeDetailsType | null {
    return KNOWLEDGE_TYPE_LOOKUP.get(normalizeKnowledgeTypeKey(text)) ?? null;
}

/** The level as one of the ladder's labels, or undefined when it is not one. */
export function sanitizeKnowledgeLevel(level: string | undefined): string | undefined {
    if (!level) {
        return undefined;
    }
    const normalized = level.trim().toLowerCase();
    if (normalized.length === 0) {
        return undefined;
    }
    return KNOWLEDGE_LEVEL_SET.has(normalized) ? normalized : undefined;
}

export function getKnowledgeLevelIndex(level: string): number {
    return KNOWLEDGE_LEVEL_LABELS.indexOf(level as (typeof KNOWLEDGE_LEVEL_LABELS)[number]);
}

export function getKnowledgeLevelFromLabel(level: string | undefined): KnowledgeLevelResult | undefined {
    const normalized = sanitizeKnowledgeLevel(level);
    if (!normalized) {
        return undefined;
    }
    const index = getKnowledgeLevelIndex(normalized);
    if (index === -1) {
        return undefined;
    }
    return {label: KNOWLEDGE_LEVEL_LABELS[index], index};
}

/** One row of `knowledge.json`: where an entry is learned. */
export interface KnowledgeJsonEntry {
    Rodzaj: string;
    Wiedza: string;
    id: number | null;
    lokalizacja?: string;
    note?: string;
}

export type KnowledgeEntryInfo = {
    id: number | null;
    lokalizacja?: string;
    note?: string;
};

export const KNOWLEDGE_ENTRY_LOCATIONS = knowledgeData as KnowledgeJsonEntry[];

const knowledgeEntryLookup: Map<string, KnowledgeEntryInfo> = (() => {
    const map = new Map<string, KnowledgeEntryInfo>();
    for (const entry of KNOWLEDGE_ENTRY_LOCATIONS) {
        if (!entry.Wiedza) continue;
        const key = normalizeKnowledgeEntry(entry.Wiedza);
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

export function lookupKnowledgeEntryInfo(canonical: string): KnowledgeEntryInfo | undefined {
    return knowledgeEntryLookup.get(normalizeKnowledgeEntry(canonical));
}
