vi.mock('@client/scripts/magicKeyLoader', () => ({ default: vi.fn().mockResolvedValue([]) }));
vi.mock('@client/scripts/magicsLoader', () => ({ default: vi.fn().mockResolvedValue([]) }));

import { describe, test, expect, vi } from 'vitest';
import { itemCategory, splitName, zlomName } from '@web/inventoryView';
import type { ArmorEntry, ZlomSnapshot } from '@modules/data/zlomStore';

describe('splitName', () => {
    test('finds the noun after the adjectives', () => {
        expect(splitName('szarawy skorzany woreczek')).toEqual({ before: 'szarawy skorzany', noun: 'woreczek', after: '' });
    });

    test('keeps the detail after the noun apart', () => {
        expect(splitName('skorzany woreczek z herbem')).toEqual({ before: 'skorzany', noun: 'woreczek', after: 'z herbem' });
        expect(splitName('pojemnik na mapy')).toEqual({ before: '', noun: 'pojemnik', after: 'na mapy' });
    });

    test('takes a lone word as the noun', () => {
        expect(splitName('lampe')).toEqual({ before: '', noun: 'lampe', after: '' });
    });
});

describe('itemCategory', () => {
    test('uses the pretty container groups', () => {
        expect(itemCategory('dlugi stalowy miecz', false)).toBe('bronie');
        expect(itemCategory('trzy rubiny', false)).toBe('kamienie');
    });

    test('judges by the item, not its detail', () => {
        expect(itemCategory('krwistoczerwony poszarpany plaszcz z naciagnietym na glowe kapturem', false)).toBe('ubrania');
    });

    test('knows bags, coins and lights', () => {
        expect(itemCategory('skorzany plecak', true)).toBe('bag');
        expect(itemCategory('zlote monety', false)).toBe('coins');
        expect(itemCategory('krysztalowa olejna lampe', false)).toBe('light');
        expect(itemCategory('maly cynowy kubek', false)).toBe('other');
    });
});

describe('zlomName', () => {
    const helm = { short: 'garnczkowy helm z jelenim porozem', iLine: 'garnczkowy helm zdobiony majestatycznym jelenim porozem' } as ArmorEntry;
    const luska = { short: 'lsniaca mithrilowa luska', iLine: 'Twoje cialo spowija lsniaca mithrilowa luska' } as ArmorEntry;
    const zlom = { bronie: [], zbroje: [helm, luska], tarcze: [] } as unknown as ZlomSnapshot;

    test('names a piece by its złom entry when `i` names it as the entry\'s i line', () => {
        expect(zlomName('garnczkowy helm zdobiony majestatycznym jelenim porozem', zlom)).toBe('garnczkowy helm z jelenim porozem');
    });

    test('leaves alone what the list already names, or does not know', () => {
        expect(zlomName('garnczkowy helm z jelenim porozem', zlom)).toBeNull();
        expect(zlomName('szarawy skorzany woreczek', zlom)).toBeNull();
    });

    test('takes no part of a prose i line for a name', () => {
        expect(zlomName('mithrilowa luska', zlom)).toBeNull();
    });
});
