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
        eventBus.emit("ping", duration);
    };
}

export default PingTracker;
