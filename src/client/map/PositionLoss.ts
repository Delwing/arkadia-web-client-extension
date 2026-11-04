import type {MapHelperClient, MapLostReason} from "./types";

/**
 * How long a follow the mapper could not resolve is given before it counts as a
 * loss. Following a team leader normally leaves the map a room behind for a
 * moment - the next room.info puts it right - so warning at once would blink on
 * every step. Only a stale position that outlives this window, and that GMCP
 * cannot rescue, is a real loss.
 */
const LOST_CONFIRM_DELAY_MS = 1500;

/** Whether the room drawn on the map is certainly not the room we stand in, and why. */
export class PositionLoss {
    /** True once the room drawn on the map is certainly not the room we stand in. */
    private lost = false;
    private lostReason: MapLostReason | null = null;
    private lostCheckTimer?: ReturnType<typeof setTimeout>;

    constructor(private readonly client: Pick<MapHelperClient, "sendEvent">) {
    }

    get isLost(): boolean {
        return this.lost;
    }

    emit() {
        this.client.sendEvent("mapPositionLost", {lost: this.lost, reason: this.lostReason});
    }

    set(lost: boolean, reason: MapLostReason | null = null) {
        const nextReason = lost ? reason : null;
        if (this.lost === lost && this.lostReason === nextReason) {
            return;
        }
        this.lost = lost;
        this.lostReason = nextReason;
        this.emit();
    }

    /** Position confirmed from an authoritative source - drop any doubt about it. */
    clear() {
        if (this.lostCheckTimer !== undefined) {
            clearTimeout(this.lostCheckTimer);
            this.lostCheckTimer = undefined;
        }
        this.set(false);
    }

    /**
     * Something moved us in a way the mapper could not work out. That alone is not
     * a loss - GMCP usually catches up on the next room.info - so the verdict waits
     * a beat and is only passed when `gmcpCanRescue` says GMCP has no room to offer
     * either.
     */
    suspect(reason: MapLostReason, gmcpCanRescue: () => boolean) {
        if (this.lostCheckTimer !== undefined) {
            clearTimeout(this.lostCheckTimer);
        }
        this.lostCheckTimer = setTimeout(() => {
            this.lostCheckTimer = undefined;
            if (gmcpCanRescue()) {
                this.set(false);
                return;
            }
            this.set(true, reason);
        }, LOST_CONFIRM_DELAY_MS);
    }
}
