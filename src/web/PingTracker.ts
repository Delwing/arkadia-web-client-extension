import eventBus from "@modules/core/eventBus";
import type { PingSample } from "@shared/events/clientEvents";

const PING_INTERVAL_MS = 3000;
/** How far back the history behind the connection chip's graph reaches. */
const PING_HISTORY_MS = 5 * 60_000;

type SendPing = () => void;

class PingTracker {
    private timer: number | null = null;
    private lastSentAt: number | null = null;
    private lastDuration: number | null = null;
    // Kept across reconnects: a drop shows as a gap in the graph rather than wiping it.
    private history: PingSample[] = [];

    constructor(private readonly sendPingCommand: SendPing) {
        eventBus.on("gmcp.core.ping", this.handlePingResponse);
    }

    start() {
        this.stop();
        this.sendPing();
        this.timer = window.setInterval(() => this.sendPing(), PING_INTERVAL_MS);
    }

    stop() {
        if (this.timer !== null) {
            clearInterval(this.timer);
            this.timer = null;
        }

        this.lastSentAt = null;

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
        this.history = [...this.history.filter((sample) => at - sample.at <= PING_HISTORY_MS), { at, ms: duration }];
        eventBus.emit("ping", duration);
        eventBus.emit("pingHistory", { samples: this.history });
    };
}

export default PingTracker;
