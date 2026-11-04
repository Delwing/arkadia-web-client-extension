/** Recognising backup files. */

import { validatePayload } from '@web/options/export/importValidator.ts';

// ---------------------------------------------------------------------------
// validatePayload
// ---------------------------------------------------------------------------

describe('validatePayload', () => {
    const validPayload = {
        version: 1 as const,
        createdAt: '2024-01-01T00:00:00.000Z',
        characters: [],
        localStorage: { global: {}, characters: {} },
        indexedDB: { multibinds: [], visitedRooms: [] },
    };

    it('should return true for a valid payload', () => {
        expect(validatePayload(validPayload)).toBe(true);
    });

    it('should return false for null', () => {
        expect(validatePayload(null)).toBe(false);
    });

    it('should return false for undefined', () => {
        expect(validatePayload(undefined)).toBe(false);
    });

    it('should return false for a plain string', () => {
        expect(validatePayload('not an object')).toBe(false);
    });

    it('should return false when version is not 1', () => {
        expect(validatePayload({ ...validPayload, version: 2 })).toBe(false);
    });

    it('should return false when version is missing', () => {
        const { version: _v, ...rest } = validPayload;
        expect(validatePayload(rest)).toBe(false);
    });

    it('should return false when createdAt is not a string', () => {
        expect(validatePayload({ ...validPayload, createdAt: 12345 })).toBe(false);
    });

    it('should return false when createdAt is missing', () => {
        const { createdAt: _c, ...rest } = validPayload;
        expect(validatePayload(rest)).toBe(false);
    });

    it('should return false when localStorage is missing', () => {
        const { localStorage: _ls, ...rest } = validPayload;
        expect(validatePayload(rest)).toBe(false);
    });

    it('should return false when localStorage is not an object', () => {
        expect(validatePayload({ ...validPayload, localStorage: 'data' })).toBe(false);
    });

    it('should return false when indexedDB is missing', () => {
        const { indexedDB: _idb, ...rest } = validPayload;
        expect(validatePayload(rest)).toBe(false);
    });

    it('should return false when indexedDB is not an object', () => {
        expect(validatePayload({ ...validPayload, indexedDB: null })).toBe(false);
    });
});
