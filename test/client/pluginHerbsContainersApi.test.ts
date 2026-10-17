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
        const api = new PluginApiImpl({} as never, 'zielarz');
        await expect(api.herbs.resolve('zolte jasne kwiaty')).resolves.toBe('deliona');
        await expect(api.herbs.resolve('trawa')).resolves.toBeNull();
        await expect(api.herbs.form('deliona', 5)).resolves.toBe('zoltych jasnych kwiatow');
    });

    test('a plugin sets bags only for its own types', () => {
        const zielarz = new PluginApiImpl({} as never, 'zielarz');
        const other = new PluginApiImpl({} as never, 'other');
        zielarz.containers.registerType('zielarz-robocza', { label: 'Zielarz: robocza', fallback: 'other' });

        expect(other.containers.setContainer('zielarz-robocza', 'torba')).toBe(false);
        expect(zielarz.containers.setContainer('gems', 'torba')).toBe(false);
        expect(zielarz.containers.setContainer('zielarz-robocza', 'torba')).toBe(true);
        expect(zielarz.containers.getCommandForms('zielarz-robocza')).toEqual({ biernik: 'swoja torbe', dopelniacz: 'swojej torby', from: 'ze' });
        expect(zielarz.containers.listBags()).toContain('worek');

        // Unloading forgets the type but keeps the player's choice for the next load
        zielarz.cleanup();
        expect(zielarz.containers.setContainer('zielarz-robocza', 'worek')).toBe(false);
        const reloaded = new PluginApiImpl({} as never, 'zielarz');
        reloaded.containers.registerType('zielarz-robocza', { fallback: 'other' });
        expect(getContainer('zielarz-robocza')).toBe('torba');
        reloaded.cleanup();
    });
});
