import { vi } from 'vitest';
import {
    __setCrowdSnapshotForTests,
    getCrowdSnapshot,
    refreshCrowdSnapshot,
} from '@modules/crowd/crowdSnapshot';

vi.mock('@modules/core/settings', () => ({
    getBehaviorSettings: vi.fn(() => ({ crowdContribute: true })),
    onBehaviorSettingsChange: vi.fn(() => () => {}),
}));

const SNAPSHOT = {
    generatedAt: '2026-10-22T20:17:00.000Z',
    bronie: [{ short: 'dlugi miecz', confirmations: 2 }],
    zbroje: [],
    odmiany: [],
};

function respond(status: number, body: unknown) {
    return { ok: status < 400, status, json: async () => body } as unknown as Response;
}

beforeEach(() => {
    __setCrowdSnapshotForTests(null);
});

afterEach(() => {
    vi.unstubAllGlobals();
});

test('downloads the merged list, filling groups the Worker left out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(200, SNAPSHOT)));
    await refreshCrowdSnapshot();
    expect(getCrowdSnapshot()).toMatchObject({ bronie: [{ short: 'dlugi miecz' }], tarcze: [] });
    // The browser revalidates its own copy: a hand-set If-None-Match would need a preflight
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(init).toEqual({ cache: 'no-cache' });
});

test('keeps what it has when the Worker cannot be reached', async () => {
    __setCrowdSnapshotForTests({ ...SNAPSHOT, tarcze: [] } as never);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await refreshCrowdSnapshot();
    expect(getCrowdSnapshot()?.bronie).toHaveLength(1);

    vi.stubGlobal('fetch', vi.fn(async () => respond(503, {})));
    await refreshCrowdSnapshot();
    expect(getCrowdSnapshot()?.bronie).toHaveLength(1);
});

test('drops an evaluated name that is another item, as a stray evaluation left it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(200, {
        ...SNAPSHOT,
        tarcze: [
            { short: 'owalna duza pawez', shortAlt: 'krwistoczerwony poszarpany plaszcz', confirmations: 2 },
            { short: 'lsniaca plomienista tarcza', shortAlt: 'lsniaca plomienista tarcze', confirmations: 4 },
        ],
    })));
    await refreshCrowdSnapshot();
    const [pawez, tarcza] = getCrowdSnapshot()!.tarcze;
    expect(pawez).not.toHaveProperty('shortAlt');
    expect(tarcza!.shortAlt).toBe('lsniaca plomienista tarcze');
});
