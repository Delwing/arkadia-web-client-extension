import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import initKillTracker, { isBodiless, UNCLAIMED_REMOVAL_MS } from '@client/killTracker';

const ME = 2966786;

function makeClient() {
    const handlers = new Map<string, ((payload?: any) => void)[]>();
    const emitted: { event: string; payload?: any }[] = [];
    let enemies = new Set<number>();
    const client: any = {
        aliases: [],
        on: (event: string, cb: (payload?: any) => void) => {
            handlers.set(event, [...(handlers.get(event) ?? []), cb]);
        },
        emit: (event: string, payload?: any) => {
            emitted.push({ event, payload });
            handlers.get(event)?.forEach(cb => cb(payload));
        },
        ObjectManager: {
            hasEnemiesOnLocation: () => enemies.size > 0,
            getObjectsOnLocation: () => [...enemies].map(num => ({ num, __category: 'rest' })),
        },
        TeamManager: { getAccumulatedObjectsData: () => new Map([[10, { desc: 'snotling' }], [11, { desc: 'snotling' }]]) },
    };
    initKillTracker(client);
    const t = {
        client,
        nums(nums: number[]) {
            enemies = new Set([...enemies].filter(id => nums.includes(id)));
            client.emit('parsedNums', { nums });
        },
        // ObjectManager handles objects.data first and emits parsedObjects from it.
        data(enemyIds: number[], canSee?: boolean) {
            enemies = new Set(enemyIds);
            client.emit('parsedObjects');
            client.emit('gmcp.objects.data', canSee === undefined ? {} : { [ME]: { can_see_in_room: canSee } });
        },
        // In light the server sends objects.nums and objects.data back to back.
        setNums(nums: number[], enemyIds: number[]) {
            t.nums(nums);
            t.data(enemyIds);
        },
        count: (event: string) => emitted.filter(e => e.event === event).length,
        kills: () => emitted.filter(e => e.event === 'enemyKilled').map(e => [e.payload.objNum, e.payload.killer]),
    };
    return t;
}

describe('initKillTracker', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('fires allEnemiesKilled once the last enemy dies when the kill line comes first', () => {
        const t = makeClient();
        t.setNums([ME, 10, 11], [10, 11]);
        t.client.emit('kill', { killer: 'ME' });
        t.setNums([ME, 11], [11]);
        expect(t.count('enemyKilled')).toBe(1);
        expect(t.count('allEnemiesKilled')).toBe(0);
        t.client.emit('kill', { killer: 'ME' });
        t.setNums([ME], []);
        expect(t.count('enemyKilled')).toBe(2);
        expect(t.count('allEnemiesKilled')).toBe(1);
    });

    it('waits for the kill line when objects.nums drops the last enemy first', () => {
        const t = makeClient();
        t.setNums([ME, 10, 11], [10, 11]);
        t.client.emit('kill', { killer: 'ME' });
        t.setNums([ME, 11], [11]);

        t.setNums([ME], []);
        expect(t.count('allEnemiesKilled')).toBe(0);

        t.client.emit('kill', { killer: 'TEAM' });
        expect(t.count('enemyKilled')).toBe(2);
        expect(t.count('allEnemiesKilled')).toBe(1);
    });

    it('does not pin a later removal on a kill line that already claimed its body', () => {
        const t = makeClient();
        t.setNums([ME, 10, 11, 20], [10, 11]);
        t.client.emit('kill', { killer: 'ME' });
        t.setNums([ME, 11, 20], [11]);
        t.setNums([ME, 20], []);
        t.client.emit('kill', { killer: 'ME' });
        // Someone walks out afterwards - not a kill.
        t.setNums([ME], []);
        vi.advanceTimersByTime(UNCLAIMED_REMOVAL_MS);
        expect(t.count('enemyKilled')).toBe(2);
    });

    it('forgets an unclaimed removal once the wait runs out', () => {
        const t = makeClient();
        t.setNums([ME, 10, 11], [10, 11]);
        t.client.emit('kill', { killer: 'ME' });
        t.setNums([ME, 11], [11]);
        // The last one flees - no kill line follows.
        t.setNums([ME], []);
        vi.advanceTimersByTime(UNCLAIMED_REMOVAL_MS);
        t.client.emit('kill', { killer: 'OTHER' });
        expect(t.count('enemyKilled')).toBe(1);
    });

    it('does not pin a kill line with no removal on whoever leaves later', () => {
        const t = makeClient();
        t.setNums([ME, 10, 20], [10]);
        t.client.emit('kill', { killer: 'ME' });
        vi.advanceTimersByTime(UNCLAIMED_REMOVAL_MS);
        t.setNums([ME, 10], [10]);
        expect(t.count('enemyKilled')).toBe(0);
    });

    // Replays a recorded fight: three snotlings, the light put out twice, one of
    // them killed in the dark ("Ktos umarl." followed by "Zabiles kogos.").
    it('credits a kill made in the dark once the light is back', () => {
        const t = makeClient();
        t.setNums([ME, 9, 10, 11], [9, 10, 11]);
        t.client.emit('kill', { killer: 'ME' });
        t.setNums([ME, 10, 11], [10, 11]);

        // zgas lampe - nums empties first, then objects.data says we are blind.
        t.nums([ME]);
        t.data([], false);
        // zapal lampe - everyone is back, then objects.data says we can see.
        t.nums([ME, 10, 11]);
        t.data([10, 11], true);
        expect(t.count('enemyKilled')).toBe(1);
        expect(t.count('allEnemiesKilled')).toBe(0);

        t.nums([ME]);
        t.data([], false);
        vi.advanceTimersByTime(UNCLAIMED_REMOVAL_MS * 5);
        t.client.emit('kill', { killer: 'ME' });
        t.nums([ME, 11]);
        t.data([11], true);
        expect(t.kills()).toEqual([[9, 'ME'], [10, 'ME']]);
        expect(t.count('allEnemiesKilled')).toBe(0);

        t.client.emit('kill', { killer: 'ME' });
        t.setNums([ME], []);
        expect(t.kills()).toEqual([[9, 'ME'], [10, 'ME'], [11, 'ME']]);
        expect(t.count('allEnemiesKilled')).toBe(1);
    });

    it('fires allEnemiesKilled on relighting when the last enemy died in the dark', () => {
        const t = makeClient();
        t.setNums([ME, 10], [10]);
        t.nums([ME]);
        t.data([], false);
        t.client.emit('kill', { killer: 'ME' });
        expect(t.count('allEnemiesKilled')).toBe(0);
        t.nums([ME]);
        t.data([], true);
        expect(t.kills()).toEqual([[10, 'ME']]);
        expect(t.count('allEnemiesKilled')).toBe(1);
    });

    it('never takes a teammate who left in the dark for the body', () => {
        const t = makeClient();
        t.setNums([ME, 10, 20], [10]);
        t.nums([ME]);
        t.data([], false);
        t.client.emit('kill', { killer: 'ME' });
        t.nums([ME]);
        t.data([], true);
        expect(t.kills()).toEqual([[10, 'ME']]);
    });

    it('does not count darkness alone as the room being cleared', () => {
        const t = makeClient();
        t.setNums([ME, 10, 11], [10, 11]);
        t.client.emit('kill', { killer: 'ME' });
        t.setNums([ME, 11], [11]);
        t.nums([ME]);
        t.data([], false);
        vi.advanceTimersByTime(UNCLAIMED_REMOVAL_MS);
        expect(t.count('allEnemiesKilled')).toBe(0);
    });
});

describe('isBodiless', () => {
    it('sees the type past the adjectives in front of it', () => {
        expect(isBodiless('wielki ognisty zywiolak ognia')).toBe(true);
        expect(isBodiless('potezny kamienny zywiolak ziemi')).toBe(true);
        expect(isBodiless('blady przezroczysty duch')).toBe(true);
    });

    it('still matches a bare type', () => {
        expect(isBodiless('zywiolak wody')).toBe(true);
        expect(isBodiless('zjawa')).toBe(true);
    });

    it('matches whole words only', () => {
        expect(isBodiless('ogromny szary troll')).toBe(false);
        expect(isBodiless('duchowny')).toBe(false);
    });
});
