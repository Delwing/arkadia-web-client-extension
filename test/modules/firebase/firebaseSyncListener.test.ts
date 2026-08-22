// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://arkadia.example/"}

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@modules/firebase/firebaseConfig', () => ({
    ensureFirebaseInitialized: vi.fn(async () => ({ db: {} })),
}));

vi.mock('@modules/firebase/firebaseUnifiedSync', () => ({
    updateCache: vi.fn(),
    recordCategorySyncState: vi.fn(),
}));

let snapshotHandler: ((snapshot: { exists: () => boolean; data: () => unknown }) => void) | null = null;

vi.mock('firebase/firestore', () => ({
    doc: vi.fn(() => ({})),
    onSnapshot: vi.fn((_ref: unknown, onNext: (s: { exists: () => boolean; data: () => unknown }) => void) => {
        snapshotHandler = onNext;
        return () => { snapshotHandler = null; };
    }),
}));

import { syncListener } from '@modules/firebase/firebaseSyncListener';
import eventBus from '@modules/core/eventBus';

function pushSnapshot(data: unknown) {
    if (!snapshotHandler) throw new Error('listener did not subscribe');
    snapshotHandler({ exists: () => data !== null, data: () => data });
}

const cloudSnapshot = {
    categories: {
        triggers: {
            data: '[]',
            checksum: 'abc',
            syncedAt: '2026-08-22T10:00:00.000Z',
            deviceId: 'device-1',
            encrypted: false,
        },
    },
};

describe('FirebaseSyncListener metadata replay', () => {
    beforeEach(() => {
        syncListener.stop();
        snapshotHandler = null;
    });

    it('has no metadata before the first snapshot', async () => {
        expect(syncListener.getLastMetadata()).toBeNull();
    });

    it('keeps the last snapshot metadata so a UI mounting later can read it', async () => {
        await syncListener.start('user-1');

        const emitted: unknown[] = [];
        const unsub = eventBus.on('firebase.sync.metadata', (m) => { emitted.push(m); });

        pushSnapshot(cloudSnapshot);
        await vi.waitFor(() => expect(emitted).toHaveLength(1));
        unsub();

        // The event fired once, while the options dialog was closed. A tab
        // mounting afterwards must still see that the cloud holds data —
        // otherwise the cloud markers and the "delete cloud data" section
        // stay hidden until the next sync.
        expect(syncListener.getLastMetadata()).toEqual(emitted[0]);
        expect(syncListener.getLastMetadata()?.triggers?.exists).toBe(true);
    });

    it('drops the cached metadata when the listener stops', async () => {
        await syncListener.start('user-1');
        pushSnapshot(cloudSnapshot);
        await vi.waitFor(() => expect(syncListener.getLastMetadata()).not.toBeNull());

        syncListener.stop();
        expect(syncListener.getLastMetadata()).toBeNull();
    });
});
