import { describe, expect, test } from 'vitest';
import {
    buildAreaSections,
    buildCategoryRows,
    entryHint,
    filterEntries,
    isUnavailable,
    levelIndex,
    levelsFromHistory,
    libraryProgressText,
    sortCategories,
    sortLibraries,
    uniqueEntryNames,
    type DetailsEntry,
    type DetailsPayload,
    type Library,
    type LibrariesPayload,
} from '@web/knowledge/knowledgeModel';
import type { KnowledgeEvent } from '@modules/data/dataStores/knowledgeEventsStore';

const event = (e: Partial<KnowledgeEvent>): KnowledgeEvent => ({
    category: 'nieumarli',
    categoryDative: 'nieumarlych',
    type: 'tick',
    locationId: 0,
    timestamp: 0,
    ...e,
} as KnowledgeEvent);

const entry = (name: string, status: DetailsEntry['status'] = 'missing', extra: Partial<DetailsEntry> = {}): DetailsEntry => ({
    name,
    status,
    ...extra,
});

const details: DetailsPayload = {
    categories: [
        {
            name: 'nieumarli',
            dative: 'nieumarlych',
            updatedAt: 1000,
            types: {
                fight: { total: 0, known: 0, missing: [], unknown: [], entries: [], level: 'niezla', levelIndex: 4, levelMax: 10 },
                exploration: {
                    total: 3,
                    known: 1,
                    missing: [],
                    unknown: ['Cos dziwnego'],
                    entries: [
                        entry('Widziales ghula', 'missing', { id: 10, lokalizacja: 'Cmentarz', note: 'tylko noca' }),
                        entry('Widziales upiora', 'known', { id: 11 }),
                        entry('Kaplica na bagnach', 'missing', { lokalizacja: 'obecnie niedostepna' }),
                    ],
                    levelMax: 10,
                },
            },
        },
    ],
};

const library = (id: string, extra: Partial<Library> = {}): Library => ({
    id,
    name: `Biblioteka ${id}`,
    locationId: id,
    roomId: null,
    total: 2,
    remaining: 1,
    not_started: 1,
    in_progress: 0,
    completed: 1,
    categories: [
        { name: 'nieumarli', dative: 'nieumarlych', status: 'not_started' },
        { name: 'wampiry', dative: 'wampirach', status: 'completed' },
    ],
    ...extra,
});

describe('levels', () => {
    test('levelIndex reads the game words, any case', () => {
        expect(levelIndex('brak')).toBe(0);
        expect(levelIndex('Dosc dobra')).toBe(5);
        expect(levelIndex('pelna')).toBe(10);
        expect(levelIndex('')).toBe(-1);
        expect(levelIndex('cos')).toBe(-1);
    });

    test('the latest level per category, and ticks since it', () => {
        const levels = levelsFromHistory([
            event({ type: 'level_change', level: 'niezla', timestamp: 1 }),
            event({ type: 'tick', timestamp: 2 }),
            event({ type: 'level_change', level: 'dobra', timestamp: 3 }),
            event({ type: 'tick', timestamp: 4 }),
            event({ type: 'tick', timestamp: 5 }),
            event({ category: 'wampiry' as KnowledgeEvent['category'], type: 'tick', timestamp: 6 }),
        ]);
        expect(levels.get('nieumarli')).toEqual({ level: 'dobra', ticks: 2 });
        expect(levels.get('wampiry'), 'ticks without a known level').toEqual({ level: '', ticks: 1 });
    });
});

describe('buildCategoryRows', () => {
    const libraries: LibrariesPayload = { libraries: [library('a'), library('b')], categories: [], currentLibraryId: 'b' };
    const rows = buildCategoryRows(
        details,
        libraries,
        {
            books: { 'Ksiega umarlych': { categories: ['Nieumarli'] } as never, 'Bestiariusz': { categories: ['wampiry'] } as never },
            bookProgress: { 'Ksiega umarlych': { nieumarli: true } },
        },
        levelsFromHistory([event({ type: 'level_change', level: 'dobra', timestamp: 1 })]),
    );
    const undead = rows.find((row) => row.name === 'nieumarli')!;

    test('every one of the 14 categories, known or not', () => {
        expect(rows).toHaveLength(14);
        expect(rows.find((row) => row.name === 'golemy')).toMatchObject({ level: '', levelIndex: -1, entries: [], libraries: [] });
    });

    test('joins level, sources, entries, libraries and books by category', () => {
        expect(undead).toMatchObject({ level: 'dobra', levelIndex: 6, known: 1, total: 3 });
        expect(undead.sources.fight?.level).toBe('niezla');
        expect(undead.entries).toHaveLength(3);
        expect(undead.libraries.map((lib) => [lib.id, lib.status, lib.current])).toEqual([
            ['a', 'not_started', false],
            ['b', 'not_started', true],
        ]);
        expect(undead.books, 'book categories match whatever the case').toEqual([{ name: 'Ksiega umarlych', status: 'completed' }]);
    });

    test('sorting: weakest first, the most missing first, or by name', () => {
        const names = (sort: 'weakest' | 'missing' | 'name') => sortCategories(rows, sort).map((row) => row.name);
        expect(names('weakest').at(-1)).toBe('nieumarli');
        expect(names('missing')[0]).toBe('nieumarli');
        expect(names('name')[0]).toBe('Chaos i jego twory');
    });
});

describe('entries', () => {
    const entries = details.categories[0].types.exploration!.entries;

    test('the hint joins where and what, leaving out dashes and "niedostepna"', () => {
        expect(entryHint(entries[0])).toBe('Cmentarz, tylko noca');
        expect(entryHint(entry('x', 'missing', { lokalizacja: '---', note: 'rano' }))).toBe('rano');
        expect(entryHint(entries[2])).toBe('');
    });

    test('an entry marked unavailable, unless already known', () => {
        expect(isUnavailable(entries[2])).toBe(true);
        expect(isUnavailable(entry('x', 'known', { note: 'niedostepna' }))).toBe(false);
    });

    test('filter by status, and by text in the name or (with hints) the hint', () => {
        expect(filterEntries(entries, 'missing', '', false).map((e) => e.name)).toEqual(['Widziales ghula', 'Kaplica na bagnach']);
        expect(filterEntries(entries, 'known', '', false).map((e) => e.name)).toEqual(['Widziales upiora']);
        expect(filterEntries(entries, 'all', 'GHULA', false)).toHaveLength(1);
        expect(filterEntries(entries, 'all', 'cmentarz', false), 'hints off: the hint is not searched').toHaveLength(0);
        expect(filterEntries(entries, 'all', 'cmentarz', true)).toHaveLength(1);
        expect(filterEntries([entry('Widziałeś żmiję')], 'all', 'widziales zmije', false), 'Polish letters fold').toHaveLength(1);
    });

    test('names across categories, each once', () => {
        const rows = buildCategoryRows(details, null, null, new Map());
        rows[1] = { ...rows[1], entries: [entry('Widziales ghula'), entry('Nowy wpis')] };
        expect(uniqueEntryNames(rows, 'missing')).toEqual(['Widziales ghula', 'Nowy wpis', 'Kaplica na bagnach']);
    });
});

describe('libraries', () => {
    test('by what is left, by distance (unknown last), or by name', () => {
        const libs = [library('b', { remaining: 1 }), library('a', { remaining: 3 }), library('c', { remaining: 3 })];
        const distance = (lib: Library) => ({ a: 9, b: 2 } as Record<string, number>)[lib.id] ?? null;
        expect(sortLibraries(libs, 'most', distance).map((l) => l.id)).toEqual(['a', 'c', 'b']);
        expect(sortLibraries(libs, 'nearest', distance).map((l) => l.id)).toEqual(['b', 'a', 'c']);
        expect(sortLibraries(libs, 'name', distance).map((l) => l.id)).toEqual(['a', 'b', 'c']);
    });

    test('progress in words, with Polish plurals', () => {
        expect(libraryProgressText({ completed: 8, in_progress: 2, not_started: 1 })).toBe('8 ukończonych · 2 w trakcie · 1 nowa');
        expect(libraryProgressText({ completed: 2, in_progress: 0, not_started: 7 })).toBe('2 ukończone · 7 nowych');
        expect(libraryProgressText({ completed: 1, in_progress: 0, not_started: 22 })).toBe('1 ukończona · 22 nowe');
    });
});

describe('buildAreaSections', () => {
    const rows = buildCategoryRows(details, null, null, new Map());
    rows[1] = { ...rows[1], name: 'wampiry', entries: [entry('Widziales ghula', 'missing', { id: 10 }), entry('Nietoperz', 'known', { id: 20 })] };
    const areaOf = (id: number | null | undefined) => (id === 10 ? 'Oxenfurt' : id === 20 ? 'Novigrad' : undefined);

    test('an entry once per area, with every category it counts for', () => {
        const sections = buildAreaSections(rows, 'all', '', false, areaOf, undefined);
        const oxenfurt = sections.find((s) => s.area === 'Oxenfurt')!;
        expect(oxenfurt.entries).toHaveLength(1);
        expect(oxenfurt.entries[0].categories).toEqual(['wampiry', 'nieumarli']);
    });

    test('the player\'s area first, "Inne" last; counts cover filtered-out entries', () => {
        const sections = buildAreaSections(rows, 'missing', '', false, areaOf, 'Oxenfurt');
        expect(sections.map((s) => s.area)).toEqual(['Oxenfurt', 'Inne']);
        const other = sections.find((s) => s.area === 'Inne')!;
        expect([other.known, other.total], 'the known entry with no area still counts').toEqual([1, 2]);
        expect(buildAreaSections(rows, 'all', '', false, areaOf, 'Novigrad')[0].area).toBe('Novigrad');
    });
});
