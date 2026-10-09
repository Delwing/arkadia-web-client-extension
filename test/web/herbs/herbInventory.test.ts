import { describe, expect, it } from 'vitest';
import type { HerbsData } from '@modules/data/dataStores/herbsStore.ts';
import { amountsFor, formatHerbInventory, herbTotals, matchesHerbFilter } from '@web/herbs/herbInventory.ts';

const herbsData: HerbsData = {
    version: 1,
    herb_id_to_odmiana: {
        babka: {
            mianownik: 'rozetkowaty lancetowaty lisc', dopelniacz: '', biernik: '', mnoga_mianownik: '',
            mnoga_dopelniacz: '', mnoga_biernik: '', narzednik: '',
        },
    },
    herb_id_to_use: {
        babka: [{ action: 'przyloz', effect: '+kon' }],
        arnika: [{ action: 'zjedz', effect: '<olive_drab>-zmc<grey>' }],
        tyton_krema: [{ action: '.', effect: '--', dont_bind: true, smokable: true }],
    },
};

const bags = {
    1: { herbs: { babka: 3, arnika: 2 }, condition: 5 },
    2: { herbs: { babka: 2, tyton_krema: 1 } },
};

describe('herbInventory', () => {
    it('sums herbs across bags', () => {
        expect(herbTotals(bags)).toEqual({ babka: 5, arnika: 2, tyton_krema: 1 });
    });

    it('never offers more than is held', () => {
        expect(amountsFor(7)).toEqual([1, 3, 5]);
        expect(amountsFor(3)).toEqual([1, 3]);
        expect(amountsFor(2)).toEqual([1]);
        expect(amountsFor(0)).toEqual([1]);
    });

    it('filters by id, by the herb description and by one effect group', () => {
        expect(matchesHerbFilter('babka', herbsData, { query: 'lancet', group: null })).toBe(true);
        expect(matchesHerbFilter('arnika', herbsData, { query: 'lancet', group: null })).toBe(false);
        expect(matchesHerbFilter('arnika', herbsData, { query: '', group: 'fatigue' })).toBe(true);
        expect(matchesHerbFilter('babka', herbsData, { query: '', group: 'fatigue' })).toBe(false);
        expect(matchesHerbFilter('tyton_krema', herbsData, { query: '', group: 'smoke' })).toBe(true);
    });

    it('searches effects, so a bare token finds both signs', () => {
        const data: HerbsData = {
            ...herbsData,
            herb_id_to_use: {
                ...herbsData.herb_id_to_use,
                kola: [{ action: 'zjedz', effect: '-kac' }],
                aralia: [{ action: 'zjedz', effect: '+odp -zmc +kac' }],
            },
        };
        const search = (query: string) => ['babka', 'arnika', 'kola', 'aralia']
            .filter(herbId => matchesHerbFilter(herbId, data, { query, group: null }));
        expect(search('kac')).toEqual(['kola', 'aralia']);
        expect(search('-kac')).toEqual(['kola']);
        expect(search('zmc')).toEqual(['arnika', 'aralia']);
    });

    it('searches effect group names', () => {
        expect(matchesHerbFilter('babka', herbsData, { query: 'leczen', group: null })).toBe(true);
        expect(matchesHerbFilter('arnika', herbsData, { query: 'leczen', group: null })).toBe(false);
    });

    it('copies the plain list with a total', () => {
        expect(formatHerbInventory('list', ['babka', 'arnika'], bags, herbsData)).toBe(
            'Zioła (7 szt.):\n  2 arnika\n  5 babka',
        );
    });

    it('copies the list with what each herb does', () => {
        expect(formatHerbInventory('effects', ['babka', 'arnika', 'tyton_krema'], bags, herbsData)).toBe(
            '  2 arnika       zjedz -zmc\n  5 babka        przyloz +kon\n  1 tyton_krema  do palenia',
        );
    });

    it('copies per bag, only the herbs asked for', () => {
        expect(formatHerbInventory('bags', ['babka'], bags, herbsData)).toBe(
            'Woreczek 1 (5/5): 3 babka\nWoreczek 2: 2 babka',
        );
    });
});
