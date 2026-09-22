/**
 * The Wiedza window's data, merged from what the knowledge script reports:
 * the details report (levels by source, exploration entries), the libraries
 * report, the books report and the recorded level history. Pure functions, so
 * the tabs only render.
 */
import { KNOWLEDGE_CATEGORY_CONFIG } from '@client/knowledgeCategories';
import type { KnowledgeDetailsType } from '@modules/data/dataStores/knowledgeDetailsStore';
import type {
    KnowledgeBookCategoryProgress,
    KnowledgeBookEntry,
    KnowledgeCategoryStatus,
} from '@modules/data/dataStores/knowledgeStore';
import type { KnowledgeEvent } from '@modules/data/dataStores/knowledgeEventsStore';

// ── report payloads, as the knowledge script sends them ─────────────────────

export type DetailsEntry = {
    name: string;
    status: 'known' | 'missing';
    id?: number | null;
    lokalizacja?: string;
    note?: string;
};

export type DetailsTypeSummary = {
    total: number;
    known: number;
    missing: string[];
    unknown: string[];
    entries: DetailsEntry[];
    level?: string;
    levelIndex?: number;
    levelMax: number;
};

export type DetailsCategory = {
    name: string;
    dative: string;
    updatedAt: number | null;
    types: Partial<Record<KnowledgeDetailsType, DetailsTypeSummary>>;
};

export type DetailsPayload = { categories: DetailsCategory[] };

export type LibraryCategory = { name: string; dative: string; status: KnowledgeCategoryStatus };

export type Library = {
    id: string;
    name: string;
    locationId: string;
    /** The map room, when the map knows the library's internal id. */
    roomId?: number | null;
    total: number;
    remaining: number;
    not_started: number;
    in_progress: number;
    completed: number;
    categories: LibraryCategory[];
};

export type LibrariesPayload = {
    libraries: Library[];
    categories: { name: string; dative: string; libraries: { id: string; name: string; status: KnowledgeCategoryStatus }[] }[];
    currentLibraryId?: string | null;
};

export type BooksPayload = {
    books: Record<string, KnowledgeBookEntry>;
    bookProgress: Record<string, KnowledgeBookCategoryProgress>;
};

// ── levels ──────────────────────────────────────────────────────────────────

export const LEVELS = [
    'brak', 'znikoma', 'niewielka', 'czesciowa', 'niezla',
    'dosc dobra', 'dobra', 'bardzo dobra', 'doskonala',
    'prawie pelna', 'pelna',
];

export const MAX_LEVEL = LEVELS.length - 1;

export function levelIndex(level: string | undefined | null): number {
    return level ? LEVELS.indexOf(level.trim().toLowerCase()) : -1;
}

export const SOURCE_LABELS: Record<KnowledgeDetailsType, string> = {
    fight: 'Z walki',
    books: 'Z książek i bibliotek',
    exploration: 'Z eksploracji',
};

export const SOURCE_SHORT: Record<KnowledgeDetailsType, string> = {
    fight: 'walka',
    books: 'książki',
    exploration: 'eksploracja',
};

export const SOURCES: KnowledgeDetailsType[] = ['fight', 'books', 'exploration'];

/** The latest overall level per category, and knowledge ticks gained since. */
export function levelsFromHistory(events: KnowledgeEvent[]): Map<string, { level: string; ticks: number }> {
    const latest = new Map<string, { level: string; timestamp: number }>();
    for (const e of events) {
        if (e.type !== 'level_change' || !e.level) continue;
        const prev = latest.get(e.category);
        if (!prev || e.timestamp > prev.timestamp) latest.set(e.category, { level: e.level, timestamp: e.timestamp });
    }
    const result = new Map<string, { level: string; ticks: number }>();
    for (const [name, { level }] of latest) result.set(name, { level, ticks: 0 });
    for (const e of events) {
        if (e.type !== 'tick') continue;
        const since = latest.get(e.category)?.timestamp ?? 0;
        if (e.timestamp <= since) continue;
        const row = result.get(e.category) ?? { level: '', ticks: 0 };
        row.ticks += 1;
        result.set(e.category, row);
    }
    return result;
}

// ── categories ──────────────────────────────────────────────────────────────

export type PlaceStatus = KnowledgeCategoryStatus;

export type CategoryRow = {
    name: string;
    dative: string;
    /** The overall level ("dobra"), from `wiedza` or its history; '' when never seen. */
    level: string;
    levelIndex: number;
    ticks: number;
    sources: Partial<Record<KnowledgeDetailsType, DetailsTypeSummary>>;
    /** Exploration entries: the ones the report tracks one by one. */
    entries: DetailsEntry[];
    known: number;
    total: number;
    libraries: { id: string; name: string; status: PlaceStatus; roomId?: number | null; current: boolean }[];
    books: { name: string; status: PlaceStatus }[];
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function bookStatus(progress: KnowledgeBookCategoryProgress, category: string): PlaceStatus {
    const key = Object.keys(progress).find((k) => same(k, category));
    const value = key === undefined ? undefined : progress[key];
    return value === true ? 'completed' : value === 'in_progress' ? 'in_progress' : 'not_started';
}

/** Every knowledge category, with whatever each report knows about it. */
export function buildCategoryRows(
    details: DetailsPayload | null,
    libraries: LibrariesPayload | null,
    books: BooksPayload | null,
    levels: Map<string, { level: string; ticks: number }>,
): CategoryRow[] {
    return KNOWLEDGE_CATEGORY_CONFIG.map(({ base, dative }) => {
        const detail = details?.categories.find((c) => same(c.name, base));
        const exploration = detail?.types.exploration;
        const history = [...levels.entries()].find(([name]) => same(name, base))?.[1];
        const level = history?.level ?? '';
        const libs = (libraries?.libraries ?? []).flatMap((lib) => {
            const cat = lib.categories.find((c) => same(c.name, base));
            return cat
                ? [{ id: lib.id, name: lib.name, status: cat.status, roomId: lib.roomId, current: lib.id === libraries?.currentLibraryId }]
                : [];
        });
        const bookRows = Object.entries(books?.books ?? {})
            .filter(([, book]) => book.categories.some((c) => same(c, base)))
            .map(([name]) => ({ name, status: bookStatus(books?.bookProgress[name] ?? {}, base) }));
        return {
            name: base,
            dative: detail?.dative ?? dative,
            level,
            levelIndex: levelIndex(level),
            ticks: history?.ticks ?? 0,
            sources: detail?.types ?? {},
            entries: exploration?.entries ?? [],
            known: exploration?.known ?? 0,
            total: exploration?.total ?? 0,
            libraries: libs,
            books: bookRows,
        };
    });
}

export type CategorySort = 'weakest' | 'name' | 'missing';

export const CATEGORY_SORTS: { key: CategorySort; label: string }[] = [
    { key: 'weakest', label: 'Najsłabsze' },
    { key: 'missing', label: 'Najwięcej brakuje' },
    { key: 'name', label: 'Alfabetycznie' },
];

export function sortCategories(rows: CategoryRow[], sort: CategorySort): CategoryRow[] {
    const byName = (a: CategoryRow, b: CategoryRow) => a.name.localeCompare(b.name);
    const sorted = [...rows];
    if (sort === 'name') return sorted.sort(byName);
    if (sort === 'missing') return sorted.sort((a, b) => b.total - b.known - (a.total - a.known) || byName(a, b));
    return sorted.sort((a, b) => a.levelIndex - b.levelIndex || byName(a, b));
}

// ── entries ─────────────────────────────────────────────────────────────────

const isBlank = (value: string | undefined | null) => !value || /^-+$/.test(value.trim());

export function isUnavailable(entry: DetailsEntry): boolean {
    return entry.status !== 'known' && [entry.name, entry.lokalizacja, entry.note].some(
        (v) => typeof v === 'string' && v.toLowerCase().includes('niedostepn'),
    );
}

/** The hint under an entry: where it is, and what to do there. */
export function entryHint(entry: DetailsEntry): string {
    const where = isBlank(entry.lokalizacja) || entry.lokalizacja!.toLowerCase().includes('niedostepn') ? '' : entry.lokalizacja!.trim();
    const note = isBlank(entry.note) || entry.note!.toLowerCase().includes('niedostepn') ? '' : entry.note!.trim();
    return [where, note].filter(Boolean).join(', ');
}

export type EntryFilter = 'missing' | 'known' | 'all';

export function filterEntries(entries: DetailsEntry[], filter: EntryFilter, query: string, hints: boolean): DetailsEntry[] {
    const q = fold(query.trim());
    return entries.filter((entry) => {
        if (filter === 'missing' && entry.status === 'known') return false;
        if (filter === 'known' && entry.status !== 'known') return false;
        if (!q) return true;
        if (fold(entry.name).includes(q)) return true;
        return hints && fold(entryHint(entry)).includes(q);
    });
}

/** Lower case without Polish diacritics, for matching typed text. */
export function fold(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/\u0142/g, 'l');
}

/** Entry names across categories, each once (an entry can count for several). */
export function uniqueEntryNames(rows: CategoryRow[], status: 'known' | 'missing'): string[] {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const row of rows) {
        for (const entry of row.entries) {
            if (entry.status !== status) continue;
            const key = entry.name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            names.push(entry.name);
        }
    }
    return names;
}

// ── libraries ───────────────────────────────────────────────────────────────

export type LibrarySort = 'most' | 'nearest' | 'name';

export const LIBRARY_SORTS: { key: LibrarySort; label: string }[] = [
    { key: 'most', label: 'Najwięcej do zgłębienia' },
    { key: 'nearest', label: 'Najbliżej' },
    { key: 'name', label: 'Alfabetycznie' },
];

export function sortLibraries(
    libraries: Library[],
    sort: LibrarySort,
    distance: (lib: Library) => number | null,
): Library[] {
    const byName = (a: Library, b: Library) => a.name.localeCompare(b.name);
    const sorted = [...libraries];
    if (sort === 'name') return sorted.sort(byName);
    if (sort === 'nearest') {
        const d = (lib: Library) => distance(lib) ?? Number.POSITIVE_INFINITY;
        return sorted.sort((a, b) => d(a) - d(b) || byName(a, b));
    }
    return sorted.sort((a, b) => b.remaining - a.remaining || byName(a, b));
}

/** "8 ukończone · 2 w trakcie · 1 nowa" */
export function libraryProgressText(lib: Pick<Library, 'completed' | 'in_progress' | 'not_started'>): string {
    const parts: string[] = [];
    if (lib.completed) parts.push(`${lib.completed} ${plural(lib.completed, 'ukończona', 'ukończone', 'ukończonych')}`);
    if (lib.in_progress) parts.push(`${lib.in_progress} w trakcie`);
    if (lib.not_started) parts.push(`${lib.not_started} ${plural(lib.not_started, 'nowa', 'nowe', 'nowych')}`);
    return parts.join(' · ');
}

export function plural(n: number, one: string, few: string, many: string): string {
    if (n === 1) return one;
    const tens = n % 100;
    const units = n % 10;
    return units >= 2 && units <= 4 && (tens < 12 || tens > 14) ? few : many;
}

// ── regions ─────────────────────────────────────────────────────────────────

export type AreaEntry = DetailsEntry & { categories: string[] };

export type AreaSection = { area: string; known: number; total: number; entries: AreaEntry[] };

export const OTHER_AREA = 'Inne';

/**
 * Entries by the map area they are in, each once with every category it
 * counts for. The player's area first, "Inne" (no room on the map) last.
 * Counts cover every entry; the lists only the ones that pass the filter.
 */
export function buildAreaSections(
    rows: CategoryRow[],
    filter: EntryFilter,
    query: string,
    hints: boolean,
    areaOf: (roomId: number | null | undefined) => string | undefined,
    here: string | undefined,
): AreaSection[] {
    const sections = new Map<string, { entries: Map<string, AreaEntry>; seen: Map<string, boolean> }>();
    const section = (area: string) => {
        let s = sections.get(area);
        if (!s) sections.set(area, (s = { entries: new Map(), seen: new Map() }));
        return s;
    };
    for (const row of rows) {
        const passing = new Set(filterEntries(row.entries, filter, query, hints));
        for (const entry of row.entries) {
            const s = section(areaOf(entry.id) ?? OTHER_AREA);
            const key = entry.name.toLowerCase();
            s.seen.set(key, Boolean(s.seen.get(key)) || entry.status === 'known');
            if (!passing.has(entry)) continue;
            const existing = s.entries.get(key);
            if (existing) {
                if (!existing.categories.includes(row.name)) existing.categories.push(row.name);
            } else {
                s.entries.set(key, { ...entry, categories: [row.name] });
            }
        }
    }
    return [...sections.entries()]
        .filter(([, s]) => s.entries.size > 0)
        .map(([area, s]) => ({
            area,
            known: [...s.seen.values()].filter(Boolean).length,
            total: s.seen.size,
            entries: [...s.entries.values()],
        }))
        .sort((a, b) => {
            if (a.area === here) return -1;
            if (b.area === here) return 1;
            if (a.area === OTHER_AREA) return 1;
            if (b.area === OTHER_AREA) return -1;
            return a.area.localeCompare(b.area);
        });
}
