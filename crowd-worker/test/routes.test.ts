import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../src/index';
import { canonicalize, hashRecord } from '../src/records';
import type { Env } from '../src/types';
import { createFakeD1 } from './fakeD1';
import { createFakeKV } from './fakeKV';

const ORIGIN = 'https://delwing.github.io';

let env: Env & { DB: ReturnType<typeof createFakeD1>; SNAPSHOTS: ReturnType<typeof createFakeKV> };

beforeEach(() => {
    env = { DB: createFakeD1(), SNAPSHOTS: createFakeKV(), ALLOWED_ORIGINS: ORIGIN, MAX_CONFIRMATIONS: '3' };
});

function post(path: string, body: unknown, auth?: string, ip = '10.0.0.1'): Promise<Response> {
    const headers: Record<string, string> = {
        origin: ORIGIN,
        'content-type': 'application/json',
        'cf-connecting-ip': ip,
    };
    if (auth) headers.authorization = auth;
    return worker.fetch(
        new Request(`https://crowd.test${path}`, { method: 'POST', headers, body: JSON.stringify(body) }),
        env,
    );
}

async function register(ip?: string): Promise<string> {
    const response = await post('/crowd/register', {}, undefined, ip);
    expect(response.status).toBe(200);
    const { contributorId, secret } = (await response.json()) as { contributorId: string; secret: string };
    return `Bearer ${contributorId}.${secret}`;
}

/** What a reader gets after the next cron run. */
async function snapshot(): Promise<Record<string, Record<string, unknown>[]>> {
    await worker.scheduled(null, env);
    const response = await worker.fetch(new Request('https://crowd.test/crowd/snapshot'), env);
    expect(response.status).toBe(200);
    return (await response.json()) as Record<string, Record<string, unknown>[]>;
}

function plecak(dopelniacz = 'zamknietego skorzanego plecaka') {
    return {
        mianownik: 'zamkniety skorzany plecak',
        dopelniacz,
        celownik: 'zamknietemu skorzanemu plecakowi',
        biernik: 'zamkniety skorzany plecak',
        narzednik: 'zamknietym skorzanym plecakiem',
        miejscownik: 'zamknietym skorzanym plecaku',
    };
}

async function hashOf(record: ReturnType<typeof plecak>): Promise<string> {
    const result = canonicalize('odmiana', record);
    if (!result.ok) throw new Error(result.reason);
    return hashRecord(result.record);
}

describe('register', () => {
    it('stores only a hash of the secret', async () => {
        const auth = await register();
        const secret = auth.split('.')[1]!;
        const row = env.DB.raw.prepare('SELECT secret_hash FROM contributors').get() as { secret_hash: string };
        expect(row.secret_hash).not.toContain(secret);
    });

    it('limits registrations per IP per day', async () => {
        for (let i = 0; i < 5; i++) await register('10.0.0.9');
        const response = await post('/crowd/register', {}, undefined, '10.0.0.9');
        expect(response.status).toBe(429);
        expect((await post('/crowd/register', {}, undefined, '10.0.0.10')).status).toBe(200);
    });

    it('refuses a foreign origin', async () => {
        const response = await worker.fetch(
            new Request('https://crowd.test/crowd/register', {
                method: 'POST',
                headers: { origin: 'https://evil.example' },
                body: '{}',
            }),
            env,
        );
        expect(response.status).toBe(403);
    });
});

describe('have and submit', () => {
    it('needs a valid credential', async () => {
        const auth = await register();
        expect((await post('/crowd/have', { hashes: [] })).status).toBe(401);
        expect((await post('/crowd/have', { hashes: [] }, `${auth}x`)).status).toBe(401);
    });

    it('wants a record until this contributor has sent it', async () => {
        const auth = await register();
        const hash = await hashOf(plecak());

        let response = await post('/crowd/have', { hashes: [hash] }, auth);
        expect(await response.json()).toEqual({ wanted: [hash] });

        response = await post('/crowd/submit', { items: [{ kind: 'odmiana', record: plecak() }] }, auth);
        expect(await response.json()).toEqual({ accepted: 1, rejected: [] });

        response = await post('/crowd/have', { hashes: [hash] }, auth);
        expect(await response.json()).toEqual({ wanted: [] });
    });

    it('stops wanting a record once it has enough confirmations', async () => {
        const hash = await hashOf(plecak());
        for (let i = 0; i < 3; i++) {
            const auth = await register(`10.1.0.${i}`);
            await post('/crowd/submit', { items: [{ kind: 'odmiana', record: plecak() }] }, auth);
        }
        const late = await register('10.2.0.1');
        const response = await post('/crowd/have', { hashes: [hash] }, late);
        expect(await response.json()).toEqual({ wanted: [] });
        const rows = env.DB.raw.prepare('SELECT COUNT(*) AS n FROM confirmations').get() as { n: number };
        expect(rows.n).toBe(3);
    });

    it('reports what it rejected, by index', async () => {
        const auth = await register();
        const response = await post('/crowd/submit', {
            items: [
                { kind: 'odmiana', record: plecak() },
                { kind: 'spell', record: {} },
                { kind: 'odmiana', record: { ...plecak(), celownik: 'plecakowi ż' } },
            ],
        }, auth);
        expect(await response.json()).toEqual({
            accepted: 1,
            rejected: [
                { index: 1, reason: 'unknown kind' },
                { index: 2, reason: 'celownik not ascii' },
            ],
        });
    });

    it('enforces the daily quota', async () => {
        env.MAX_ITEMS_PER_DAY = '1';
        const auth = await register();
        expect((await post('/crowd/submit', { items: [{ kind: 'odmiana', record: plecak() }] }, auth)).status).toBe(200);
        const second = await post('/crowd/submit', { items: [{ kind: 'odmiana', record: plecak('inny') }] }, auth);
        expect(second.status).toBe(429);
    });

    it('rejects malformed hash lists', async () => {
        const auth = await register();
        expect((await post('/crowd/have', { hashes: ['nope'] }, auth)).status).toBe(400);
    });
});

describe('snapshot', () => {
    it('serves the version most contributors agree on', async () => {
        const a = await register('10.3.0.1');
        const b = await register('10.3.0.2');
        const c = await register('10.3.0.3');
        await post('/crowd/submit', { items: [{ kind: 'odmiana', record: plecak('zly') }] }, a);
        await post('/crowd/submit', { items: [{ kind: 'odmiana', record: plecak() }] }, b);
        await post('/crowd/submit', { items: [{ kind: 'odmiana', record: plecak() }] }, c);

        const { odmiany } = await snapshot();
        expect(odmiany).toEqual([{ ...plecak(), confirmations: 2 }]);
    });

    it('drops what only a banned contributor vouched for', async () => {
        const auth = await register();
        await post('/crowd/submit', { items: [{ kind: 'odmiana', record: plecak() }] }, auth);
        env.DB.raw.exec('UPDATE contributors SET banned = 1');
        expect((await snapshot()).odmiany).toEqual([]);
    });

    it('groups zlom by kind and keeps nothing personal', async () => {
        const auth = await register();
        await post('/crowd/submit', {
            items: [{
                kind: 'tarcza',
                record: {
                    short: 'okragla tarcza', klute: 2, obuch: 2, ciete: 2, magik: 0, opis: 'Tarcza.',
                    waga: 3000, obj: 2000, cena: 100, parowanie: 4, oslona: 'lewa reka',
                    roomId: 5, color: '#fff', iLine: 'okragla tarcza',
                },
            }],
        }, auth);
        const { tarcze, bronie } = await snapshot();
        expect(bronie).toEqual([]);
        expect(tarcze).toHaveLength(1);
        expect(tarcze[0]).not.toHaveProperty('roomId');
        expect(tarcze[0]).not.toHaveProperty('color');
        expect(tarcze[0]).not.toHaveProperty('waga');
        expect(tarcze[0]!.iLine).toBe('okragla tarcza');
    });

    it('answers any origin', async () => {
        const response = await worker.fetch(
            new Request('https://crowd.test/crowd/snapshot', { headers: { origin: 'https://other.example' } }),
            env,
        );
        expect(response.headers.get('access-control-allow-origin')).toBe('*');
    });
});
