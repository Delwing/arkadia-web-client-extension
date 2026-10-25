import { vi } from 'vitest';
import { syncOnce, withdrawCrowdIgnore } from '@modules/crowd/crowdSync';
import { getBehaviorSettings } from '@modules/core/settings';
import { __resetZlomStoreForTests, updateZlomSnapshot } from '@modules/data/zlomStore';
import { __resetOdmianaStoreForTests, saveOdmiana } from '@modules/data/odmianaStore';
import { clearIndexedDB } from '@client/utils/dataCache';
import { characterStorage, globalStorage } from '@modules/core/storage';
import { adoptCrowdCredentials, loadCrowdCredentials, loadRetiredCrowdCredentials } from '@modules/crowd/crowdCredentials';

vi.mock('@modules/core/settings', () => ({
    getBehaviorSettings: vi.fn(() => ({ crowdContribute: true })),
    onBehaviorSettingsChange: vi.fn(() => () => {}),
}));

const SWORD = {
    short: 'dlugi miecz', typ: 'miecze', rodzaj: 'miecz', klute: 1, obuch: 0, ciete: 1,
    chwyt: 'jednoreczny', magik: 0 as const, srebro: 0 as const, opis: 'Dlugi stalowy miecz.',
    waga: 2000, obj: 1500, cena: 300, wywazenie: 9, parowanie: 7, roomId: 42,
    color: '#ff0000', note: 'moje',
};

const KOLCZUGA = {
    short: 'kolczuga', typ: 'tulow', klute: 5, obuch: 3, ciete: 6, magik: 0 as const,
    opis: 'Kolczuga.', waga: 9000, obj: 7000, cena: 500, oslona: 'tulow', roomId: 7,
    iLine: 'kolczuga z żelaza',
};

type Call = { path: string; body: any; auth?: string };
let calls: Call[];
let wantedFilter: (hashes: string[]) => string[];

function respond(status: number, data: unknown): Response {
    return { ok: status < 400, status, json: async () => data } as unknown as Response;
}

beforeEach(async () => {
    localStorage.clear();
    await __resetZlomStoreForTests();
    await __resetOdmianaStoreForTests();
    await clearIndexedDB({ dbName: 'ArkadiaCrowd', storeName: 'crowd', key: 'sent-3' }).catch(() => {});
    await clearIndexedDB({ dbName: 'ArkadiaCrowd', storeName: 'crowd', key: 'withdraw' }).catch(() => {});
    vi.mocked(getBehaviorSettings).mockReturnValue({ crowdContribute: true } as ReturnType<typeof getBehaviorSettings>);
    calls = [];
    wantedFilter = hashes => hashes;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
        const path = new URL(url).pathname;
        const body = JSON.parse(String(init.body));
        calls.push({ path, body, auth: (init.headers as Record<string, string>).authorization });
        if (path === '/crowd/register') return respond(200, { contributorId: 'cid', secret: 'sec' });
        if (path === '/crowd/have') return respond(200, { wanted: wantedFilter(body.hashes) });
        if (path === '/crowd/submit') return respond(200, { accepted: body.items.length, rejected: [] });
        if (path === '/crowd/merge') return respond(200, { merged: true });
        if (path === '/crowd/withdraw') return respond(200, { withdrawn: body.hashes.length });
        return respond(404, {});
    }));

    await updateZlomSnapshot(() => ({ bronie: [SWORD], tarcze: [], zbroje: [KOLCZUGA], ubrania: [], dodatki: [] }));
    await saveOdmiana({
        mianownik: 'dlugi miecz', dopelniacz: 'dlugiego miecza', celownik: 'dlugiemu mieczowi',
        biernik: 'dlugi miecz', narzednik: 'dlugim mieczem', miejscownik: 'dlugim mieczu',
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

test('hands the Worker a credential replaced by another device before syncing', async () => {
    globalStorage.set('crowdCredentials', { contributorId: 'mine', secret: 's1' });
    adoptCrowdCredentials({ contributorId: 'other', secret: 's2' });
    expect(loadCrowdCredentials()).toEqual({ contributorId: 'other', secret: 's2' });

    await syncOnce();
    expect(calls[0]).toMatchObject({ path: '/crowd/merge', body: { contributorId: 'mine', secret: 's1' }, auth: 'Bearer other.s2' });
    expect(calls.some(c => c.path === '/crowd/register')).toBe(false);
    expect(loadRetiredCrowdCredentials()).toEqual([]);
});

test('keeps a replaced credential while the Worker cannot be reached', async () => {
    globalStorage.set('crowdCredentials', { contributorId: 'mine', secret: 's1' });
    adoptCrowdCredentials({ contributorId: 'other', secret: 's2' });
    vi.mocked(fetch).mockImplementation(async () => respond(503, {}));
    await syncOnce();
    expect(loadRetiredCrowdCredentials()).toEqual([{ contributorId: 'mine', secret: 's1' }]);
});

test('does nothing until the player opts in', async () => {
    vi.mocked(getBehaviorSettings).mockReturnValue({ crowdContribute: false } as ReturnType<typeof getBehaviorSettings>);
    expect(await syncOnce()).toEqual({ status: 'off' });
    expect(calls).toEqual([]);
});

test('registers, asks, then sends only shareable fields', async () => {
    expect(await syncOnce()).toEqual({ status: 'done', sent: 3 });
    expect(calls.map(c => c.path)).toEqual(['/crowd/register', '/crowd/have', '/crowd/submit']);
    expect(calls[1]!.auth).toBe('Bearer cid.sec');

    const items = calls[2]!.body.items as { kind: string; record: Record<string, unknown> }[];
    const sword = items.find(i => i.kind === 'bron')!.record;
    for (const field of ['waga', 'obj', 'cena', 'wywazenie', 'parowanie', 'roomId', 'color', 'note']) {
        expect(sword).not.toHaveProperty(field);
    }
    // A hand-typed i line with Polish letters is dropped; the armour still goes.
    const armour = items.find(i => i.kind === 'zbroja')!.record;
    expect(armour).not.toHaveProperty('iLine');
    expect(armour.opis).toBe('Kolczuga.');
    expect(items.some(i => i.kind === 'odmiana')).toBe(true);
});

test('does not ask again about what it already sent', async () => {
    await syncOnce();
    calls = [];
    expect(await syncOnce()).toEqual({ status: 'done', sent: 0 });
    expect(calls).toEqual([]);
});

test('sends only what the Worker wants', async () => {
    wantedFilter = hashes => hashes.slice(0, 1);
    expect(await syncOnce()).toEqual({ status: 'done', sent: 1 });
});

test('stops on a refusal and retries what it did not send', async () => {
    vi.mocked(fetch).mockImplementation(async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (path === '/crowd/register') return respond(200, { contributorId: 'cid', secret: 'sec' });
        if (path === '/crowd/have') return respond(200, { wanted: JSON.parse(String(init!.body)).hashes });
        return respond(429, { status: 'rate_limited' });
    });
    expect(await syncOnce()).toEqual({ status: 'failed', reason: 'refused' });

    vi.mocked(fetch).mockClear();
    vi.mocked(fetch).mockImplementation(async (url, init) => {
        const path = new URL(String(url)).pathname;
        const body = JSON.parse(String(init!.body));
        if (path === '/crowd/have') return respond(200, { wanted: body.hashes });
        return respond(200, { accepted: body.items.length, rejected: [] });
    });
    expect(await syncOnce()).toEqual({ status: 'done', sent: 3 });
});

test('sends copies of one item worded differently once', async () => {
    await updateZlomSnapshot(() => ({
        bronie: [SWORD, { ...SWORD, opis: 'Dlugi stalowy miecz z wprawionym klejnotem.' }],
        tarcze: [],
        zbroje: [],
        ubrania: [],
        dodatki: [],
    }));
    await syncOnce();
    const sent = calls.find(c => c.path === '/crowd/submit')!.body.items as { kind: string }[];
    expect(sent.filter(item => item.kind === 'bron')).toHaveLength(1);
});

test('sends an i line and the evaluated name as records of their own', async () => {
    await updateZlomSnapshot(() => ({
        bronie: [{ ...SWORD, shortAlt: 'dlugiego miecza' }, { ...SWORD, short: 'krotki miecz', shortAlt: 'krotki miecz' }],
        tarcze: [],
        zbroje: [{ ...KOLCZUGA, iLine: 'kolczuga z zelaza' }],
        ubrania: [],
        dodatki: [],
    }));
    await syncOnce();
    const items = calls.find(c => c.path === '/crowd/submit')!.body.items as { kind: string; record: Record<string, unknown> }[];
    expect(items.find(i => i.kind === 'iline')!.record).toEqual({ item: 'zbroja', short: 'kolczuga', iLine: 'kolczuga z zelaza' });
    // A name the same as the short says nothing, so only the other goes
    expect(items.filter(i => i.kind === 'altname').map(i => i.record)).toEqual([{ item: 'bron', short: 'dlugi miecz', shortAlt: 'dlugiego miecza' }]);
    // Not part of the items themselves any more
    expect(items.find(i => i.kind === 'zbroja')!.record).not.toHaveProperty('iLine');
});

test('sends clothes and add-ons, and again what a Worker that did not know them refused', async () => {
    await updateZlomSnapshot(snapshot => ({
        ...snapshot,
        dodatki: [{
            short: 'mosiezna obroza z runa khorna', material: 'mosiadzu', opis: 'Obroza.',
            waga: 250, obj: 350, cena: 630, roomId: 7, iLine: 'Wokol szyi masz zacisnieta',
        }],
    }));
    // A Worker older than the client
    vi.mocked(fetch).mockImplementation(async (url, init) => {
        const path = new URL(String(url)).pathname;
        const body = JSON.parse(String(init!.body));
        calls.push({ path, body });
        if (path === '/crowd/register') return respond(200, { contributorId: 'cid', secret: 'sec' });
        if (path === '/crowd/have') return respond(200, { wanted: body.hashes });
        const rejected = (body.items as { kind: string; record: { item?: string } }[])
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => item.kind === 'dodatek' || item.record.item === 'dodatek')
            .map(({ index }) => ({ index, reason: 'unknown kind' }));
        return respond(200, { accepted: body.items.length - rejected.length, rejected });
    });
    await syncOnce();
    const first = calls.find(c => c.path === '/crowd/submit')!.body.items as { kind: string; record: Record<string, unknown> }[];
    expect(first.find(i => i.kind === 'dodatek')!.record).toEqual({ short: 'mosiezna obroza z runa khorna', material: 'mosiadzu', opis: 'Obroza.' });
    expect(first.find(i => i.kind === 'iline')!.record).toEqual({ item: 'dodatek', short: 'mosiezna obroza z runa khorna', iLine: 'Wokol szyi masz zacisnieta' });

    calls = [];
    await syncOnce();
    const again = calls.find(c => c.path === '/crowd/submit')!.body.items as { kind: string }[];
    expect(again.map(i => i.kind).sort()).toEqual(['dodatek', 'iline']);
});

test('sends what this character ignores in the armour window', async () => {
    characterStorage.setCharacter('Testowy');
    characterStorage.set('worn_armor', {
        slots: {}, extras: [], unplaced: [], unknownLines: [], restored: [], updatedAt: 1,
        ignored: ['Na twej piersi lsni znak gildii kupcow.'],
    });
    await syncOnce();
    const items = calls.find(c => c.path === '/crowd/submit')!.body.items as { kind: string; record: Record<string, unknown> }[];
    expect(items.find(i => i.kind === 'ignorowany')!.record).toEqual({ text: 'Na twej piersi lsni znak gildii kupcow.' });
});

test('takes back an ignore the player brought back, and votes again when it is ignored again', async () => {
    const LINE = 'Na twej piersi lsni znak gildii kupcow.';
    const armor = (ignored: string[]) => characterStorage.set('worn_armor', {
        slots: {}, extras: [], unplaced: [], unknownLines: [], restored: [], updatedAt: 1, ignored,
    });
    characterStorage.setCharacter('Testowy');
    armor([LINE]);
    await syncOnce();

    armor([]);
    await withdrawCrowdIgnore(LINE);
    calls = [];
    await syncOnce();
    const withdraw = calls.find(c => c.path === '/crowd/withdraw')!;
    expect(withdraw.body.hashes).toHaveLength(1);
    expect(withdraw.auth).toBe('Bearer cid.sec');

    // Sent once
    calls = [];
    await syncOnce();
    expect(calls.some(c => c.path === '/crowd/withdraw')).toBe(false);

    armor([LINE]);
    await syncOnce();
    const items = calls.find(c => c.path === '/crowd/submit')!.body.items as { kind: string }[];
    expect(items.map(i => i.kind)).toEqual(['ignorowany']);
});

test('does not take back an ignore set again before the pass', async () => {
    const LINE = 'Na twej piersi lsni znak gildii kupcow.';
    characterStorage.setCharacter('Testowy');
    characterStorage.set('worn_armor', {
        slots: {}, extras: [], unplaced: [], unknownLines: [], restored: [], updatedAt: 1, ignored: [LINE],
    });
    await syncOnce();
    await withdrawCrowdIgnore(LINE);
    calls = [];
    await syncOnce();
    expect(calls.some(c => c.path === '/crowd/withdraw')).toBe(false);
});
