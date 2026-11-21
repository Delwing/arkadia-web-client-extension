import { describe, expect, it } from 'vitest';
import { coinMetal } from '@web/coinMetal.ts';

describe('coinMetal', () => {
    it('reads the metal from a coin name', () => {
        expect(coinMetal('trzy mithrylowe monety')).toBe('mithril');
        expect(coinMetal('piec zlotych monet')).toBe('gold');
        expect(coinMetal('piec złotych monet')).toBe('gold');
        expect(coinMetal('srebrna moneta')).toBe('silver');
        expect(coinMetal('dwadziescia miedzianych monet')).toBe('copper');
    });

    it('returns null for coins of unknown metal', () => {
        expect(coinMetal('dziwna moneta')).toBeNull();
    });
});
