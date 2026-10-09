import { describe, expect, it } from 'vitest';
import type { HerbsData } from '@modules/data/dataStores/herbsStore.ts';
import {
    cleanHerbEffect,
    herbEffectEntries,
    herbEffectTokens,
    herbEffectTone,
    herbGroupKeys,
} from '@modules/data/herbEffects.ts';

const herbsData: HerbsData = {
    version: 1,
    herb_id_to_odmiana: {},
    herb_id_to_use: {
        babka: [{ action: 'przyloz', effect: '<LimeGreen>+kon<grey>' }],
        nagietek: [{ action: 'przyloz', effect: '+kon +zmc' }],
        aralia: [
            { action: 'zjedz', effect: '+odp <olive_drab>-zmc<grey> +kac' },
            { action: 'przezuj', effect: '+zrc' },
        ],
        hidden: [{ action: 'zjedz', effect: '+kon', dont_bind: true }],
        tyton_krema: [{ action: '.', effect: '--', dont_bind: true, smokable: true }],
    },
};

describe('herbEffects', () => {
    it('strips Mudlet colours and placeholder effects', () => {
        expect(cleanHerbEffect('<olive_drab>-zmc<grey>')).toBe('-zmc');
        expect(cleanHerbEffect('--')).toBe('');
        expect(cleanHerbEffect('???')).toBe('');
        expect(herbEffectTokens('+odp <olive_drab>-zmc<grey> +kac')).toEqual(['+odp', '-zmc', '+kac']);
    });

    it('tells wanted effects from side effects and poison', () => {
        expect(herbEffectTone('+kon')).toBe('good');
        expect(herbEffectTone('+kac')).toBe('side');
        expect(herbEffectTone('tr')).toBe('bad');
        expect(herbEffectTone('na')).toBe('neutral');
    });

    it('collects every group a herb belongs to, skipping unbindable uses', () => {
        expect([...herbGroupKeys(herbsData.herb_id_to_use.aralia)].sort()).toEqual(['fatigue', 'resist', 'stats']);
        expect([...herbGroupKeys(herbsData.herb_id_to_use.hidden)]).toEqual([]);
        expect([...herbGroupKeys(herbsData.herb_id_to_use.tyton_krema)]).toEqual(['smoke']);
    });

    it('lists held herbs for a group, most held first, then fewest side effects', () => {
        const entries = herbEffectEntries('heal', herbsData, { babka: 2, nagietek: 2, hidden: 9, aralia: 1 });
        expect(entries.map(entry => entry.herbId)).toEqual(['babka', 'nagietek']);
        expect(entries[1].sideEffects).toEqual(['+zmc']);
    });

    it('skips herbs that are not held', () => {
        expect(herbEffectEntries('heal', herbsData, { babka: 0 })).toEqual([]);
    });
});
