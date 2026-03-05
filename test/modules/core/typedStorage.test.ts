import { TypedStorage } from '@modules/core/storage';

interface TestSchema {
    name: string;
    count: number;
    items: string[];
    nested: { a: number; b: string };
}

describe('TypedStorage', () => {
    let store: TypedStorage<TestSchema>;

    beforeEach(() => {
        localStorage.clear();
        store = new TypedStorage<TestSchema>();
    });

    describe('get/set/remove', () => {
        test('get returns undefined for missing key', () => {
            expect(store.get('name')).toBeUndefined();
        });

        test('set stores and get retrieves a string value', () => {
            store.set('name', 'Alice');
            expect(store.get('name')).toBe('Alice');
        });

        test('set stores and get retrieves a number value', () => {
            store.set('count', 42);
            expect(store.get('count')).toBe(42);
        });

        test('set stores and get retrieves an array value', () => {
            store.set('items', ['a', 'b']);
            expect(store.get('items')).toEqual(['a', 'b']);
        });

        test('set stores and get retrieves a nested object', () => {
            store.set('nested', { a: 1, b: 'two' });
            expect(store.get('nested')).toEqual({ a: 1, b: 'two' });
        });

        test('set overwrites previous value', () => {
            store.set('count', 1);
            store.set('count', 2);
            expect(store.get('count')).toBe(2);
        });

        test('remove deletes the key', () => {
            store.set('name', 'Alice');
            store.remove('name');
            expect(store.get('name')).toBeUndefined();
            expect(localStorage.getItem('name')).toBeNull();
        });

        test('JSON serialization round-trip via localStorage', () => {
            store.set('items', ['x', 'y']);
            expect(localStorage.getItem('items')).toBe(JSON.stringify(['x', 'y']));
        });
    });

    describe('resolveKey', () => {
        test('custom resolveKey transforms the localStorage key', () => {
            const prefixed = new TypedStorage<TestSchema>((key) => `prefix_${key}`);
            prefixed.set('name', 'Bob');
            expect(localStorage.getItem('prefix_name')).toBe(JSON.stringify('Bob'));
            expect(prefixed.get('name')).toBe('Bob');
        });
    });

    describe('onChange', () => {
        test('listener fires on set with correct old and new values', () => {
            const listener = jest.fn();
            store.onChange('count', listener);
            store.set('count', 10);
            expect(listener).toHaveBeenCalledWith(10, undefined);
        });

        test('listener receives previous value as oldValue', () => {
            store.set('count', 5);
            const listener = jest.fn();
            store.onChange('count', listener);
            store.set('count', 15);
            expect(listener).toHaveBeenCalledWith(15, 5);
        });

        test('listener fires on remove with undefined newValue', () => {
            store.set('name', 'Alice');
            const listener = jest.fn();
            store.onChange('name', listener);
            store.remove('name');
            expect(listener).toHaveBeenCalledWith(undefined, 'Alice');
        });

        test('listener only fires for the subscribed key', () => {
            const nameListener = jest.fn();
            const countListener = jest.fn();
            store.onChange('name', nameListener);
            store.onChange('count', countListener);
            store.set('name', 'Bob');
            expect(nameListener).toHaveBeenCalledTimes(1);
            expect(countListener).not.toHaveBeenCalled();
        });

        test('unsubscribe stops future notifications', () => {
            const listener = jest.fn();
            const unsub = store.onChange('count', listener);
            store.set('count', 1);
            expect(listener).toHaveBeenCalledTimes(1);
            unsub();
            store.set('count', 2);
            expect(listener).toHaveBeenCalledTimes(1);
        });

        test('multiple listeners on same key all fire', () => {
            const l1 = jest.fn();
            const l2 = jest.fn();
            store.onChange('name', l1);
            store.onChange('name', l2);
            store.set('name', 'Test');
            expect(l1).toHaveBeenCalledWith('Test', undefined);
            expect(l2).toHaveBeenCalledWith('Test', undefined);
        });

        test('unsubscribing one listener does not affect others', () => {
            const l1 = jest.fn();
            const l2 = jest.fn();
            const unsub1 = store.onChange('name', l1);
            store.onChange('name', l2);
            unsub1();
            store.set('name', 'Test');
            expect(l1).not.toHaveBeenCalled();
            expect(l2).toHaveBeenCalledTimes(1);
        });
    });
});
