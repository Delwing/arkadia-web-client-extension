import { characterStorage, migrateNewlyCharacterScopedKeys } from '@modules/core/storage';

// We need a fresh CharacterTypedStorage per test, but the module-level
// `currentCharacter` is shared. Use characterStorage.setCharacter('') to reset.
describe('CharacterTypedStorage', () => {
    beforeEach(() => {
        localStorage.clear();
        // Reset character state: setCharacter with empty resets to null
        characterStorage.setCharacter('');
    });

    describe('character prefix behavior', () => {
        test('get/set applies character prefix to localStorage key', () => {
            characterStorage.setCharacter('Alice');
            characterStorage.set('settings', { foo: 1 } as any);
            expect(localStorage.getItem('Alice:settings')).toBe(JSON.stringify({ foo: 1 }));
            expect(characterStorage.get('settings')).toEqual({ foo: 1 });
        });

        test('different characters store to different prefixed keys', () => {
            characterStorage.setCharacter('Alice');
            characterStorage.set('kill_counter', { wolf: 5 });
            characterStorage.setCharacter('Bob');
            characterStorage.set('kill_counter', { dragon: 3 });
            expect(localStorage.getItem('Alice:kill_counter')).toBe(JSON.stringify({ wolf: 5 }));
            expect(localStorage.getItem('Bob:kill_counter')).toBe(JSON.stringify({ dragon: 3 }));
            expect(characterStorage.get('kill_counter')).toEqual({ dragon: 3 });
        });
    });

    describe('setCharacter / getCharacter', () => {
        test('setCharacter stores currentCharacter in localStorage', () => {
            characterStorage.setCharacter('Hero');
            expect(localStorage.getItem('currentCharacter')).toBe('Hero');
        });

        test('getCharacter returns the current character', () => {
            characterStorage.setCharacter('Hero');
            expect(characterStorage.getCharacter()).toBe('Hero');
        });

        test('setCharacter updates getCharacter and localStorage', () => {
            characterStorage.setCharacter('Alice');
            expect(characterStorage.getCharacter()).toBe('Alice');
            expect(localStorage.getItem('currentCharacter')).toBe('Alice');
        });

        test('setting empty string clears currentCharacter', () => {
            characterStorage.setCharacter('Alice');
            characterStorage.setCharacter('');
            expect(localStorage.getItem('currentCharacter')).toBeNull();
        });

        test('onCharacterChange fires on a switch', () => {
            const listener = jest.fn();
            const off = characterStorage.onCharacterChange(listener);
            characterStorage.setCharacter('Alice');
            characterStorage.setCharacter('Bob');
            off();
            expect(listener.mock.calls).toEqual([['Alice'], ['Bob']]);
        });

        test('onCharacterChange stays quiet when the same name is announced again', () => {
            characterStorage.setCharacter('Alice');
            const listener = jest.fn();
            const off = characterStorage.onCharacterChange(listener);
            // char.info re-announces the name through the session; nothing about the scope moved.
            characterStorage.setCharacter('Alice');
            off();
            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('first-character migration', () => {
        test('moves unscoped data to character-prefixed keys on first login', () => {
            localStorage.setItem('settings', JSON.stringify({ a: 1 }));
            localStorage.setItem('kill_counter', JSON.stringify({ wolf: 2 }));
            characterStorage.setCharacter('Hero');
            expect(localStorage.getItem('Hero:settings')).toBe(JSON.stringify({ a: 1 }));
            expect(localStorage.getItem('Hero:kill_counter')).toBe(JSON.stringify({ wolf: 2 }));
            expect(localStorage.getItem('settings')).toBeNull();
            expect(localStorage.getItem('kill_counter')).toBeNull();
        });

        test('does not migrate when a character already existed', () => {
            localStorage.setItem('currentCharacter', 'Alice');
            localStorage.setItem('settings', JSON.stringify({ old: true }));
            // Re-import/construct won't help since module is cached; use setCurrentCharacter
            characterStorage.setCharacter('Alice');
            // After setting Alice again, unscoped 'settings' should still exist (no migration)
            // because currentCharacter was already set
            // Actually the module reads currentCharacter on load, so we need to simulate
            // that currentCharacter was already known.
            characterStorage.setCharacter('Bob');
            expect(localStorage.getItem('settings')).toBe(JSON.stringify({ old: true }));
        });
    });

    describe('onChange on character switch', () => {
        test('character switch fires onChange for character-scoped keys with data', () => {
            characterStorage.setCharacter('Alice');
            characterStorage.set('settings', { x: 1 } as any);
            const listener = jest.fn();
            characterStorage.onChange('settings', listener);

            localStorage.setItem('Bob:settings', JSON.stringify({ y: 2 }));
            characterStorage.setCharacter('Bob');

            expect(listener).toHaveBeenCalledWith({ y: 2 }, { x: 1 });
        });

        test('notifyOnNull: settings fires onChange even when new character has no data', () => {
            characterStorage.setCharacter('Alice');
            characterStorage.set('settings', { x: 1 } as any);
            const listener = jest.fn();
            characterStorage.onChange('settings', listener);

            characterStorage.setCharacter('Bob');
            // Bob has no settings, but settings has notifyOnNull: true
            expect(listener).toHaveBeenCalledWith(undefined, { x: 1 });
        });

        test('notifyOnNull: peopleLocalEvents fires onChange even when new value is null', () => {
            characterStorage.setCharacter('Alice');
            characterStorage.set('peopleLocalEvents', [{ type: 'event' }] as any);
            const listener = jest.fn();
            characterStorage.onChange('peopleLocalEvents', listener);

            characterStorage.setCharacter('Bob');
            // Bob has no peopleLocalEvents, but it has notifyOnNull: true
            expect(listener).toHaveBeenCalledWith(undefined, [{ type: 'event' }]);
        });

        test('notifyOnNull: newly scoped keys fire onChange when new character has no data', () => {
            characterStorage.setCharacter('Alice');
            characterStorage.set('attack_mode', 'offensive' as any);
            const attackListener = jest.fn();
            characterStorage.onChange('attack_mode', attackListener);

            characterStorage.setCharacter('Bob');
            // Bob has no data for this key, but it has notifyOnNull: true
            expect(attackListener).toHaveBeenCalledWith(undefined, 'offensive');
        });

        test('notifyOnNull keys fire onChange with undefined when new character has no data', () => {
            characterStorage.setCharacter('Alice');
            characterStorage.set('kill_counter', { wolf: 5 });
            const listener = jest.fn();
            characterStorage.onChange('kill_counter', listener);

            characterStorage.setCharacter('Bob');
            // Bob has no kill_counter, but kill_counter has notifyOnNull: true
            expect(listener).toHaveBeenCalledWith(undefined, { wolf: 5 });
        });

        test('character switch does not fire when old and new values are identical', () => {
            characterStorage.setCharacter('Alice');
            characterStorage.set('mapperRoomId', 42);
            localStorage.setItem('Bob:mapperRoomId', JSON.stringify(42));
            const listener = jest.fn();
            characterStorage.onChange('mapperRoomId', listener);

            characterStorage.setCharacter('Bob');
            // Same raw value in both Alice:mapperRoomId and Bob:mapperRoomId
            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('migrateNewlyCharacterScopedKeys', () => {
        test('moves newly scoped keys to character prefix for existing profiles', () => {
            localStorage.setItem('currentCharacter', 'Hero');
            localStorage.setItem('attack_mode', JSON.stringify('offensive'));
            localStorage.setItem('improve_counter', JSON.stringify({ sword: 3 }));

            migrateNewlyCharacterScopedKeys();

            expect(localStorage.getItem('Hero:attack_mode')).toBe(JSON.stringify('offensive'));
            expect(localStorage.getItem('Hero:improve_counter')).toBe(JSON.stringify({ sword: 3 }));
            // Unscoped keys removed
            expect(localStorage.getItem('attack_mode')).toBeNull();
            expect(localStorage.getItem('improve_counter')).toBeNull();
        });

        test('does not overwrite existing character-prefixed data', () => {
            localStorage.setItem('currentCharacter', 'Hero');
            localStorage.setItem('attack_mode', JSON.stringify('old'));
            localStorage.setItem('Hero:attack_mode', JSON.stringify('current'));

            migrateNewlyCharacterScopedKeys();

            // Existing prefixed value preserved
            expect(localStorage.getItem('Hero:attack_mode')).toBe(JSON.stringify('current'));
            // Unscoped key left as-is since prefixed already exists
            expect(localStorage.getItem('attack_mode')).toBe(JSON.stringify('old'));
        });

        test('does nothing when no currentCharacter is set', () => {
            localStorage.setItem('attack_mode', JSON.stringify('offensive'));

            migrateNewlyCharacterScopedKeys();

            expect(localStorage.getItem('attack_mode')).toBe(JSON.stringify('offensive'));
        });

        test('runs only once (flag prevents re-run)', () => {
            localStorage.setItem('currentCharacter', 'Hero');
            localStorage.setItem('attack_mode', JSON.stringify('offensive'));

            migrateNewlyCharacterScopedKeys();
            expect(localStorage.getItem('attack_mode')).toBeNull();

            // Add new unscoped data after migration
            localStorage.setItem('chat_history', JSON.stringify([{ msg: 'hi' }]));
            migrateNewlyCharacterScopedKeys();

            // Not migrated because flag was already set
            expect(localStorage.getItem('chat_history')).toBe(JSON.stringify([{ msg: 'hi' }]));
            expect(localStorage.getItem('Hero:chat_history')).toBeNull();
        });
    });

    describe('remove', () => {
        test('remove deletes the character-prefixed key', () => {
            characterStorage.setCharacter('Alice');
            characterStorage.set('lastLang', 'en');
            characterStorage.remove('lastLang');
            expect(localStorage.getItem('Alice:lastLang')).toBeNull();
            expect(characterStorage.get('lastLang')).toBeUndefined();
        });
    });
});
