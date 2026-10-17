import { PluginApiImpl } from '@client/PluginApi';
import { getRoomMenuEntries } from '@modules/core/pluginUiRegistry';

function fakeClient() {
    return {
        Map: {
            getRoomIdByInternalId: jest.fn((id: string) => (id === 'i385831173' ? 4120 : null)),
            getRoomDistances: jest.fn(() => new Map([[5, 3], [6, null]])),
            leadTo: jest.fn(),
            clearLeadTo: jest.fn(),
        },
        keyBindingManager: {
            registerPluginBind: jest.fn(),
            unregisterPluginBind: jest.fn(),
        },
    };
}

describe('plugin map additions', () => {
    test('look up rooms, distances and lead through the map', () => {
        const client = fakeClient();
        const api = new PluginApiImpl(client as never, 'zielarz');

        expect(api.map.getRoomIdByInternalId('i385831173')).toBe(4120);
        expect(api.map.getRoomIdByInternalId('nope')).toBeNull();
        expect(api.map.getRoomDistances(1, [5, 6])).toEqual(new Map([[5, 3], [6, null]]));
        expect(client.Map.getRoomDistances).toHaveBeenCalledWith(1, [5, 6]);

        api.map.leadTo(4120);
        api.map.clearLeadTo();
        expect(client.Map.leadTo).toHaveBeenCalledWith(4120);
        expect(client.Map.clearLeadTo).toHaveBeenCalled();
    });

    test('room menu entries can change and go when the plugin unloads', () => {
        const api = new PluginApiImpl(fakeClient() as never, 'zielarz');
        const first = jest.fn();
        const second = jest.fn();
        const entry = api.map.addRoomMenuEntry('Teren', first);
        api.map.addRoomMenuEntry('Inne', jest.fn());

        entry.setLabel('Zielarz: teren');
        entry.setAction(second);
        const [registered] = getRoomMenuEntries();
        expect(registered.label).toBe('Zielarz: teren');
        registered.action(9);
        expect(second).toHaveBeenCalledWith(9);
        expect(first).not.toHaveBeenCalled();

        entry.remove();
        expect(getRoomMenuEntries().map(e => e.label)).toEqual(['Inne']);
        api.cleanup();
        expect(getRoomMenuEntries()).toEqual([]);
    });
});

describe('plugin keys', () => {
    test('register through the key manager and unregister on remove and unload', () => {
        const client = fakeClient();
        const api = new PluginApiImpl(client as never, 'zielarz');
        const callback = jest.fn();

        const handle = api.keys.register({ key: 'h', alt: true }, callback);
        api.keys.register({ key: 'F6' }, jest.fn());
        const [[firstId, bind, cb]] = client.keyBindingManager.registerPluginBind.mock.calls as unknown as [string, unknown, unknown][];
        expect(bind).toEqual({ key: 'h', alt: true });
        expect(cb).toBe(callback);

        handle.remove();
        expect(client.keyBindingManager.unregisterPluginBind).toHaveBeenCalledWith(firstId);

        api.cleanup();
        expect(client.keyBindingManager.unregisterPluginBind).toHaveBeenCalledTimes(2);
    });
});
