import {SHADOW_STALE_MS, StepShadow, type ShadowReport} from '@client/map/StepShadow.ts';

vi.mock('mudlet-map-renderer', () => ({ MapReader: function () {} }));

/** A corridor 1 - 2 - 3 - 4 - 5 running north, with 2 also leading east to 20. */
const rooms: Record<number, any> = {
    1: { id: 1, exits: { north: 2 } },
    2: { id: 2, exits: { north: 3, south: 1, east: 20 } },
    3: { id: 3, exits: { north: 4, south: 2 } },
    4: { id: 4, exits: { north: 5, south: 3 } },
    5: { id: 5, exits: { south: 4 } },
    20: { id: 20, exits: { west: 2 } },
};

function setup(start = 1) {
    let mapRoom: number | undefined = start;
    let now = 0;
    const shadow = new StepShadow({
        getRoom: id => rooms[id],
        resolve: direction => direction,
        mapRoomId: () => mapRoom,
        now: () => now,
    });
    const reports: ShadowReport[] = [];
    shadow.onReport(r => reports.push(r));
    return {
        shadow,
        reports,
        setMap: (id: number | undefined) => { mapRoom = id; },
        from: () => mapRoom,
        advance: (ms: number) => { now += ms; },
        roomInfo: (gmcpRoom?: number) => shadow.roomInfo(gmcpRoom, () => {}),
    };
}

describe('StepShadow', () => {
    test('a burst of steps confirmed one by one ends where the map does', () => {
        const t = setup();
        t.setMap(2); t.shadow.step('n', 1);
        t.setMap(3); t.shadow.step('n', 2);
        t.setMap(4); t.shadow.step('n', 3);
        expect(t.shadow.shadowRoom).toBe(4);
        t.roomInfo(2);
        t.roomInfo(3);
        t.roomInfo(4);
        expect(t.shadow.confirmedRoom).toBe(4);
        expect(t.shadow.pending).toHaveLength(0);
        expect(t.reports.some(r => r.diverged)).toBe(false);
    });

    test('a blocker in the middle of a burst cancels that step, not the last one', () => {
        const t = setup();
        t.setMap(2); t.shadow.step('n', 1);
        t.setMap(3); t.shadow.step('n', 2);
        t.setMap(4); t.shadow.step('n', 3);
        t.roomInfo(2);
        // The second step is blocked. The old flag was already cleared by the room.info above,
        // so the map stays at 4 - one room ahead.
        t.shadow.reject('blokada');
        expect(t.shadow.shadowRoom).toBe(3);
        expect(t.reports.at(-1)).toMatchObject({type: 'rejected', diverged: true, shadowRoom: 3, mapRoom: 4});
        t.roomInfo(3);
        expect(t.shadow.confirmedRoom).toBe(3);
        expect(t.shadow.pending).toHaveLength(0);
    });

    test('later steps are taken again from the room the game confirmed', () => {
        const t = setup();
        // n, n, e from 1: the map plans 2, 3, then e from 3 goes nowhere.
        t.shadow.step('n', t.from());
        t.shadow.step('n', t.from());
        t.shadow.step('e', t.from());
        t.shadow.reject('blokada'); // the first n
        // Left waiting: n (1 -> 2), e (2 -> 20).
        expect(t.shadow.shadowRoom).toBe(20);
    });

    test('two blockers in one burst both count', () => {
        const t = setup();
        t.shadow.step('n', t.from());
        t.shadow.step('n', t.from());
        t.shadow.step('n', t.from());
        t.shadow.reject('blokada');
        t.shadow.reject('blokada');
        expect(t.shadow.shadowRoom).toBe(2);
        t.roomInfo(2);
        expect(t.shadow.confirmedRoom).toBe(2);
        expect(t.shadow.pending).toHaveLength(0);
    });

    test('a look in the middle of a burst answers its own room.info', () => {
        const t = setup();
        t.shadow.step('n', t.from());
        t.shadow.look();
        t.shadow.step('n', t.from());
        t.roomInfo(2);
        t.roomInfo(2);
        expect(t.reports.at(-1)).toMatchObject({type: 'look'});
        expect(t.shadow.confirmedRoom).toBe(2);
        t.roomInfo(3);
        expect(t.shadow.confirmedRoom).toBe(3);
    });

    test('a blocker skips a waiting look and cancels the step', () => {
        const t = setup();
        t.shadow.look();
        t.shadow.step('n', t.from());
        t.shadow.reject('blokada');
        expect(t.shadow.pending.map(e => e.kind)).toEqual(['look']);
    });

    test('a room whose hash GMCP cannot resolve still confirms the step from the map', () => {
        const t = setup();
        t.shadow.step('n', t.from());
        t.shadow.step('n', t.from());
        t.roomInfo(undefined);
        expect(t.shadow.confirmedRoom).toBe(2);
        t.roomInfo(undefined);
        expect(t.shadow.confirmedRoom).toBe(3);
    });

    test('GMCP naming another room than the step reaches is reported and wins', () => {
        const t = setup();
        t.shadow.step('n', t.from());
        t.roomInfo(20);
        expect(t.reports.at(-1)).toMatchObject({type: 'confirmed', gmcpDisagrees: true});
        expect(t.shadow.confirmedRoom).toBe(20);
    });

    test('a team follow starts the queue over from the map', () => {
        const t = setup();
        t.shadow.step('n', t.from());
        t.shadow.step('n', t.from());
        t.setMap(5);
        t.shadow.follow();
        expect(t.shadow.pending).toHaveLength(0);
        expect(t.shadow.confirmedRoom).toBe(5);
    });

    test('a room.info nothing waits for takes GMCP, or the map', () => {
        const t = setup();
        t.roomInfo(4);
        expect(t.reports.at(-1)).toMatchObject({type: 'unexpected'});
        expect(t.shadow.confirmedRoom).toBe(4);
        t.setMap(5);
        t.roomInfo(undefined);
        expect(t.shadow.confirmedRoom).toBe(5);
    });

    test('a placement starts over, but not the map applying a room.info', () => {
        const t = setup();
        t.shadow.step('n', t.from());
        t.shadow.placed(4);
        expect(t.shadow.pending).toHaveLength(0);
        expect(t.shadow.confirmedRoom).toBe(4);

        t.shadow.step('n', t.from());
        t.shadow.roomInfo(5, () => t.shadow.placed(5));
        expect(t.reports.filter(r => r.type === 'reset')).toHaveLength(1);
        expect(t.shadow.confirmedRoom).toBe(5);
    });

    test('steps left unanswered too long are dropped', () => {
        const t = setup();
        t.shadow.step('n', t.from());
        t.advance(SHADOW_STALE_MS + 1);
        t.setMap(3);
        t.roomInfo(3);
        expect(t.reports.some(r => r.type === 'reset' && r.source === 'stale')).toBe(true);
        expect(t.reports.at(-1)).toMatchObject({type: 'unexpected'});
        expect(t.shadow.confirmedRoom).toBe(3);
    });

    test('an entry GMCP answers out of order drops the older ones as skipped', () => {
        const t = setup();
        t.shadow.step('n', 1);
        t.shadow.look();
        // The n was refused by a line the shadow does not know; the look answers from 1.
        t.roomInfo(1);
        expect(t.reports.at(-1)).toMatchObject({type: 'look'});
        expect(t.reports.at(-1)?.skipped?.map(e => e.kind)).toEqual(['step']);
        expect(t.shadow.pending).toHaveLength(0);
        expect(t.shadow.confirmedRoom).toBe(1);
    });

    test('a step refused silently, then another direction taken from the same room', () => {
        const t = setup(2);
        t.shadow.step('n', 2);
        t.shadow.step('e', 2);
        // n refused without a known line: e is taken from 2, not from 3.
        t.roomInfo(20);
        expect(t.reports.at(-1)).toMatchObject({type: 'confirmed', entry: {direction: 'e'}});
        expect(t.reports.at(-1)?.skipped?.map(e => e.kind === 'step' && e.direction)).toEqual(['n']);
        expect(t.shadow.confirmedRoom).toBe(20);
    });

    test('a resolved room.info does not forget steps still on their way', () => {
        const t = setup();
        t.shadow.step('n', 1);
        t.shadow.step('n', 1);
        t.shadow.step('n', 1);
        t.roomInfo(2);
        // The next rooms are ones GMCP cannot place: the queue still knows what was sent.
        t.roomInfo(undefined);
        expect(t.shadow.confirmedRoom).toBe(3);
        t.roomInfo(undefined);
        expect(t.shadow.confirmedRoom).toBe(4);
    });

    test('a refusal the game also gives to typos counts only when nothing else was sent lately', () => {
        const t = setup();
        t.shadow.step('n', 1);
        t.shadow.reject('blokada', {ambiguous: true});
        expect(t.reports.at(-1)).toMatchObject({type: 'rejected'});

        // A typo after the step: "Slucham?" may be answering it.
        t.shadow.step('n', 1);
        t.shadow.other();
        t.shadow.reject('blokada', {ambiguous: true});
        expect(t.reports.at(-1)).toMatchObject({type: 'unmatched-reject', source: 'blokada, niejednoznaczne'});
        expect(t.shadow.pending).toHaveLength(1);

        // A typo before the step is just as ambiguous: its answer arrives while the step waits.
        t.advance(SHADOW_STALE_MS + 1);
        t.shadow.other();
        t.shadow.step('n', 1);
        t.shadow.reject('blokada', {ambiguous: true});
        expect(t.reports.at(-1)?.type).toBe('unmatched-reject');

        // Movement-only blockers are never ambiguous.
        t.shadow.reject('blokada');
        expect(t.reports.at(-1)).toMatchObject({type: 'rejected'});
    });

    test('a step back by a script starts over from the map, one the shadow knows about does not', () => {
        const t = setup();
        t.shadow.step('n', 1);
        t.shadow.step('n', 1);
        t.setMap(1);
        t.shadow.inStepWithMap(() => t.shadow.mapSteppedBack());
        expect(t.shadow.pending).toHaveLength(2);

        t.shadow.mapSteppedBack();
        expect(t.shadow.pending).toHaveLength(0);
        expect(t.shadow.confirmedRoom).toBe(1);
        expect(t.reports.at(-1)).toMatchObject({type: 'reset', source: 'cofniecie'});
    });

    test('a placement made in step with the shadow is not a reset', () => {
        const t = setup();
        t.shadow.step('n', 1);
        t.shadow.inStepWithMap(() => t.shadow.placed(5));
        expect(t.shadow.pending).toHaveLength(1);
    });

    test('a refusal with nothing waiting is reported as such', () => {
        const t = setup();
        t.shadow.reject('brak wyjscia');
        expect(t.reports.at(-1)).toMatchObject({type: 'unmatched-reject', source: 'brak wyjscia'});
    });
});
