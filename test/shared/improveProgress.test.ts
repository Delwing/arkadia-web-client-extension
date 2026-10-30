import { mergeImproveSessions, mergeLifeCounts, sumLifetimeRange, type ImproveSessionData } from '@shared/improveProgress';

const entry = (state: string, time: number) => ({ state, time, delta: 1, killsMy: 0, killsTeam: 0 });

describe('mergeImproveSessions', () => {
    const a: ImproveSessionData = {
        entries: [entry('nieznaczne', 100), entry('bardzo male', 200)],
        lastTime: 200, lastKills: { my: 2, team: 0 }, level: 2, obj: 7, since: 50,
    };
    const b: ImproveSessionData = {
        entries: [entry('bardzo male', 250), entry('male', 300)],
        lastTime: 300, lastKills: { my: 5, team: 1 }, level: 3, obj: 7, since: 90,
    };

    it('unites the entries of the same life, the earlier record of a level winning', () => {
        const merged = mergeImproveSessions(a, b);
        expect(merged.entries).toEqual([entry('nieznaczne', 100), entry('bardzo male', 200), entry('male', 300)]);
        expect(merged).toMatchObject({ lastTime: 300, lastKills: { my: 5, team: 1 }, level: 3, obj: 7, since: 50 });
    });

    it('is commutative and idempotent', () => {
        const ab = mergeImproveSessions(a, b);
        expect(mergeImproveSessions(b, a)).toEqual(ab);
        expect(mergeImproveSessions(ab, ab)).toEqual(ab);
        expect(mergeImproveSessions(ab, b)).toEqual(ab);
    });

    it('takes the larger count of kills since the same last improvement', () => {
        const x: ImproveSessionData = { ...b, killsSince: { my: 3, team: 4 } };
        const y: ImproveSessionData = { ...b, killsSince: { my: 9, team: 1 } };
        expect(mergeImproveSessions(x, y).killsSince).toEqual({ my: 9, team: 4 });
        expect(mergeImproveSessions(y, x).killsSince).toEqual({ my: 9, team: 4 });
        // A copy from before the last improvement doesn't count toward it
        expect(mergeImproveSessions({ ...a, killsSince: { my: 50, team: 0 } }, y).killsSince).toEqual({ my: 9, team: 1 });
    });

    it('takes the newer life whole', () => {
        const next: ImproveSessionData = { entries: [], level: 0, obj: 8, since: 1_000, waitingForFirstCombat: true };
        expect(mergeImproveSessions(a, next)).toBe(next);
        expect(mergeImproveSessions(next, a)).toBe(next);
    });

    it('prefers a known life to a reset still waiting for one', () => {
        const pending: ImproveSessionData = { entries: [], level: -1, obj: null, since: 5_000 };
        expect(mergeImproveSessions(pending, a)).toBe(a);
        expect(mergeImproveSessions(a, pending)).toBe(a);
    });

    it('drops entries cleared by /postepy_reset on any device', () => {
        const cleared: ImproveSessionData = { entries: [], level: 2, obj: 7, since: 50, clearedAt: 220 };
        expect(mergeImproveSessions(cleared, b).entries).toEqual([entry('bardzo male', 250), entry('male', 300)]);
    });

    it('measures from the side that started counting when there are no entries', () => {
        const started: ImproveSessionData = { entries: [], lastTime: 400, level: 0, obj: 7, since: 1 };
        const waiting: ImproveSessionData = { entries: [], lastTime: 900, level: 0, obj: 7, since: 2, waitingForFirstCombat: true };
        expect(mergeImproveSessions(started, waiting)).toMatchObject({ lastTime: 400, waitingForFirstCombat: false });
    });

    it('measures from /postepy_reset, not from a time it cleared', () => {
        const stale: ImproveSessionData = { entries: [], lastTime: 400, level: 8, obj: 7, since: 1 };
        const reset: ImproveSessionData = { entries: [], lastTime: 900, level: 8, obj: 7, since: 1, clearedAt: 900, waitingForFirstCombat: true };
        const merged = mergeImproveSessions(stale, reset);
        expect(merged).toMatchObject({ lastTime: 900, waitingForFirstCombat: true, clearedAt: 900 });
        expect(mergeImproveSessions(reset, stale)).toEqual(merged);
    });
});

describe('mergeLifeCounts', () => {
    it('takes the higher count per field', () => {
        expect(mergeLifeCounts({ count: 3 }, { count: 2, noFormCount: 1 })).toEqual({ count: 3, noFormCount: 1 });
    });

    it('lets a newer clear win, then counts on from it', () => {
        const cleared = { count: 0, clearedAt: 500 };
        expect(mergeLifeCounts({ count: 7, noFormCount: 2 }, cleared)).toBe(cleared);
        expect(mergeLifeCounts(cleared, { count: 7 })).toBe(cleared);
        expect(mergeLifeCounts({ count: 1, clearedAt: 500 }, { count: 2, clearedAt: 500 })).toEqual({ count: 2, clearedAt: 500 });
    });
});

describe('sumLifetimeRange', () => {
    const days = [
        { date: '2026/9/30', count: 4 },
        { date: '2026/10/1', count: 2, noFormCount: 1 },
        { date: '2026/10/9', count: 0 },
        { date: '2026/10/10', count: 5 },
        { date: '2026/11/1', count: 7 },
    ];

    it('sums the days between both dates, both included', () => {
        expect(sumLifetimeRange(days, '2026-10-01', '2026-10-10')).toEqual({ count: 7, noFormCount: 1, activeDays: 2 });
    });

    it('takes the dates in either order and format', () => {
        expect(sumLifetimeRange(days, '2026/10/31', '2026-09-30')).toEqual({ count: 11, noFormCount: 1, activeDays: 3 });
    });

    it('is zero for a range without days', () => {
        expect(sumLifetimeRange(days, '2025-01-01', '2025-12-31')).toEqual({ count: 0, noFormCount: 0, activeDays: 0 });
    });
});
