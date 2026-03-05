import storage, { getItemSync, setItemSync, setCurrentCharacter } from '@modules/core/storage';

describe('backward compatibility', () => {
    beforeEach(() => {
        localStorage.clear();
        setCurrentCharacter('');
    });

    describe('getItemSync', () => {
        test('returns {[key]: value} wrapped format', () => {
            setCurrentCharacter('Alice');
            localStorage.setItem('Alice:settings', JSON.stringify({ a: 1 }));
            const result = getItemSync('settings');
            expect(result).toEqual({ settings: { a: 1 } });
        });

        test('returns undefined for missing non-settings key', () => {
            setCurrentCharacter('Alice');
            expect(getItemSync('kill_counter')).toBeUndefined();
        });

        test('applies character scoping', () => {
            setCurrentCharacter('Bob');
            localStorage.setItem('Bob:kill_counter', JSON.stringify({ wolf: 3 }));
            expect(getItemSync('kill_counter')).toEqual({ kill_counter: { wolf: 3 } });
        });
    });

    describe('setItemSync', () => {
        test('stores value with character scope', () => {
            setCurrentCharacter('Alice');
            setItemSync('settings', { b: 2 });
            expect(localStorage.getItem('Alice:settings')).toBe(JSON.stringify({ b: 2 }));
        });

        test('fires legacy onChanged listeners', () => {
            setCurrentCharacter('Alice');
            const listener = jest.fn();
            storage.onChanged?.addListener(listener);
            setItemSync('settings', { c: 3 });
            expect(listener).toHaveBeenCalledWith({
                settings: { oldValue: undefined, newValue: { c: 3 } }
            });
            storage.onChanged?.removeListener?.(listener);
        });
    });

    describe('setCurrentCharacter', () => {
        test('delegates to characterStorage and updates getCurrentCharacter', () => {
            setCurrentCharacter('Alice');
            expect(localStorage.getItem('currentCharacter')).toBe('Alice');
        });

        test('fires legacy listeners on character switch with data', () => {
            setCurrentCharacter('Alice');
            localStorage.setItem('Alice:settings', JSON.stringify({ old: true }));
            localStorage.setItem('Bob:settings', JSON.stringify({ new: true }));

            const listener = jest.fn();
            storage.onChanged?.addListener(listener);

            setCurrentCharacter('Bob');

            // Should have been called with settings change
            const settingsCall = listener.mock.calls.find(
                (call: any[]) => call[0]?.settings !== undefined
            );
            expect(settingsCall).toBeDefined();
            expect(settingsCall![0].settings.newValue).toEqual({ new: true });
            expect(settingsCall![0].settings.oldValue).toEqual({ old: true });

            storage.onChanged?.removeListener?.(listener);
        });
    });
});
