import eventBus from "@modules/core/eventBus";
import type { PingSample } from "@shared/events/clientEvents";

/** How far back the history behind the connection chip's graph reaches. */
const PING_HISTORY_MS = 5 * 60_000;

type SendPing = () => void;

class PingTracker {
    private timer: number | null = null;
    private running = false;
    private lastSentAt: number | null = null;
    private lastDuration: number | null = null;
    // Set on connect, so the graph starts a new line instead of joining across the drop.
    private nextIsRestart = false;
    // Kept across reconnects: a drop shows as a gap in the graph rather than wiping it.
    private history: PingSample[] = [];

    /** `intervalSeconds` of 0 sends no pings at all. */
    constructor(private readonly sendPingCommand: SendPing, private intervalSeconds: number) {
        eventBus.on("gmcp.core.ping", this.handlePingResponse);
    }

    start() {
        this.stop();
        this.running = true;
        this.nextIsRestart = true;
        this.schedule();
    }

    stop() {
        this.running = false;
        this.clearTimer();
        this.lastSentAt = null;
        this.clearReading();
    }

    /** Change how often to ping; a running tracker switches over without a reconnect. */
    setInterval(seconds: number) {
        if (seconds === this.intervalSeconds) return;
        this.intervalSeconds = seconds;
        if (!this.running) return;
        this.clearTimer();
        if (seconds <= 0) {
            this.lastSentAt = null;
            this.clearReading();
        }
        this.schedule();
    }

    private schedule() {
        if (this.intervalSeconds <= 0) return;
        this.sendPing();
        this.timer = window.setInterval(() => this.sendPing(), this.intervalSeconds * 1000);
    }

    private clearTimer() {
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    // With nothing being measured the chip should not keep showing an old number.
    private clearReading() {
        if (this.lastDuration !== null) {
            this.lastDuration = null;
            eventBus.emit("ping", null);
        }
    }

    private sendPing() {
        this.lastSentAt = performance.now();
        this.sendPingCommand();
    }

    private handlePingResponse = () => {
        if (this.lastSentAt === null) {
            return;
        }

        const duration = performance.now() - this.lastSentAt;
        this.lastSentAt = null;
        this.lastDuration = duration;
        const at = Date.now();
        const sample: PingSample = this.nextIsRestart ? { at, ms: duration, restart: true } : { at, ms: duration };
        this.nextIsRestart = false;
        this.history = [...this.history.filter((s) => at - s.at <= PING_HISTORY_MS), sample];
        eventBus.emit("ping", duration);
        eventBus.emit("pingHistory", { samples: this.history });
    };
}

export default PingTracker;
