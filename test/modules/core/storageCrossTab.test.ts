import { characterStorage, globalStorage } from '@modules/core/storage';

/**
 * Tests for cross-tab storage sync and onAnyChange functionality.
 *
 * Covers:
 *  - CharacterTypedStorage.handleStorageEvent
 *  - CharacterTypedStorage.handleCrossTabCharacterChange
 *  - GlobalTypedStorage.handleStorageEvent
 *  - TypedStorage.onAnyChange
 */

beforeEach(() => {
    localStorage.clear();
    characterStorage.setCharacter('');
});

// ---------------------------------------------------------------------------
// CharacterTypedStorage.handleStorageEvent
// ---------------------------------------------------------------------------

describe('CharacterTypedStorage.handleStorageEvent', () => {
    describe('when the storage key is a known character-prefixed key', () => {
        test('returns true for a known character-prefixed key', () => {
            const result = characterStorage.handleStorageEvent(
                'Alice:settings',
                JSON.stringify({ theme: 'dark' }),
                JSON.stringify({ theme: 'light' }),
            );
            expect(result).toBe(true);
        });

        test('fires the onChange listener for the base key', () => {
            const listener = jest.fn();
            characterStorage.onChange('settings', listener);

            characterStorage.handleStorageEvent(
                'Alice:settings',
                JSON.stringify({ theme: 'dark' }),
                JSON.stringify({ theme: 'light' }),
            );

            expect(listener).toHaveBeenCalledTimes(1);
        });

        test('passes correctly parsed new and old JSON values to the listener', () => {
            const listener = jest.fn();
            characterStorage.onChange('settings', listener);

            const oldValue = { theme: 'dark' };
            const newValue = { theme: 'light' };
            characterStorage.handleStorageEvent(
                'Alice:settings',
                JSON.stringify(oldValue),
                JSON.stringify(newValue),
            );

            expect(listener).toHaveBeenCalledWith(newValue, oldValue);
        });

        test('passes undefined for null oldRaw', () => {
            const listener = jest.fn();
            characterStorage.onChange('kill_counter', listener);

            characterStorage.handleStorageEvent(
                'Alice:kill_counter',
                null,
                JSON.stringify({ wolf: 3 }),
            );

            expect(listener).toHaveBeenCalledWith({ wolf: 3 }, undefined);
        });

        test('passes undefined for null newRaw', () => {
            const listener = jest.fn();
            characterStorage.onChange('kill_counter', listener);

            characterStorage.handleStorageEvent(
                'Alice:kill_counter',
                JSON.stringify({ wolf: 3 }),
                null,
            );

            expect(listener).toHaveBeenCalledWith(undefined, { wolf: 3 });
        });

        test('passes undefined for both null oldRaw and null newRaw', () => {
            const listener = jest.fn();
            characterStorage.onChange('mapperRoomId', listener);

            characterStorage.handleStorageEvent('Alice:mapperRoomId', null, null);

            expect(listener).toHaveBeenCalledWith(undefined, undefined);
        });

        test('passes the raw string as value when JSON is malformed in newRaw', () => {
            const listener = jest.fn();
            characterStorage.onChange('lastLang', listener);

            characterStorage.handleStorageEvent('Alice:lastLang', null, 'not-json{');

            expect(listener).toHaveBeenCalledWith('not-json{', undefined);
        });

        test('passes the raw string as value when JSON is malformed in oldRaw', () => {
            const listener = jest.fn();
            characterStorage.onChange('lastLang', listener);

            characterStorage.handleStorageEvent(
                'Alice:lastLang',
                'not-json{',
                JSON.stringify('en'),
            );

            expect(listener).toHaveBeenCalledWith('en', 'not-json{');
        });

        test('fires listener for any character prefix — not just the active character', () => {
            characterStorage.setCharacter('Alice');
            const listener = jest.fn();
            characterStorage.onChange('mapperRoomId', listener);

            // Event comes from Bob's tab
            characterStorage.handleStorageEvent(
                'Bob:mapperRoomId',
                JSON.stringify(10),
                JSON.stringify(20),
            );

            expect(listener).toHaveBeenCalledWith(20, 10);
        });

        test('only fires listener for the matching base key, not for other keys', () => {
            const settingsListener = jest.fn();
            const killCounterListener = jest.fn();
            characterStorage.onChange('settings', settingsListener);
            characterStorage.onChange('kill_counter', killCounterListener);

            characterStorage.handleStorageEvent(
                'Alice:settings',
                null,
                JSON.stringify({ theme: 'light' }),
            );

            expect(settingsListener).toHaveBeenCalledTimes(1);
            expect(killCounterListener).not.toHaveBeenCalled();
        });

        test('works for other known character keys such as attack_mode', () => {
            const listener = jest.fn();
            characterStorage.onChange('attack_mode', listener);

            characterStorage.handleStorageEvent(
                'Hero:attack_mode',
                null,
                JSON.stringify('offensive'),
            );

            expect(listener).toHaveBeenCalledWith('offensive', undefined);
        });
    });

    describe('when the storage key is NOT a known character-prefixed key', () => {
        test('returns false for a key without any colon prefix', () => {
            const result = characterStorage.handleStorageEvent(
                'settings',
                null,
                JSON.stringify({ theme: 'light' }),
            );
            expect(result).toBe(false);
        });

        test('does not fire any listener when key has no colon prefix', () => {
            const listener = jest.fn();
            characterStorage.onChange('settings', listener);

            characterStorage.handleStorageEvent(
                'settings',
                null,
                JSON.stringify({ theme: 'light' }),
            );

            expect(listener).not.toHaveBeenCalled();
        });

        test('returns false for a character-prefixed key where base key is NOT in schema', () => {
            const result = characterStorage.handleStorageEvent(
                'Alice:unknownKey',
                null,
                JSON.stringify('value'),
            );
            expect(result).toBe(false);
        });

        test('does not fire any listener for an unknown base key', () => {
            const listener = jest.fn();
            characterStorage.onChange('settings', listener);

            characterStorage.handleStorageEvent(
                'Alice:unknownKey',
                null,
                JSON.stringify('value'),
            );

            expect(listener).not.toHaveBeenCalled();
        });

        test('returns false when colon is at index 0 (empty character name)', () => {
            // idx > 0 guard means a leading colon is rejected
            const result = characterStorage.handleStorageEvent(
                ':settings',
                null,
                JSON.stringify({ theme: 'light' }),
            );
            expect(result).toBe(false);
        });

        test('returns false for a global key that contains no colon', () => {
            const result = characterStorage.handleStorageEvent(
                'loggingEnabled',
                null,
                JSON.stringify(true),
            );
            expect(result).toBe(false);
        });
    });
});

// ---------------------------------------------------------------------------
// CharacterTypedStorage.handleCrossTabCharacterChange
// ---------------------------------------------------------------------------

describe('CharacterTypedStorage.handleCrossTabCharacterChange', () => {
    test('fires onChange listener when the new character has a different value for a key', () => {
        characterStorage.setCharacter('Alice');
        localStorage.setItem('Alice:settings', JSON.stringify({ theme: 'dark' }));
        localStorage.setItem('Bob:settings', JSON.stringify({ theme: 'light' }));

        const listener = jest.fn();
        characterStorage.onChange('settings', listener);

        characterStorage.handleCrossTabCharacterChange('Bob');

        expect(listener).toHaveBeenCalledWith({ theme: 'light' }, { theme: 'dark' });
    });

    test('does not fire onChange listener when values are identical between characters', () => {
        characterStorage.setCharacter('Alice');
        const sharedValue = JSON.stringify({ theme: 'dark' });
        localStorage.setItem('Alice:settings', sharedValue);
        localStorage.setItem('Bob:settings', sharedValue);

        const listener = jest.fn();
        characterStorage.onChange('settings', listener);

        characterStorage.handleCrossTabCharacterChange('Bob');

        expect(listener).not.toHaveBeenCalled();
    });

    test('fires onCharacterChange listener with the new character name', () => {
        characterStorage.setCharacter('Alice');

        const charListener = jest.fn();
        const unsub = characterStorage.onCharacterChange(charListener);

        characterStorage.handleCrossTabCharacterChange('Bob');
        unsub();

        expect(charListener).toHaveBeenCalledWith('Bob');
    });

    test('fires onCharacterChange with null when cross-tab logout occurs', () => {
        characterStorage.setCharacter('Alice');

        const charListener = jest.fn();
        const unsub = characterStorage.onCharacterChange(charListener);

        characterStorage.handleCrossTabCharacterChange(null);
        unsub();

        expect(charListener).toHaveBeenCalledWith(null);
    });

    test('fires onChange for keys with notifyOnNull when new character has no data', () => {
        characterStorage.setCharacter('Alice');
        localStorage.setItem('Alice:kill_counter', JSON.stringify({ wolf: 5 }));
        // Bob has no kill_counter

        const listener = jest.fn();
        characterStorage.onChange('kill_counter', listener);

        characterStorage.handleCrossTabCharacterChange('Bob');

        // kill_counter has notifyOnNull: true
        expect(listener).toHaveBeenCalledWith(undefined, { wolf: 5 });
    });

    test('does not fire onChange for keys without notifyOnNull when new value is null', () => {
        characterStorage.setCharacter('Alice');
        localStorage.setItem('Alice:mapperRoomId', JSON.stringify(42));
        // Bob has no mapperRoomId

        const listener = jest.fn();
        characterStorage.onChange('mapperRoomId', listener);

        characterStorage.handleCrossTabCharacterChange('Bob');

        // mapperRoomId does NOT have notifyOnNull, so no event when new is null
        expect(listener).not.toHaveBeenCalled();
    });

    test('updates the active character so subsequent get() reads from the new character', () => {
        characterStorage.setCharacter('Alice');
        localStorage.setItem('Bob:lastLang', JSON.stringify('en'));

        characterStorage.handleCrossTabCharacterChange('Bob');

        expect(characterStorage.getCharacter()).toBe('Bob');
        expect(characterStorage.get('lastLang')).toBe('en');
    });

    test('fires multiple onCharacterChange listeners', () => {
        characterStorage.setCharacter('Alice');

        const l1 = jest.fn();
        const l2 = jest.fn();
        const unsub1 = characterStorage.onCharacterChange(l1);
        const unsub2 = characterStorage.onCharacterChange(l2);

        characterStorage.handleCrossTabCharacterChange('Carol');
        unsub1();
        unsub2();

        expect(l1).toHaveBeenCalledWith('Carol');
        expect(l2).toHaveBeenCalledWith('Carol');
    });
});

// ---------------------------------------------------------------------------
// GlobalTypedStorage.handleStorageEvent
// ---------------------------------------------------------------------------

describe('GlobalTypedStorage.handleStorageEvent', () => {
    describe('when the storage key is a non-character global key', () => {
        test('returns true for a known global key', () => {
            const result = globalStorage.handleStorageEvent(
                'loggingEnabled',
                JSON.stringify(false),
                JSON.stringify(true),
            );
            expect(result).toBe(true);
        });

        test('fires the onChange listener with parsed new and old values', () => {
            const listener = jest.fn();
            globalStorage.onChange('loggingEnabled', listener);

            globalStorage.handleStorageEvent(
                'loggingEnabled',
                JSON.stringify(false),
                JSON.stringify(true),
            );

            expect(listener).toHaveBeenCalledWith(true, false);
        });

        test('passes undefined for null oldRaw', () => {
            const listener = jest.fn();
            globalStorage.onChange('loggingEnabled', listener);

            globalStorage.handleStorageEvent('loggingEnabled', null, JSON.stringify(true));

            expect(listener).toHaveBeenCalledWith(true, undefined);
        });

        test('passes undefined for null newRaw', () => {
            const listener = jest.fn();
            globalStorage.onChange('loggingEnabled', listener);

            globalStorage.handleStorageEvent('loggingEnabled', JSON.stringify(true), null);

            expect(listener).toHaveBeenCalledWith(undefined, true);
        });

        test('passes raw string when JSON is malformed in newRaw', () => {
            const listener = jest.fn();
            globalStorage.onChange('active_keymap_id', listener);

            globalStorage.handleStorageEvent('active_keymap_id', null, 'bad{json');

            expect(listener).toHaveBeenCalledWith('bad{json', undefined);
        });

        test('passes raw string when JSON is malformed in oldRaw', () => {
            const listener = jest.fn();
            globalStorage.onChange('active_keymap_id', listener);

            globalStorage.handleStorageEvent(
                'active_keymap_id',
                'bad{json',
                JSON.stringify('custom'),
            );

            expect(listener).toHaveBeenCalledWith('custom', 'bad{json');
        });

        test('returns true for an arbitrary unknown key that has no colon and is not in characterKeySet', () => {
            // Any key that is not in characterKeySet and has no colon should be handled
            const result = globalStorage.handleStorageEvent(
                'someArbitraryGlobalKey',
                null,
                JSON.stringify('value'),
            );
            expect(result).toBe(true);
        });
    });

    describe('when the storage key should be rejected', () => {
        test('returns false for a character-scoped key with colon prefix', () => {
            const result = globalStorage.handleStorageEvent(
                'Alice:settings',
                null,
                JSON.stringify({ theme: 'light' }),
            );
            expect(result).toBe(false);
        });

        test('does not fire any listener for a character-scoped key with colon prefix', () => {
            const listener = jest.fn();
            globalStorage.onChange('loggingEnabled', listener);

            globalStorage.handleStorageEvent(
                'Alice:loggingEnabled',
                null,
                JSON.stringify(true),
            );

            expect(listener).not.toHaveBeenCalled();
        });

        test('returns false for a bare character storage key (in characterKeySet)', () => {
            // 'settings' is a character storage key — global storage must reject it
            const result = globalStorage.handleStorageEvent(
                'settings',
                null,
                JSON.stringify({ theme: 'light' }),
            );
            expect(result).toBe(false);
        });

        test('does not fire any listener for a bare character storage key', () => {
            const listener = jest.fn();
            globalStorage.onChange('loggingEnabled', listener);

            globalStorage.handleStorageEvent(
                'kill_counter',
                null,
                JSON.stringify({ wolf: 2 }),
            );

            expect(listener).not.toHaveBeenCalled();
        });

        test('returns false for attack_mode (a character key) without a colon', () => {
            const result = globalStorage.handleStorageEvent(
                'attack_mode',
                null,
                JSON.stringify('offensive'),
            );
            expect(result).toBe(false);
        });
    });
});

// ---------------------------------------------------------------------------
// TypedStorage.onAnyChange
// ---------------------------------------------------------------------------

describe('TypedStorage.onAnyChange', () => {
    describe('on globalStorage', () => {
        test('fires with (key, newValue, oldValue) when set() is called', () => {
            const listener = jest.fn();
            globalStorage.onAnyChange(listener);

            globalStorage.set('loggingEnabled', true);

            expect(listener).toHaveBeenCalledWith('loggingEnabled', true, undefined);
        });

        test('fires with correct oldValue on subsequent set()', () => {
            globalStorage.set('loggingEnabled', false);
            const listener = jest.fn();
            globalStorage.onAnyChange(listener);

            globalStorage.set('loggingEnabled', true);

            expect(listener).toHaveBeenCalledWith('loggingEnabled', true, false);
        });

        test('fires with (key, undefined, oldValue) when remove() is called', () => {
            globalStorage.set('loggingEnabled', true);
            const listener = jest.fn();
            globalStorage.onAnyChange(listener);

            globalStorage.remove('loggingEnabled');

            expect(listener).toHaveBeenCalledWith('loggingEnabled', undefined, true);
        });

        test('unsubscribe stops future notifications', () => {
            const listener = jest.fn();
            const unsub = globalStorage.onAnyChange(listener);

            globalStorage.set('loggingEnabled', true);
            expect(listener).toHaveBeenCalledTimes(1);

            unsub();
            globalStorage.set('loggingEnabled', false);
            expect(listener).toHaveBeenCalledTimes(1);
        });

        test('multiple onAnyChange listeners all fire for the same change', () => {
            const l1 = jest.fn();
            const l2 = jest.fn();
            globalStorage.onAnyChange(l1);
            globalStorage.onAnyChange(l2);

            globalStorage.set('loggingEnabled', true);

            expect(l1).toHaveBeenCalledWith('loggingEnabled', true, undefined);
            expect(l2).toHaveBeenCalledWith('loggingEnabled', true, undefined);
        });

        test('onAnyChange and per-key onChange both fire for the same change', () => {
            const anyListener = jest.fn();
            const keyListener = jest.fn();
            globalStorage.onAnyChange(anyListener);
            globalStorage.onChange('loggingEnabled', keyListener);

            globalStorage.set('loggingEnabled', true);

            expect(anyListener).toHaveBeenCalledWith('loggingEnabled', true, undefined);
            expect(keyListener).toHaveBeenCalledWith(true, undefined);
        });

        test('unsubscribing one onAnyChange listener does not affect others', () => {
            const l1 = jest.fn();
            const l2 = jest.fn();
            const unsub1 = globalStorage.onAnyChange(l1);
            globalStorage.onAnyChange(l2);

            unsub1();
            globalStorage.set('loggingEnabled', true);

            expect(l1).not.toHaveBeenCalled();
            expect(l2).toHaveBeenCalledWith('loggingEnabled', true, undefined);
        });

        test('fires with the schema key name, not the raw localStorage key', () => {
            const listener = jest.fn();
            globalStorage.onAnyChange(listener);

            globalStorage.set('active_keymap_id', 'default');

            expect(listener).toHaveBeenCalledWith('active_keymap_id', 'default', undefined);
        });
    });

    describe('on characterStorage', () => {
        test('fires with the base key name (not the character-prefixed key) when set() is called', () => {
            characterStorage.setCharacter('Alice');
            const listener = jest.fn();
            characterStorage.onAnyChange(listener);

            characterStorage.set('lastLang', 'en');

            // Should receive 'lastLang', not 'Alice:lastLang'
            expect(listener).toHaveBeenCalledWith('lastLang', 'en', undefined);
        });

        test('fires with the base key name when remove() is called', () => {
            characterStorage.setCharacter('Alice');
            characterStorage.set('lastLang', 'en');
            const listener = jest.fn();
            characterStorage.onAnyChange(listener);

            characterStorage.remove('lastLang');

            expect(listener).toHaveBeenCalledWith('lastLang', undefined, 'en');
        });

        test('fires onAnyChange when handleStorageEvent processes a cross-tab update', () => {
            const listener = jest.fn();
            characterStorage.onAnyChange(listener);

            characterStorage.handleStorageEvent(
                'Alice:kill_counter',
                null,
                JSON.stringify({ wolf: 7 }),
            );

            expect(listener).toHaveBeenCalledWith('kill_counter', { wolf: 7 }, undefined);
        });

        test('unsubscribe stops notifications on characterStorage', () => {
            characterStorage.setCharacter('Alice');
            const listener = jest.fn();
            const unsub = characterStorage.onAnyChange(listener);

            characterStorage.set('lastLang', 'pl');
            expect(listener).toHaveBeenCalledTimes(1);

            unsub();
            characterStorage.set('lastLang', 'en');
            expect(listener).toHaveBeenCalledTimes(1);
        });

        test('both onAnyChange and per-key onChange fire on characterStorage set()', () => {
            characterStorage.setCharacter('Alice');
            const anyListener = jest.fn();
            const keyListener = jest.fn();
            characterStorage.onAnyChange(anyListener);
            characterStorage.onChange('lastLang', keyListener);

            characterStorage.set('lastLang', 'de');

            expect(anyListener).toHaveBeenCalledWith('lastLang', 'de', undefined);
            expect(keyListener).toHaveBeenCalledWith('de', undefined);
        });
    });
});
