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
});
