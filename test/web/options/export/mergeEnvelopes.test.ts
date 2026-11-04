/** Merging per-character envelopes in sync conflicts. */

import { mergePerCharacterEnvelopes } from '@web/options/export/mergeEnvelopes.ts';

// ---------------------------------------------------------------------------
// mergePerCharacterEnvelopes
// ---------------------------------------------------------------------------

describe('mergePerCharacterEnvelopes', () => {
    it('keeps the preferred side for characters present in both envelopes', () => {
        const merged = mergePerCharacterEnvelopes(
            JSON.stringify({ Alice: 'local' }),
            JSON.stringify({ Alice: 'cloud' }),
        );
        expect(JSON.parse(merged)).toEqual({ Alice: 'local' });
    });

    it('keeps characters exclusive to either side', () => {
        const merged = mergePerCharacterEnvelopes(
            JSON.stringify({ Alice: 'local' }),
            JSON.stringify({ Bob: 'cloud' }),
        );
        expect(JSON.parse(merged)).toEqual({ Alice: 'local', Bob: 'cloud' });
    });

    it('produces canonical (sorted) key order', () => {
        const merged = mergePerCharacterEnvelopes(
            JSON.stringify({ Zoe: 'z' }),
            JSON.stringify({ Alice: 'a' }),
        );
        expect(merged).toBe(JSON.stringify({ Alice: 'a', Zoe: 'z' }));
    });

    it('returns the preferred JSON unchanged when the other side is invalid', () => {
        const preferred = JSON.stringify({ Alice: 'local' });
        expect(mergePerCharacterEnvelopes(preferred, 'not-json')).toBe(preferred);
    });

    it('returns the preferred JSON unchanged when either side is not an object', () => {
        const preferred = JSON.stringify({ Alice: 'local' });
        expect(mergePerCharacterEnvelopes(preferred, JSON.stringify([1, 2]))).toBe(preferred);
    });
});
