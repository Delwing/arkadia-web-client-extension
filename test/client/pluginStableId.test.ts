import { PluginManager } from '@client/PluginManager';
import { PluginApiImpl } from '@client/PluginApi';
import { characterStorage } from '@modules/core/storage';
import { getPluginHostPort, setPluginHostPort, type PluginPopupConfig } from '@client/ports';
import type { Plugin } from '@shared/types/Plugin';

const OLD_URL = 'https://old.example.com/zielarz.js';
const NEW_URL = 'https://new.example.com/zielarz.js';

/** A plugin module that remembers a value and records the api it got. */
function zielarzModule(stableId?: unknown) {
    const apis: PluginApiImpl[] = [];
    const module: Plugin & { stableId?: unknown } = {
        ...(stableId !== undefined && { stableId }),
        init: async (api) => {
            apis.push(api as PluginApiImpl);
            return { name: 'Zielarz', version: '1.0.0' };
        },
    };
    return { module: module as Plugin, apis };
}

async function load(manager: PluginManager, url: string, module: Plugin) {
    jest.spyOn(manager as never, 'loadAsModule').mockResolvedValueOnce(module as never);
    return manager.loadPlugin(url);
}

describe('plugin stableId', () => {
    const original = getPluginHostPort();
    const registered: PluginPopupConfig[] = [];

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('Ziolko');
        registered.length = 0;
        setPluginHostPort({ ...original, registerPluginPopup: (config) => { registered.push(config); } });
    });

    afterEach(() => setPluginHostPort(original));

    test('keeps storage and windows under the stable id, so they follow the plugin to a new address', async () => {
        const first = zielarzModule('zielarz');
        const loaded = await load(new PluginManager({} as never), OLD_URL, first.module);
        expect(loaded.stableId).toBe('zielarz');
        first.apis[0].storage.character.set('queue', ['delion']);
        await first.apis[0].ui.registerPersistentPopup({ id: 'main', title: 'Zielarz', createContent: () => '' });

        const second = zielarzModule('zielarz');
        await load(new PluginManager({} as never), NEW_URL, second.module);
        expect(second.apis[0].storage.character.get('queue')).toEqual(['delion']);
        await second.apis[0].ui.registerPersistentPopup({ id: 'main', title: 'Zielarz', createContent: () => '' });

        expect(registered.map(c => c.popupId)).toEqual(['popup:plugin:zielarz:main', 'popup:plugin:zielarz:main']);
    });

    test('without one, state stays under the URL', async () => {
        const first = zielarzModule();
        await load(new PluginManager({} as never), OLD_URL, first.module);
        first.apis[0].storage.character.set('queue', ['delion']);

        const second = zielarzModule();
        await load(new PluginManager({} as never), NEW_URL, second.module);
        expect(second.apis[0].storage.character.get('queue')).toBeUndefined();
    });

    test('a malformed or already used id is ignored', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const manager = new PluginManager({} as never);

        const bad = await load(manager, 'https://a.example.com/x.js', zielarzModule('zielarz plugin!').module);
        expect(bad.stableId).toBeUndefined();

        const owner = await load(manager, OLD_URL, zielarzModule('zielarz').module);
        const copy = await load(manager, NEW_URL, zielarzModule('zielarz').module);
        expect(owner.stableId).toBe('zielarz');
        expect(copy.stableId).toBeUndefined();
        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });
});
