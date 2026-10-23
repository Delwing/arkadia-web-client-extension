import { PluginApiImpl } from '@client/PluginApi';
import { characterStorage } from '@modules/core/storage';
import { getContainer } from '@client/scripts/bagManager';

const herbData = {
    version: 1,
    herb_id_to_use: {},
    herb_id_to_odmiana: {
        deliona: {
            mianownik: 'zolty jasny kwiat', dopelniacz: 'zoltego jasnego kwiata', biernik: 'zolty jasny kwiat',
            mnoga_mianownik: 'zolte jasne kwiaty', mnoga_dopelniacz: 'zoltych jasnych kwiatow', mnoga_biernik: 'zolte jasne kwiaty',
            narzednik: 'zoltym jasnym kwiatem',
        },
    },
};

vi.mock('@client/scripts/herbsLoader', () => ({
    default: () => Promise.resolve(herbData),
    subscribeToHerbs: () => () => {},
}));

describe('plugin herbs and containers', () => {
    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
    });

    test('resolves herb names and builds count forms', async () => {
        const api = new PluginApiImpl({} as never, 'jubiler');
        await expect(api.herbs.resolve('zolte jasne kwiaty')).resolves.toBe('deliona');
        await expect(api.herbs.resolve('trawa')).resolves.toBeNull();
        await expect(api.herbs.form('deliona', 5)).resolves.toBe('zoltych jasnych kwiatow');
    });

    test('forwards awaitable herb builds with cancellation and reports an uninitialized manager', async () => {
        const bags = { 1: { herbs: { deliona: 2 } } };
        const buildBags = vi.fn().mockResolvedValue(bags);
        const api = new PluginApiImpl({ herbManager: { buildBags } } as never, 'zielarz');
        const options = { signal: new AbortController().signal, timeout: 1000 };
        await expect(api.herbs.buildBags(options)).resolves.toEqual(bags);
        expect(buildBags).toHaveBeenCalledWith(options);
        const unavailable = new PluginApiImpl({} as never, 'other');
        await expect(unavailable.herbs.buildBags()).rejects.toThrow('Herb manager not initialized');
    });

    test('a plugin sets bags only for its own types', () => {
        const jubiler = new PluginApiImpl({} as never, 'jubiler');
        const other = new PluginApiImpl({} as never, 'other');
        jubiler.containers.registerType('jubiler-kamienie', { label: 'Jubiler: kamienie', fallback: 'other' });

        expect(other.containers.setContainer('jubiler-kamienie', 'torba')).toBe(false);
        expect(jubiler.containers.setContainer('gems', 'torba')).toBe(false);
        expect(jubiler.containers.setContainer('jubiler-kamienie', 'torba')).toBe(true);
        expect(jubiler.containers.getCommandForms('jubiler-kamienie')).toEqual({ biernik: 'swoja torbe', dopelniacz: 'swojej torby', from: 'ze' });
        expect(jubiler.containers.listBags()).toContain('worek');

        // Unloading forgets the type but keeps the player's choice for the next load
        jubiler.cleanup();
        expect(jubiler.containers.setContainer('jubiler-kamienie', 'worek')).toBe(false);
        const reloaded = new PluginApiImpl({} as never, 'jubiler');
        reloaded.containers.registerType('jubiler-kamienie', { fallback: 'other' });
        expect(getContainer('jubiler-kamienie')).toBe('torba');
        reloaded.cleanup();
    });
});
