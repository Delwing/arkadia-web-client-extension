import { formatStamp, HybridLogicalClock, parseStamp, stampTime, type HlcStorage } from '@modules/userData/hlc';

function memoryStorage(initial: string | null = null): HlcStorage & { value: string | null } {
    return {
        value: initial,
        load() { return this.value; },
        save(stamp: string) { this.value = stamp; },
    };
}

describe('HybridLogicalClock', () => {
    it('issues increasing stamps even when the wall clock stands still or goes back', () => {
        let now = 1_000;
        const clock = new HybridLogicalClock('dev-a', memoryStorage(), () => now);
        const first = clock.tick();
        const second = clock.tick();
        now = 500;
        const third = clock.tick();

        expect(first < second).toBe(true);
        expect(second < third).toBe(true);
        expect(stampTime(third)).toBe(1_000);
    });

    it('orders by time first, and uses the wall clock when it moves forward', () => {
        let now = 1_000;
        const clock = new HybridLogicalClock('dev-a', memoryStorage(), () => now);
        clock.tick();
        now = 2_000;
        const later = clock.tick();
        expect(parseStamp(later)).toEqual({ wall: 2_000, counter: 0, device: 'dev-a' });
    });

    it('moves past stamps received from a device with a clock ahead', () => {
        const clock = new HybridLogicalClock('dev-a', memoryStorage(), () => 1_000);
        const remote = formatStamp({ wall: 5_000, counter: 3, device: 'dev-b' });
        clock.receive(remote);
        const next = clock.tick();
        expect(next > remote).toBe(true);
        expect(parseStamp(next)?.device).toBe('dev-a');
    });

    it('continues from the stamp saved by a previous session', () => {
        const storage = memoryStorage();
        const first = new HybridLogicalClock('dev-a', storage, () => 9_000).tick();
        const afterReload = new HybridLogicalClock('dev-a', storage, () => 1_000).tick();
        expect(afterReload > first).toBe(true);
    });

    it('ignores malformed stamps', () => {
        const clock = new HybridLogicalClock('dev-a', memoryStorage(), () => 1_000);
        clock.receive('garbage');
        expect(stampTime(clock.tick())).toBe(1_000);
        expect(parseStamp('garbage')).toBeNull();
    });
});
