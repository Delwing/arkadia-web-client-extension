import { describe, expect, it } from 'vitest';
import { cacheKey, foldDiacritics, isCacheable, normalizeQuestion } from '../src/normalize';

describe('foldDiacritics', () => {
    it('folds every Polish diacritic to ASCII', () => {
        expect(foldDiacritics('ąćęłńóśźż')).toBe('acelnoszz');
        expect(foldDiacritics('ĄĆĘŁŃÓŚŹŻ')).toBe('ACELNOSZZ');
    });

    it('folds l-stroke, which NFD alone does not decompose', () => {
        // This is the case a naive NFD + combining-mark strip silently misses.
        expect(foldDiacritics('łódź')).toBe('lodz');
    });
});

describe('normalizeQuestion', () => {
    it('collapses case, diacritics, punctuation and whitespace', () => {
        const a = normalizeQuestion('Jak ustawić trigger na zabicie???');
        const b = normalizeQuestion('jak   ustawic  TRIGGER na zabicie');
        expect(a).toBe(b);
    });

    it('treats differently-punctuated variants as one question', () => {
        const variants = [
            'Jak ustawić alias?',
            'jak ustawic alias',
            'JAK USTAWIĆ ALIAS!!!',
            '  jak  ustawić   alias ...  ',
        ];
        const keys = new Set(variants.map(normalizeQuestion));
        expect(keys.size).toBe(1);
    });

    it('drops stopwords so filler does not fragment the cache', () => {
        expect(normalizeQuestion('jak mam ustawic trigger')).toBe(
            normalizeQuestion('jak ustawic trigger'),
        );
    });

    it('preserves word order, because it carries meaning', () => {
        expect(normalizeQuestion('jak dodac alias')).not.toBe(
            normalizeQuestion('jak usunac alias'),
        );
    });

    it('keeps distinct questions distinct', () => {
        expect(normalizeQuestion('jak ustawic trigger')).not.toBe(
            normalizeQuestion('jak ustawic alias'),
        );
    });

    it('does not collapse an all-stopword question to the empty key', () => {
        // Otherwise every such question would share one cache entry.
        expect(normalizeQuestion('jak to jest')).not.toBe('');
    });

    it('handles empty and junk input without throwing', () => {
        expect(normalizeQuestion('')).toBe('');
        expect(normalizeQuestion('???!!!')).toBe('');
        expect(normalizeQuestion(undefined as unknown as string)).toBe('');
    });

    it('strips emoji and other non-alphanumerics', () => {
        expect(normalizeQuestion('jak ustawic trigger 🎯')).toBe(
            normalizeQuestion('jak ustawic trigger'),
        );
    });
});

describe('cacheKey', () => {
    it('is stable for equivalent questions', async () => {
        const a = await cacheKey('Jak ustawić trigger?', 'v1');
        const b = await cacheKey('jak ustawic trigger', 'v1');
        expect(a).toBe(b);
    });

    it('changes when kbVersion changes, invalidating every answer at once', async () => {
        const a = await cacheKey('jak ustawic trigger', 'v1');
        const b = await cacheKey('jak ustawic trigger', 'v2');
        expect(a).not.toBe(b);
    });

    it('embeds the kbVersion so entries are distinguishable by prefix', async () => {
        expect(await cacheKey('test', 'v9')).toMatch(/^ans:v9:[0-9a-f]{32}$/);
    });

    it('differs for different questions', async () => {
        const a = await cacheKey('jak ustawic trigger', 'v1');
        const b = await cacheKey('jak ustawic alias', 'v1');
        expect(a).not.toBe(b);
    });
});

describe('isCacheable', () => {
    it('allows generic questions', () => {
        expect(isCacheable('jak ustawic trigger na zabicie')).toBe(true);
    });

    it("refuses questions about the asker's own state", () => {
        expect(isCacheable('dlaczego moj trigger nie dziala')).toBe(false);
        expect(isCacheable('pokaz moje ustawienia')).toBe(false);
    });

    it('refuses an empty question', () => {
        expect(isCacheable('   ')).toBe(false);
    });
});
