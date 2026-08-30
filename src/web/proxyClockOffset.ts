/**
 * How far the session proxy's clock runs ahead of ours, estimated from the frames it
 * already sends.
 *
 * Every proxy frame carries the moment the proxy received the bytes (`proxy/frame.go`),
 * and that timestamp is what `client.now()` hands to scripts. It is a *different
 * machine's* wall clock, though, and the timers that use it tick against `Date.now()` on
 * this one — so a proxy running five seconds fast makes a five-second cover cooldown
 * count down from ten. Nothing else in the stack notices: the frames are perfectly
 * well-formed, they just disagree with us about what time it is.
 *
 * The estimate needs no protocol of its own. For a frame the proxy sent live,
 *
 *     at - Date.now()  ==  offset - oneWayDelay
 *
 * and the delay is always positive, so every sample sits at or below the true offset and
 * a **maximum** over recent samples converges on it from below, wrong only by the
 * smallest one-way delay seen in the window. That the estimator wants a maximum is also
 * what makes replay free: backlog frames are legitimately minutes old, land far below
 * every live sample, and are ignored without having to be recognised.
 *
 * Seeding is the one case worth stating. A resume delivers its backlog immediately, so
 * the first *data* frames of a reattach are old — but `Session.attach` sends the control
 * frame before them, stamped as it goes out, so the first sample of every attach is live
 * and the estimate is right from the first line replayed.
 *
 * Kept as a sliding window rather than a running maximum so the estimate can come back
 * down: clocks are corrected (by NTP, or by hand), and an offset that could only grow
 * would hold a stale correction forever.
 */

/** How long a sample stays eligible. Long enough to span a quiet stretch of output. */
export const OFFSET_WINDOW_MS = 60_000;

/**
 * How much the estimate must move to be worth reporting. Below this it is jitter in the
 * network delay, not the clock, and every frame would announce it.
 */
export const OFFSET_REPORT_STEP_MS = 50;

interface Sample {
    /** Local time the sample was taken, for ageing it out of the window. */
    takenAt: number;
    /** proxy time - local time. */
    offset: number;
}

export class ProxyClockOffset {
    /**
     * The window's samples, kept strictly decreasing in offset: anything a newer sample
     * is at least as large as can never be the maximum again while that newer sample is
     * around, so it is dropped on arrival. The front is therefore the maximum, and the
     * whole thing stays a handful of entries wide however fast output arrives.
     */
    private window: Sample[] = [];
    private current = 0;
    private seeded = false;

    /** Best estimate of `proxyClock - localClock`, in milliseconds. Zero until seeded. */
    get offset(): number {
        return this.current;
    }

    /** Whether any frame has been seen yet; before that `offset` is a guess of zero. */
    get hasEstimate(): boolean {
        return this.seeded;
    }

    /** Forget everything. For a new connection, which may be to a different proxy. */
    reset(): void {
        this.window = [];
        this.current = 0;
        this.seeded = false;
    }

    /**
     * Feed a frame's proxy timestamp and return the resulting estimate.
     *
     * `now` is injectable for tests; production always passes the wall clock.
     */
    sample(frameAt: number, now: number = Date.now()): number {
        if (!Number.isFinite(frameAt)) return this.current;
        // A local clock that stepped backwards makes every stored age a lie — the window
        // would hold samples it thinks are seconds old and are not. Start over rather
        // than reason about it.
        if (this.window.length > 0 && now < this.window[this.window.length - 1].takenAt) {
            this.window = [];
        }
        const offset = frameAt - now;
        while (this.window.length > 0 && now - this.window[0].takenAt > OFFSET_WINDOW_MS) {
            this.window.shift();
        }
        while (this.window.length > 0 && this.window[this.window.length - 1].offset <= offset) {
            this.window.pop();
        }
        this.window.push({takenAt: now, offset});
        this.current = this.window[0].offset;
        this.seeded = true;
        return this.current;
    }

    /** A proxy timestamp expressed on this machine's clock. */
    toLocal(frameAt: number): number {
        return frameAt - this.current;
    }
}

export default ProxyClockOffset;
