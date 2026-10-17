import { PluginApiImpl } from '@client/PluginApi';
import { getRoomMenuEntries } from '@modules/core/pluginUiRegistry';
import { getPluginKeyActions } from '@modules/core/pluginKeyRegistry';
import { globalStorage } from '@modules/core/storage';

function fakeClient() {
    return {
        Map: {
            getRoomIdByInternalId: jest.fn((id: string) => (id === 'i385831173' ? 4120 : null)),
            getRoomDistances: jest.fn(() => new Map([[5, 3], [6, null]])),
            leadTo: jest.fn(),
            clearLeadTo: jest.fn(),
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
    beforeEach(() => localStorage.clear());

    test('registers a named action with its normalised default key, listed under the plugin name', () => {
        const api = new PluginApiImpl(fakeClient() as never, 'https://example.com/zielarz.js');
        const onPress = jest.fn();
        const handle = api.keys.register({ id: 'zielarz.searchHere', label: 'Szukaj ziół tutaj', defaultKey: { key: 'h', alt: true }, onPress });

        const [action] = getPluginKeyActions();
        expect(action).toMatchObject({ id: 'zielarz.searchHere', label: 'Szukaj ziół tutaj', defaultBind: { key: 'KeyH', alt: true } });
        expect(handle!.getKey()).toEqual({ key: 'KeyH', ctrl: false, alt: true, shift: false });

        api.setPluginName('Zielarz');
        expect(getPluginKeyActions()[0].pluginName).toBe('Zielarz');

        globalStorage.set('binds', { pluginKeys: { 'zielarz.searchHere': { key: 'F7' } } } as never);
        expect(handle!.getKey()).toEqual({ key: 'F7', ctrl: false, alt: false, shift: false });
        globalStorage.set('binds', { pluginKeys: { 'zielarz.searchHere': { key: '' } } } as never);
        expect(handle!.getKey()).toBeNull();

        api.cleanup();
        expect(getPluginKeyActions()).toEqual([]);
    });

    test('another plugin cannot take an id, the owner can replace its own', () => {
        const zielarz = new PluginApiImpl(fakeClient() as never, 'zielarz');
        const other = new PluginApiImpl(fakeClient() as never, 'other');
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const first = zielarz.keys.register({ id: 'zielarz.searchHere', label: 'a', onPress: jest.fn() });
        expect(other.keys.register({ id: 'zielarz.searchHere', label: 'b', onPress: jest.fn() })).toBeNull();
        zielarz.keys.register({ id: 'zielarz.searchHere', label: 'c', onPress: jest.fn() });
        expect(getPluginKeyActions().map(a => a.label)).toEqual(['c']);

        // The replaced handle no longer removes the newer registration
        first!.remove();
        expect(getPluginKeyActions()).toHaveLength(1);

        warn.mockRestore();
        zielarz.cleanup();
        expect(getPluginKeyActions()).toEqual([]);
    });
});
