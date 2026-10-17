import { PluginApiImpl } from '@client/PluginApi';
import { characterStorage, globalStorage } from '@modules/core/storage';

const plugin = (id: string) => new PluginApiImpl({} as never, id);

describe('api.storage', () => {
    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('Ziolko');
    });

    test('keeps values per character, with defaults', () => {
        const api = plugin('zielarz');
        expect(api.storage.character.get('queue', [])).toEqual([]);
        expect(api.storage.character.get('queue')).toBeUndefined();
        api.storage.character.set('queue', ['delion', 'ziol']);
        expect(api.storage.character.get('queue', [])).toEqual(['delion', 'ziol']);

        characterStorage.setCharacter('Innyludek');
        expect(api.storage.character.get('queue', [])).toEqual([]);

        characterStorage.setCharacter('Ziolko');
        expect(api.storage.character.get('queue', [])).toEqual(['delion', 'ziol']);
    });

    test('global values are shared by characters', () => {
        const api = plugin('zielarz');
        api.storage.global.set('terrain', { i1: 'trakty' });
        characterStorage.setCharacter('Innyludek');
        expect(api.storage.global.get('terrain', {})).toEqual({ i1: 'trakty' });
    });

    test('plugins do not see each other\'s values', () => {
        plugin('a').storage.character.set('x', 1);
        plugin('b').storage.character.set('x', 2);
        expect(plugin('a').storage.character.get('x')).toBe(1);
        expect(plugin('b').storage.character.get('x')).toBe(2);
        expect(characterStorage.get('plugin_data')).toEqual({ a: { x: 1 }, b: { x: 2 } });
    });

    test('remove and keys', () => {
        const store = plugin('zielarz').storage.global;
        store.set('a', 1);
        store.set('b', false);
        expect(store.keys().sort()).toEqual(['a', 'b']);
        store.remove('a');
        expect(store.keys()).toEqual(['b']);
        expect(store.get('b', true)).toBe(false);
        expect(globalStorage.get('plugin_global_data')).toEqual({ zielarz: { b: false } });
    });

    test('onChange fires for its own key only, including on a character switch', () => {
        const api = plugin('zielarz');
        const seen: unknown[] = [];
        api.storage.character.onChange('queue', v => seen.push(v));
        api.storage.character.set('other', 1);
        api.storage.character.set('queue', ['delion']);
        characterStorage.setCharacter('Innyludek');
        expect(seen).toEqual([['delion'], undefined]);
    });

    test('cleanup removes its listeners', () => {
        const api = plugin('zielarz');
        const listener = jest.fn();
        api.storage.global.onChange('a', listener);
        api.cleanup();
        api.storage.global.set('a', 1);
        expect(listener).not.toHaveBeenCalled();
    });
});

describe('api.character', () => {
    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('Ziolko');
    });

    test('reports the active character and its changes', () => {
        const api = plugin('zielarz');
        const names: (string | null)[] = [];
        api.character.onChange(name => names.push(name));
        expect(api.character.getName()).toBe('Ziolko');
        characterStorage.setCharacter('Innyludek');
        expect(names).toEqual(['Innyludek']);
        api.cleanup();
        characterStorage.setCharacter('Ziolko');
        expect(names).toEqual(['Innyludek']);
    });
});
