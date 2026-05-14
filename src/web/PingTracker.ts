import eventBus from "@modules/core/eventBus";

const PING_INTERVAL_MS = 3000;

type SendPing = () => void;

class PingTracker {
    private timer: number | null = null;
    private lastSentAt: number | null = null;
    private lastDuration: number | null = null;

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
        if (this.lastSentAt !== null) {
            const outstanding = performance.now() - this.lastSentAt;
            console.warn(`[ping] sending new ping while previous still outstanding for ${outstanding.toFixed(0)}ms`);
        }
        this.lastSentAt = performance.now();
        console.log('[ping] -> core.ping');
        this.sendPingCommand();
    }

    private handlePingResponse = () => {
        if (this.lastSentAt === null) {
            console.log('[ping] <- core.ping response (no outstanding ping recorded)');
            return;
        }

        const duration = performance.now() - this.lastSentAt;
        this.lastSentAt = null;
        this.lastDuration = duration;
        console.log(`[ping] <- core.ping response in ${duration.toFixed(0)}ms`);
        eventBus.emit("ping", duration);
    };

    debugSnapshot() {
        return {
            timerActive: this.timer !== null,
            lastSentAt: this.lastSentAt,
            lastDuration: this.lastDuration,
            outstandingPingMs: this.lastSentAt !== null ? performance.now() - this.lastSentAt : null,
        };
    }
}

export default PingTracker;
