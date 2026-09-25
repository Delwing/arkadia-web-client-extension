/**
 * Hybrid logical clock for sync stamps.
 *
 * A stamp is `wallMs:counter:deviceId`, fixed-width so plain string comparison
 * orders stamps: by wall time, then counter, then device id as a deterministic
 * tie-breaker. Every local stamp is later than every stamp this device has
 * issued or received, so the order holds even when a device's clock is behind.
 * See docs/dev/SYNC_V2_PLAN.md, section 6.2.
 */

const WALL_WIDTH = 15;
const COUNTER_WIDTH = 4;
const COUNTER_MAX = 36 ** COUNTER_WIDTH - 1;

export interface ParsedStamp {
    wall: number;
    counter: number;
    device: string;
}

export function formatStamp({ wall, counter, device }: ParsedStamp): string {
    return `${String(wall).padStart(WALL_WIDTH, '0')}:${counter.toString(36).padStart(COUNTER_WIDTH, '0')}:${device}`;
}

export function parseStamp(stamp: string): ParsedStamp | null {
    const first = stamp.indexOf(':');
    const second = stamp.indexOf(':', first + 1);
    if (first !== WALL_WIDTH || second !== WALL_WIDTH + 1 + COUNTER_WIDTH) return null;
    const wall = Number(stamp.slice(0, first));
    const counter = parseInt(stamp.slice(first + 1, second), 36);
    if (!Number.isFinite(wall) || !Number.isFinite(counter)) return null;
    return { wall, counter, device: stamp.slice(second + 1) };
}

/** Wall-clock milliseconds of a stamp (0 if it can't be parsed). */
export function stampTime(stamp: string): number {
    return parseStamp(stamp)?.wall ?? 0;
}

export interface HlcStorage {
    load(): string | null;
    save(stamp: string): void;
}

export class HybridLogicalClock {
    private last: ParsedStamp;

    constructor(
        private readonly device: string,
        private readonly storage: HlcStorage,
        private readonly now: () => number = Date.now,
    ) {
        const stored = storage.load();
        this.last = (stored && parseStamp(stored)) || { wall: 0, counter: 0, device };
    }

    /** A new stamp, later than anything issued or received so far. */
    tick(): string {
        const wall = Math.max(this.now(), this.last.wall);
        const counter = wall === this.last.wall ? this.last.counter + 1 : 0;
        return this.commit(wall, counter);
    }

    /** Advance past a stamp received from another device. */
    receive(stamp: string): void {
        const remote = parseStamp(stamp);
        if (!remote) return;
        if (remote.wall > this.last.wall || (remote.wall === this.last.wall && remote.counter > this.last.counter)) {
            this.last = { wall: remote.wall, counter: remote.counter, device: this.device };
            this.storage.save(formatStamp(this.last));
        }
    }

    private commit(wall: number, counter: number): string {
        // Overflowing the counter within one millisecond moves to the next one.
        if (counter > COUNTER_MAX) {
            wall += 1;
            counter = 0;
        }
        this.last = { wall, counter, device: this.device };
        const stamp = formatStamp(this.last);
        this.storage.save(stamp);
        return stamp;
    }
}
