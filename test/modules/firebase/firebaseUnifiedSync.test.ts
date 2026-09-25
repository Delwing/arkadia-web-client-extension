import { getDeviceInfo, getSyncGroup, setSyncGroup } from '@modules/device';
import { updateLocalSyncGroup } from '@modules/firebase/firebaseUnifiedSync';

const group = (devices: string[], name = 'Dom') => ({
    id: 'g1', name, devices, createdAt: '2026-01-01', updatedAt: '2026-01-01',
});

describe('updateLocalSyncGroup', () => {
    beforeEach(() => localStorage.clear());

    it('lets the device that created a group learn who joined it', () => {
        const self = getDeviceInfo().id;
        setSyncGroup(group([self]));

        const updated = updateLocalSyncGroup([{ ...group(['x']), id: 'g2' }, group([self, 'firefox'])]);

        expect(updated?.devices).toEqual([self, 'firefox']);
        expect(getSyncGroup()?.devices).toEqual([self, 'firefox']);
    });

    it('reports no change when the membership is the same', () => {
        const self = getDeviceInfo().id;
        setSyncGroup(group([self, 'firefox']));
        expect(updateLocalSyncGroup([group(['firefox', self], 'Nowa nazwa')])).toBeNull();
        expect(getSyncGroup()?.name).toBe('Nowa nazwa');
    });

    it('ignores other groups, and a cloud copy that no longer lists this device', () => {
        const self = getDeviceInfo().id;
        setSyncGroup(group([self]));
        expect(updateLocalSyncGroup([{ ...group([self, 'x']), id: 'g2' }])).toBeNull();
        expect(updateLocalSyncGroup([group(['x'])])).toBeNull();
        expect(getSyncGroup()?.devices).toEqual([self]);
    });

    it('does nothing outside a group', () => {
        expect(updateLocalSyncGroup([group(['x'])])).toBeNull();
        expect(getSyncGroup()).toBeNull();
    });
});
