import { PluginApiImpl } from '@client/PluginApi';
import { getPluginHostPort, setPluginHostPort, type PluginHostPort, type PluginPopupConfig } from '@client/ports';

describe('plugin UI kit and popup settings', () => {
    const original = getPluginHostPort();
    afterEach(() => setPluginHostPort(original));

    test('react and components throw a clear error without a UI host', () => {
        const api = new PluginApiImpl({} as never, 'test/ui');
        expect(() => api.ui.react).toThrow('no UI host');
        expect(() => api.ui.components).toThrow('no UI host');
    });

    test('react and components come from the host', () => {
        const React = { createElement: jest.fn() };
        const Button = () => null;
        setPluginHostPort({ ...original, getUiKit: () => ({ React, components: { Button } }) });
        const api = new PluginApiImpl({} as never, 'test/ui');
        expect(api.ui.react).toBe(React);
        expect(api.ui.components.Button).toBe(Button);
    });

    test('a persistent popup passes its settings fields and reads its own settings', async () => {
        const registered: PluginPopupConfig[] = [];
        const settings = new Map<string, unknown>();
        const listeners = new Map<string, (v: unknown) => void>();
        const port: PluginHostPort = {
            ...original,
            registerPluginPopup: (config) => { registered.push(config); },
            getWindowSetting: (id, key, def) => (settings.has(`${id}/${key}`) ? settings.get(`${id}/${key}`) : def) as never,
            setWindowSetting: (id, key, value) => {
                settings.set(`${id}/${key}`, value);
                listeners.get(`${id}/${key}`)?.(value);
            },
            subscribeToWindowSetting: (id, key, listener) => {
                listeners.set(`${id}/${key}`, listener);
                return () => listeners.delete(`${id}/${key}`);
            },
        };
        setPluginHostPort(port);

        const fields = [{ type: 'toggle' as const, key: 'altH', label: 'Alt+H szuka', default: true }];
        const api = new PluginApiImpl({} as never, 'zielarz');
        const popup = await api.ui.registerPersistentPopup({
            id: 'main', title: 'Zielarz', createContent: () => 'x', settingsFields: fields,
        });

        expect(registered[0].settingsFields).toBe(fields);
        expect(popup.getSetting('tab', 'szukanie')).toBe('szukanie');

        const changes: unknown[] = [];
        popup.onSettingChange('tab', v => changes.push(v));
        popup.setSetting('tab', 'trasy');
        expect(popup.getSetting('tab', 'szukanie')).toBe('trasy');
        expect(settings.get('popup:plugin:zielarz:main/tab')).toBe('trasy');
        expect(changes).toEqual(['trasy']);

        api.cleanup();
        expect(listeners.size).toBe(0);
    });
});
