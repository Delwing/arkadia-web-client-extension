import { characterStorage } from '@modules/core/storage';
import { setCurrentCharacter, getCurrentCharacter } from '@modules/core/storage';

// We need a fresh CharacterTypedStorage per test, but the module-level
// `currentCharacter` is shared. Use setCurrentCharacter('') to reset.
describe('CharacterTypedStorage', () => {
    beforeEach(() => {
        localStorage.clear();
        // Reset character state: setCurrentCharacter with empty resets to null
        setCurrentCharacter('');
    });

    describe('character prefix behavior', () => {
        test('get/set applies character prefix to localStorage key', () => {
            setCurrentCharacter('Alice');
            characterStorage.set('settings', { foo: 1 } as any);
            expect(localStorage.getItem('Alice:settings')).toBe(JSON.stringify({ foo: 1 }));
            expect(characterStorage.get('settings')).toEqual({ foo: 1 });
        });

        test('different characters store to different prefixed keys', () => {
            setCurrentCharacter('Alice');
            characterStorage.set('kill_counter', { wolf: 5 });
            setCurrentCharacter('Bob');
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

        test('setCurrentCharacter delegates to characterStorage.setCharacter', () => {
            setCurrentCharacter('Alice');
            expect(getCurrentCharacter()).toBe('Alice');
            expect(localStorage.getItem('currentCharacter')).toBe('Alice');
        });

        test('setting empty string clears currentCharacter', () => {
            setCurrentCharacter('Alice');
            setCurrentCharacter('');
            expect(localStorage.getItem('currentCharacter')).toBeNull();
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
            setCurrentCharacter('Alice');
            // After setting Alice again, unscoped 'settings' should still exist (no migration)
            // because currentCharacter was already set
            // Actually the module reads currentCharacter on load, so we need to simulate
            // that currentCharacter was already known.
            setCurrentCharacter('Bob');
            expect(localStorage.getItem('settings')).toBe(JSON.stringify({ old: true }));
        });
    });

    describe('onChange on character switch', () => {
        test('character switch fires onChange for character-scoped keys with data', () => {
            setCurrentCharacter('Alice');
            characterStorage.set('settings', { x: 1 } as any);
            const listener = jest.fn();
            characterStorage.onChange('settings', listener);

            localStorage.setItem('Bob:settings', JSON.stringify({ y: 2 }));
            characterStorage.setCharacter('Bob');

            expect(listener).toHaveBeenCalledWith({ y: 2 }, { x: 1 });
        });

        test('notifyOnNull: settings fires onChange even when new character has no data', () => {
            setCurrentCharacter('Alice');
            characterStorage.set('settings', { x: 1 } as any);
            const listener = jest.fn();
            characterStorage.onChange('settings', listener);

            characterStorage.setCharacter('Bob');
            // Bob has no settings, but settings has notifyOnNull: true
            expect(listener).toHaveBeenCalledWith(undefined, { x: 1 });
        });

        test('notifyOnNull: peopleLocalEvents fires onChange even when new value is null', () => {
            setCurrentCharacter('Alice');
            characterStorage.set('peopleLocalEvents', [{ type: 'event' }] as any);
            const listener = jest.fn();
            characterStorage.onChange('peopleLocalEvents', listener);

            characterStorage.setCharacter('Bob');
            // Bob has no peopleLocalEvents, but it has notifyOnNull: true
            expect(listener).toHaveBeenCalledWith(undefined, [{ type: 'event' }]);
        });

        test('non-notifyOnNull keys do NOT fire onChange when new character has no data', () => {
            setCurrentCharacter('Alice');
            characterStorage.set('kill_counter', { wolf: 5 });
            const listener = jest.fn();
            characterStorage.onChange('kill_counter', listener);

            characterStorage.setCharacter('Bob');
            // Bob has no kill_counter, and kill_counter does NOT have notifyOnNull
            expect(listener).not.toHaveBeenCalled();
        });

        test('character switch does not fire when old and new values are identical', () => {
            setCurrentCharacter('Alice');
            characterStorage.set('mapperRoomId', 42);
            localStorage.setItem('Bob:mapperRoomId', JSON.stringify(42));
            const listener = jest.fn();
            characterStorage.onChange('mapperRoomId', listener);

            characterStorage.setCharacter('Bob');
            // Same raw value in both Alice:mapperRoomId and Bob:mapperRoomId
            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('remove', () => {
        test('remove deletes the character-prefixed key', () => {
            setCurrentCharacter('Alice');
            characterStorage.set('lastLang', 'en');
            characterStorage.remove('lastLang');
            expect(localStorage.getItem('Alice:lastLang')).toBeNull();
            expect(characterStorage.get('lastLang')).toBeUndefined();
        });
    });
});
