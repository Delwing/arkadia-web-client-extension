/** Which localStorage keys are character-scoped or never exported. */

import { parseCharacterStorageKey, isExcludedLocalStorageKey, collectCharacters } from '@web/options/export/characterKeys.ts';

// ---------------------------------------------------------------------------
// parseCharacterStorageKey
// ---------------------------------------------------------------------------

describe('parseCharacterStorageKey', () => {
    describe('when given a valid key', () => {
        it('should return name and baseKey for a known character-scoped key', () => {
            const result = parseCharacterStorageKey('Alice:settings');
            expect(result).toEqual({ name: 'Alice', baseKey: 'settings' });
        });

        it('should parse another known base key', () => {
            const result = parseCharacterStorageKey('Bob:kill_counter');
            expect(result).toEqual({ name: 'Bob', baseKey: 'kill_counter' });
        });

        it('should trim whitespace from the character name', () => {
            const result = parseCharacterStorageKey(' Alice :settings');
            expect(result).toEqual({ name: 'Alice', baseKey: 'settings' });
        });
    });

    describe('when given an invalid key', () => {
        it('should return null for empty string', () => {
            expect(parseCharacterStorageKey('')).toBeNull();
        });

        it('should return null for a URL-like key with ://', () => {
            expect(parseCharacterStorageKey('https://example.com')).toBeNull();
        });

        it('should return null for a http:// URL key', () => {
            expect(parseCharacterStorageKey('http://example.com/path')).toBeNull();
        });

        it('should return null for a key without a colon', () => {
            expect(parseCharacterStorageKey('settings')).toBeNull();
        });

        it('should return null when colon is at position 0 (empty character name)', () => {
            expect(parseCharacterStorageKey(':settings')).toBeNull();
        });

        it('should return null for a key whose base part is not a known character schema key', () => {
            expect(parseCharacterStorageKey('Alice:unknownKey')).toBeNull();
        });

        it('should return null for a key whose base part is a known global key (not character-scoped)', () => {
            // 'triggers' is a global key, not a character-scoped key
            expect(parseCharacterStorageKey('Alice:triggers')).toBeNull();
        });

        it('should return null when character name becomes empty after trimming', () => {
            expect(parseCharacterStorageKey('   :settings')).toBeNull();
        });
    });
});

// ---------------------------------------------------------------------------
// isExcludedLocalStorageKey
// ---------------------------------------------------------------------------

describe('isExcludedLocalStorageKey', () => {
    describe('excluded by explicit set', () => {
        it('should return true for cachedMapData', () => {
            expect(isExcludedLocalStorageKey('cachedMapData')).toBe(true);
        });

        it('should return true for cachedColors', () => {
            expect(isExcludedLocalStorageKey('cachedColors')).toBe(true);
        });

        it('should return true for magics', () => {
            expect(isExcludedLocalStorageKey('magics')).toBe(true);
        });

        it('should return true for magic_keys', () => {
            expect(isExcludedLocalStorageKey('magic_keys')).toBe(true);
        });

        it('should return true for herbs_data', () => {
            expect(isExcludedLocalStorageKey('herbs_data')).toBe(true);
        });

        it('should return true for mapperRoomId', () => {
            expect(isExcludedLocalStorageKey('mapperRoomId')).toBe(true);
        });
    });

    describe('excluded by URL prefix', () => {
        it('should return true for a http:// prefixed key', () => {
            expect(isExcludedLocalStorageKey('http://example.com')).toBe(true);
        });

        it('should return true for a https:// prefixed key', () => {
            expect(isExcludedLocalStorageKey('https://cdn.example.com/cache')).toBe(true);
        });
    });

    describe('not excluded', () => {
        it('should return false for triggers', () => {
            expect(isExcludedLocalStorageKey('triggers')).toBe(false);
        });

        it('should return false for aliases', () => {
            expect(isExcludedLocalStorageKey('aliases')).toBe(false);
        });

        it('should return false for uiSettings', () => {
            expect(isExcludedLocalStorageKey('uiSettings')).toBe(false);
        });

        it('should return false for settings (character-scoped base key)', () => {
            expect(isExcludedLocalStorageKey('settings')).toBe(false);
        });
    });
});

// ---------------------------------------------------------------------------
// collectCharacters
// ---------------------------------------------------------------------------

describe('collectCharacters', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('should return empty array when localStorage has no character data', () => {
        expect(collectCharacters()).toEqual([]);
    });

    it('should find a single character name', () => {
        localStorage.setItem('Alice:settings', JSON.stringify({}));
        expect(collectCharacters()).toEqual(['Alice']);
    });

    it('should find multiple distinct character names', () => {
        localStorage.setItem('Alice:settings', JSON.stringify({}));
        localStorage.setItem('Bob:kill_counter', JSON.stringify({}));
        const result = collectCharacters();
        expect(result).toContain('Alice');
        expect(result).toContain('Bob');
        expect(result).toHaveLength(2);
    });

    it('should deduplicate character names when multiple keys exist for the same character', () => {
        localStorage.setItem('Alice:settings', JSON.stringify({}));
        localStorage.setItem('Alice:kill_counter', JSON.stringify({}));
        expect(collectCharacters()).toEqual(['Alice']);
    });

    it('should return names sorted alphabetically (case-insensitive)', () => {
        localStorage.setItem('Zebra:settings', JSON.stringify({}));
        localStorage.setItem('alice:settings', JSON.stringify({}));
        localStorage.setItem('Bob:settings', JSON.stringify({}));
        const result = collectCharacters();
        expect(result[0].toLowerCase()).toBe('alice');
        expect(result[1].toLowerCase()).toBe('bob');
        expect(result[2].toLowerCase()).toBe('zebra');
    });

    it('should ignore global (non-character-scoped) keys', () => {
        localStorage.setItem('triggers', JSON.stringify([]));
        localStorage.setItem('uiSettings', JSON.stringify({}));
        expect(collectCharacters()).toEqual([]);
    });

    it('should ignore keys with unknown base parts', () => {
        localStorage.setItem('Alice:unknownKey', 'value');
        expect(collectCharacters()).toEqual([]);
    });

    it('should ignore URL-like keys', () => {
        localStorage.setItem('https://example.com', 'value');
        expect(collectCharacters()).toEqual([]);
    });
});
