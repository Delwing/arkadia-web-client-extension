import { formatStamp } from '@modules/userData/hlc';
import {
    canonicalJson,
    counterTotal,
    resolve,
    sameRecord,
    type MergeRule,
    type UserRecord,
} from '@modules/userData/records';

function rec(value: unknown, wall: number, device = 'a', extra: Partial<UserRecord> = {}): UserRecord {
    return {
        type: 't', scope: 'global', key: 'k', value,
        stamp: formatStamp({ wall, counter: 0, device }), origin: device, seq: wall, ...extra,
    };
}

const STATUS = ['not_started', 'in_progress', 'completed'];
const RULES: Record<string, MergeRule<any>> = {
    newest: { kind: 'newest' },
    earliest: { kind: 'earliest', time: (v: { at?: number }) => v?.at },
    union: { kind: 'union' },
    max: { kind: 'max', compare: (a: string, b: string) => STATUS.indexOf(a) - STATUS.indexOf(b) },
    counter: { kind: 'counter' },
    custom: { kind: 'custom', merge: (a: number[], b: number[]) => [...new Set([...a, ...b])].sort() },
};

const SAMPLES: Record<string, UserRecord[]> = {
    newest: [rec('x', 1), rec('y', 2, 'b'), rec(undefined, 3, 'c', { deleted: true }), rec('z', 2, 'c')],
    earliest: [rec({ at: 50 }, 3), rec({ at: 10 }, 5, 'b'), rec({}, 1, 'c'), rec({ at: 10 }, 4, 'c')],
    union: [rec('same', 1), rec('same', 2, 'b'), rec('same', 3, 'c')],
    max: [rec('in_progress', 1), rec('completed', 2, 'b'), rec('not_started', 3, 'c'), rec('completed', 4, 'c')],
    counter: [
        rec({ a: { v: { n: 2 }, s: formatStamp({ wall: 1, counter: 0, device: 'a' }) } }, 1),
        rec({ b: { v: { n: 5 }, s: formatStamp({ wall: 2, counter: 0, device: 'b' }) } }, 2, 'b'),
        rec({ a: { v: { n: 3 }, s: formatStamp({ wall: 3, counter: 0, device: 'a' }) } }, 3),
    ],
    custom: [rec([1, 2], 1), rec([2, 3], 2, 'b'), rec([4], 3, 'c')],
};

function fold(rule: MergeRule<any>, records: UserRecord[]): UserRecord {
    return records.reduce((acc, r) => resolve(rule, acc, r));
}

function permutations<T>(items: T[]): T[][] {
    if (items.length <= 1) return [items];
    return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(p => [item, ...p]));
}

describe('merge rules', () => {
    for (const [name, rule] of Object.entries(RULES)) {
        describe(name, () => {
            const samples = SAMPLES[name];

            it('is commutative', () => {
                for (const a of samples) {
                    for (const b of samples) {
                        expect(canonicalJson(resolve(rule, a, b))).toBe(canonicalJson(resolve(rule, b, a)));
                    }
                }
            });

            it('is idempotent', () => {
                for (const a of samples) {
                    expect(sameRecord(resolve(rule, a, a), a)).toBe(true);
                    const merged = fold(rule, samples);
                    expect(sameRecord(resolve(rule, merged, a), merged)).toBe(true);
                }
            });

            it('gives the same result in any arrival order', () => {
                const results = new Set(permutations(samples).map(order => canonicalJson(fold(rule, order))));
                expect(results.size).toBe(1);
            });
        });
    }

    it('newest: the latest version wins, including a deletion', () => {
        expect(fold(RULES.newest, SAMPLES.newest).deleted).toBe(true);
        expect(resolve(RULES.newest, rec('x', 1), rec('y', 2)).value).toBe('y');
    });

    it('earliest: the first observation wins by event time, not by when it was detected', () => {
        // Seen at 10 by b (detected later, at stamp 5) beats seen at 50 by a (stamp 3)
        const timed = SAMPLES.earliest.filter(r => (r.value as { at?: number }).at !== undefined);
        expect(fold(RULES.earliest, timed).value).toEqual({ at: 10 });
    });

    it('max: progress never goes back', () => {
        expect(fold(RULES.max, SAMPLES.max).value).toBe('completed');
    });

    it('never lets a tombstone beat a value outside newest', () => {
        const value = rec('completed', 1);
        const tomb = rec(undefined, 9, 'b', { deleted: true });
        expect(resolve(RULES.max, value, tomb).value).toBe('completed');
        expect(resolve(RULES.union, tomb, value).value).toBe('completed');
    });

    it('counter: keeps the newest slot per device and sums the slots', () => {
        const merged = fold(RULES.counter, SAMPLES.counter);
        expect(counterTotal(merged.value as never)).toEqual({ n: 8 });
    });

    it('custom: merges values and keeps the newest metadata', () => {
        const merged = fold(RULES.custom, SAMPLES.custom);
        expect(merged.value).toEqual([1, 2, 3, 4]);
        expect(merged.origin).toBe('c');
    });
});

describe('canonicalJson', () => {
    it('ignores object key order', () => {
        expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
    });

    it('keeps array order', () => {
        expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
    });
});
