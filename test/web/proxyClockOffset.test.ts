import {OFFSET_WINDOW_MS, ProxyClockOffset} from '@web/proxyClockOffset.ts';

describe('proxy clock offset', () => {
    it('is a guess of zero until a frame has been seen', () => {
        const clock = new ProxyClockOffset();

        expect(clock.hasEstimate).toBe(false);
        expect(clock.offset).toBe(0);
        expect(clock.toLocal(1_000)).toBe(1_000);
    });

    it('reads a fast proxy off a single live frame', () => {
        const clock = new ProxyClockOffset();
        const now = 1_000_000;

        // The proxy stamped the frame 5s ahead of us and it arrived instantly.
        clock.sample(now + 5_000, now);

        expect(clock.offset).toBe(5_000);
        // Which is what stops a 5s cooldown counting down from 10.
        expect(clock.toLocal(now + 5_000)).toBe(now);
    });

    it('recovers the offset from samples every one of which understates it', () => {
        const clock = new ProxyClockOffset();
        const now = 1_000_000;

        // Each sample is the true offset minus that frame's one-way delay, so no
        // single one is right; the maximum is within the smallest delay seen.
        [120, 40, 260, 15, 80].forEach((delay, i) => {
            clock.sample(now + i * 1_000 + 5_000 - delay, now + i * 1_000);
        });

        expect(clock.offset).toBe(5_000 - 15);
    });

    it('ignores a replayed backlog, which is old rather than mis-stamped', () => {
        const clock = new ProxyClockOffset();
        const now = 1_000_000;

        // Attach: the control frame goes out live and seeds the estimate.
        clock.sample(now + 5_000, now);
        // Then the backlog lands — minutes of output stamped when it happened.
        for (let i = 0; i < 20; i++) {
            clock.sample(now - 300_000 + i * 1_000, now + i);
        }

        expect(clock.offset).toBe(5_000);
    });

    it('keeps a replayed frame as old as it really is', () => {
        const clock = new ProxyClockOffset();
        const now = 1_000_000;
        clock.sample(now + 5_000, now);

        // Five minutes of proxy time ago, corrected onto our clock, is still five
        // minutes ago: the correction must not flatten the gaps replay exists to keep.
        expect(now - clock.toLocal(now + 5_000 - 300_000)).toBe(300_000);
    });

    it('comes back down once a corrected clock ages out of the window', () => {
        const clock = new ProxyClockOffset();
        const now = 1_000_000;
        clock.sample(now + 5_000, now);

        // The proxy's clock gets fixed; its frames now agree with ours.
        clock.sample(now + OFFSET_WINDOW_MS + 1, now + OFFSET_WINDOW_MS + 1);

        expect(clock.offset).toBe(0);
    });

    it('starts over when our own clock steps backwards', () => {
        const clock = new ProxyClockOffset();
        const now = 1_000_000;
        clock.sample(now + 5_000, now);

        // The player corrects a fast local clock, so Date.now() lands behind where the
        // window thinks it is and every stored age is a lie. Start over rather than hold
        // a maximum that can no longer expire.
        clock.sample(now - 1_000, now - 1_000);

        expect(clock.offset).toBe(0);
    });

    it('ignores a frame with no usable timestamp', () => {
        const clock = new ProxyClockOffset();
        const now = 1_000_000;
        clock.sample(now + 5_000, now);

        clock.sample(Number.NaN, now + 1);

        expect(clock.offset).toBe(5_000);
    });

    it('forgets everything on reset, since a reconnect may be to another proxy', () => {
        const clock = new ProxyClockOffset();
        clock.sample(1_005_000, 1_000_000);

        clock.reset();

        expect(clock.hasEstimate).toBe(false);
        expect(clock.offset).toBe(0);
    });
});
