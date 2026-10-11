import { formatStamp } from '@modules/userData/hlc';
import type { UserRecord } from '@modules/userData/records';
import { compactRecords, decodeRecords, encodeRecords, foldRecords, TOMBSTONE_HORIZON_MS } from '@modules/syncV2/fold';

const stamp = (wall: number, device = 'a') => formatStamp({ wall, counter: 0, device });

function rec(type: string, key: string, value: unknown, wall: number, extra: Partial<UserRecord> = {}): UserRecord {
    return { type, scope: 'char:Alice', key, value, stamp: stamp(wall), origin: 'a', seq: wall, ...extra };
}

describe('foldRecords', () => {
    it('merges by each type\'s rule and keeps the newest record of unknown types', () => {
        const rules = new Map([['levels', { kind: 'earliest' as const, time: (v: { t: number }) => v.t }]]);
        const base = [rec('levels', 'x', { t: 100 }, 1), rec('future', 'y', 'old', 1)];
        const merged = foldRecords(base, [rec('levels', 'x', { t: 50 }, 9), rec('future', 'y', 'new', 9)], rules);

        expect(merged.find(r => r.type === 'levels')?.value).toEqual({ t: 50 });
        expect(merged.find(r => r.type === 'future')?.value).toBe('new');
    });
});

describe('compactRecords', () => {
    it('drops ticks at or before the latest level change of their category', () => {
        const records = [
            rec('knowledgeLevels', 'level/zwierzeta/srednia', { timestamp: 500 }, 1),
            rec('knowledgeTicks', 'tick/zwierzeta/400', {}, 1),
            rec('knowledgeTicks', 'tick/zwierzeta/500', {}, 1),
            rec('knowledgeTicks', 'tick/zwierzeta/600', {}, 1),
            rec('knowledgeTicks', 'tick/rosliny/400', {}, 1),
            rec('knowledgeTicks', 'tick/zwierzeta/300', {}, 1, { scope: 'char:Bob' }),
        ];

        const kept = compactRecords(records, 1_000).map(r => `${r.scope}/${r.key}`);

        expect(kept).toEqual([
            'char:Alice/level/zwierzeta/srednia',
            'char:Alice/tick/zwierzeta/600',
            'char:Alice/tick/rosliny/400',
            'char:Bob/tick/zwierzeta/300',
        ]);
    });

    it('drops tombstones older than the horizon', () => {
        const now = 200 * 24 * 60 * 60 * 1000;
        const records = [
            rec('aliases', 'old', undefined, now - TOMBSTONE_HORIZON_MS - 1, { deleted: true }),
            rec('aliases', 'recent', undefined, now - 1_000, { deleted: true }),
            rec('aliases', 'alive', 'x', 1),
        ];
        expect(compactRecords(records, now).map(r => r.key)).toEqual(['recent', 'alive']);
    });
});

describe('encodeRecords / decodeRecords', () => {
    const records = [rec('aliases', 'k', 'kondycja', 1)];

    it('round-trips plain records', async () => {
        const encoded = await encodeRecords(records, null);
        expect(encoded.encrypted).toBe(false);
        expect(await decodeRecords(encoded.data, false, null)).toEqual(records);
    });

    it('encrypts with a passphrase and refuses to decode without the right one', async () => {
        const encoded = await encodeRecords(records, 'secret');
        expect(encoded.encrypted).toBe(true);
        expect(encoded.data).not.toContain('kondycja');
        expect(await decodeRecords(encoded.data, true, 'secret')).toEqual(records);
        await expect(decodeRecords(encoded.data, true, null)).rejects.toThrow();
        await expect(decodeRecords(encoded.data, true, 'wrong')).rejects.toThrow();
    });

    it('round-trips compressed records, plain and encrypted', async () => {
        const polish = [rec('aliases', 'k', 'zażółć gęślą jaźń', 1)];
        const plain = await encodeRecords(polish, null, { compress: true });
        expect(plain).toMatchObject({ encrypted: false, compressed: true });
        expect(plain.data).not.toContain('aliases');
        expect(await decodeRecords(plain.data, false, null, true)).toEqual(polish);

        const secret = await encodeRecords(polish, 'secret', { compress: true });
        expect(secret).toMatchObject({ encrypted: true, compressed: true });
        expect(await decodeRecords(secret.data, true, 'secret', true)).toEqual(polish);
    });

    it('shrinks a base of many visited rooms far below the Firestore commit limit', async () => {
        const rooms: UserRecord[] = [];
        for (const character of ['Alice', 'Bob', 'Carol']) {
            for (let room = 1; room <= 25_000; room += 1) {
                rooms.push({
                    type: 'visitedRooms', scope: `char:${character}`, key: String(room), value: true,
                    stamp: stamp(1_700_000_000_000 + room, '6f1c2a9e-0b7d-4c3e-9a51-2d8e7f4b1c60'),
                    origin: '6f1c2a9e-0b7d-4c3e-9a51-2d8e7f4b1c60', seq: room,
                });
            }
        }
        const raw = JSON.stringify(rooms).length;
        const encoded = await encodeRecords(rooms, 'secret', { compress: true });

        expect(raw).toBeGreaterThan(11 * 1024 * 1024);
        expect(encoded.data.length).toBeLessThan(raw / 5);
        expect(await decodeRecords(encoded.data, true, 'secret', true)).toHaveLength(rooms.length);
    });
});
