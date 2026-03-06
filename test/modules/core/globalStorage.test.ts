import { globalStorage, characterStorage } from '@modules/core/storage';

describe('GlobalTypedStorage', () => {
    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('');
    });

    test('get/set uses keys directly without prefix', () => {
        globalStorage.set('loggingEnabled', true);
        expect(localStorage.getItem('loggingEnabled')).toBe('true');
        expect(globalStorage.get('loggingEnabled')).toBe(true);
    });

    test('get returns undefined for missing key', () => {
        expect(globalStorage.get('loggingEnabled')).toBeUndefined();
    });

    test('set stores and retrieves complex objects', () => {
        globalStorage.set('shortcuts', { test: { key: 'a', action: 'run' } } as any);
        expect(globalStorage.get('shortcuts')).toEqual({ test: { key: 'a', action: 'run' } });
    });

    test('global keys are not affected by character prefix', () => {
        characterStorage.setCharacter('Alice');
        globalStorage.set('loggingEnabled', true);
        // Should be stored as 'loggingEnabled', not 'Alice:loggingEnabled'
        expect(localStorage.getItem('loggingEnabled')).toBe('true');
        expect(localStorage.getItem('Alice:loggingEnabled')).toBeNull();
    });

    test('onChange fires with correct values', () => {
        const listener = jest.fn();
        globalStorage.onChange('loggingEnabled', listener);
        globalStorage.set('loggingEnabled', true);
        expect(listener).toHaveBeenCalledWith(true, undefined);
    });

    test('onChange fires with old and new values on update', () => {
        globalStorage.set('active_keymap_id', 'default');
        const listener = jest.fn();
        globalStorage.onChange('active_keymap_id', listener);
        globalStorage.set('active_keymap_id', 'custom');
        expect(listener).toHaveBeenCalledWith('custom', 'default');
    });

    test('unsubscribe stops notifications', () => {
        const listener = jest.fn();
        const unsub = globalStorage.onChange('loggingEnabled', listener);
        globalStorage.set('loggingEnabled', true);
        unsub();
        globalStorage.set('loggingEnabled', false);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    test('remove works correctly', () => {
        globalStorage.set('active_keymap_id', 'test');
        const listener = jest.fn();
        globalStorage.onChange('active_keymap_id', listener);
        globalStorage.remove('active_keymap_id');
        expect(globalStorage.get('active_keymap_id')).toBeUndefined();
        expect(listener).toHaveBeenCalledWith(undefined, 'test');
    });
});
