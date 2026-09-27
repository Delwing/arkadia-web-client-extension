import { mergeImproveSessions, mergeLifeCounts, type ImproveSessionData } from '@shared/improveProgress';

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
});

describe('mergeLifeCounts', () => {
    it('takes the higher count per field', () => {
        expect(mergeLifeCounts({ count: 3 }, { count: 2, noFormCount: 1 })).toEqual({ count: 3, noFormCount: 1 });
    });
});
