const setDoc = vi.fn((..._args: unknown[]) => Promise.resolve());
const getDoc = vi.fn((..._args: unknown[]) => Promise.resolve({ data: () => registry }));
let registry: Record<string, unknown> | undefined;
let currentUser: { uid: string } | null = { uid: 'user-1' };

vi.mock('firebase/firestore', () => ({
    doc: (_db: unknown, ...path: string[]) => path.join('/'),
    setDoc: (...args: unknown[]) => setDoc(...args),
    getDoc: (...args: unknown[]) => getDoc(...args),
    updateDoc: vi.fn(),
    deleteField: vi.fn(),
}));
vi.mock('@modules/firebase/firebaseConfig', () => ({
    ensureFirebaseInitialized: () => Promise.resolve({ db: {} }),
    getFirebaseAuth: () => ({ currentUser }),
}));

import { getDeviceInfo, getSyncGroup, setSyncGroup } from '@modules/device';
import { getRegisteredDevices, registerDevice, updateLocalSyncGroup } from '@modules/firebase/firebaseUnifiedSync';

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

describe('device registry', () => {
    beforeEach(() => {
        localStorage.clear();
        setDoc.mockClear();
        getDoc.mockClear();
        currentUser = { uid: 'user-1' };
    });

    it('registers once per session in its own document, without reading first', async () => {
        await registerDevice();
        await registerDevice();

        expect(setDoc).toHaveBeenCalledTimes(1);
        expect(getDoc).not.toHaveBeenCalled();
        const [ref, data, options] = setDoc.mock.calls[0] as [string, { devices: Record<string, { id: string }> }, unknown];
        expect(ref).toBe('users/user-1/syncV2/devices');
        expect(Object.keys(data.devices)).toEqual([getDeviceInfo().id]);
        expect(options).toEqual({ merge: true });

        await registerDevice({ force: true });
        expect(setDoc).toHaveBeenCalledTimes(2);

        currentUser = { uid: 'user-2' };
        await registerDevice();
        expect(setDoc).toHaveBeenCalledTimes(3);
    });

    it('lists the devices of the registry', async () => {
        registry = { devices: { a: { id: 'a', name: 'Chrome' }, junk: 5 } };
        expect((await getRegisteredDevices()).devices).toEqual([{ id: 'a', name: 'Chrome' }]);
        expect(getDoc.mock.calls[0][0]).toBe('users/user-1/syncV2/devices');
    });
});
