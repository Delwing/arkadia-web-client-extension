import {eventNow, isReplaying, runWithEventTime, scheduleFromEvent} from '@shared/eventClock.ts';

describe('eventNow', () => {
    it('is the wall clock for live output', () => {
        const before = Date.now();

        expect(eventNow()).toBeGreaterThanOrEqual(before);
        expect(isReplaying()).toBe(false);
    });

    it('is the event time while replaying', () => {
        const happenedAt = Date.now() - 60_000;

        runWithEventTime(happenedAt, () => {
            expect(eventNow()).toBe(happenedAt);
            expect(isReplaying()).toBe(true);
        });
    });

    it('restores the previous value rather than clearing it', () => {
        const outer = Date.now() - 60_000;
        const inner = Date.now() - 30_000;

        runWithEventTime(outer, () => {
            // A GMCP envelope dispatched while a line is being processed.
            runWithEventTime(inner, () => {
                expect(eventNow()).toBe(inner);
            });
            expect(eventNow()).toBe(outer);
        });

        expect(isReplaying()).toBe(false);
    });

    it('restores on a throw, so one bad trigger does not mis-date everything after it', () => {
        const happenedAt = Date.now() - 60_000;

        expect(() => runWithEventTime(happenedAt, () => {
            throw new Error('trigger exploded');
        })).toThrow('trigger exploded');

        expect(isReplaying()).toBe(false);
    });
});

describe('scheduleFromEvent', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('waits the full delay for live output', () => {
        const run = vi.fn();

        scheduleFromEvent(30_000, run);

        vi.advanceTimersByTime(29_999);
        expect(run).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('waits only what is left of the deadline for a replayed event', () => {
        const run = vi.fn();
        // The line is 20s old, so a 30s timer has 10s to go — not 30.
        const happenedAt = Date.now() - 20_000;

        runWithEventTime(happenedAt, () => scheduleFromEvent(30_000, run));

        vi.advanceTimersByTime(9_999);
        expect(run).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('runs on the next tick when the deadline already passed', () => {
        const run = vi.fn();
        // Fed ten minutes ago, with a five-minute recovery: the player should be told
        // now, not in another five minutes.
        const happenedAt = Date.now() - 10 * 60_000;

        runWithEventTime(happenedAt, () => scheduleFromEvent(5 * 60_000, run));

        expect(run).not.toHaveBeenCalled();
        // Deferred by a tick rather than called straight through, so a throw cannot
        // cost the line being processed.
        vi.advanceTimersByTime(0);
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('returns a handle the caller can cancel', () => {
        const run = vi.fn();

        const handle = scheduleFromEvent(1_000, run);
        clearTimeout(handle);

        vi.advanceTimersByTime(5_000);
        expect(run).not.toHaveBeenCalled();
    });
});
