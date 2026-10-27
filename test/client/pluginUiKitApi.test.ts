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

        const fields = [{ type: 'toggle' as const, key: 'ceny', label: 'Pokazuj ceny', default: true }];
        const api = new PluginApiImpl({} as never, 'jubiler');
        const popup = await api.ui.registerPersistentPopup({
            id: 'main', title: 'Jubiler', createContent: () => 'x', settingsFields: fields,
        });

        expect(registered[0].settingsFields).toBe(fields);
        expect(popup.getSetting('tab', 'szukanie')).toBe('szukanie');

        const changes: unknown[] = [];
        popup.onSettingChange('tab', v => changes.push(v));
        popup.setSetting('tab', 'lista');
        expect(popup.getSetting('tab', 'szukanie')).toBe('lista');
        expect(settings.get('popup:plugin:jubiler:main/tab')).toBe('lista');
        expect(changes).toEqual(['lista']);

        api.cleanup();
        expect(listeners.size).toBe(0);
    });

    test('a persistent popup can replace its settings fields later', async () => {
        const updates: { id: string; changes: Partial<PluginPopupConfig> }[] = [];
        setPluginHostPort({
            ...original,
            registerPluginPopup: () => {},
            updatePluginPopup: (id, changes) => { updates.push({ id, changes }); },
        });

        const api = new PluginApiImpl({} as never, 'jubiler');
        const popup = await api.ui.registerPersistentPopup({ id: 'main', title: 'Jubiler', createContent: () => 'x' });
        const fields = [{ type: 'toggle' as const, key: 'kanal:1', label: '#ogolny', default: true }];
        popup.setSettingsFields(fields);

        expect(updates).toEqual([{ id: 'popup:plugin:jubiler:main', changes: { settingsFields: fields } }]);
    });
});
