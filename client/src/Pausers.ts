import Client from "./Client";
import appEventBus from "./events/app-event-bus";

interface OwnData {
    paralyzed?: boolean;
    editing?: boolean;
}

export default class Pausers {
    private client: Client;
    private playerId?: string;
    private paralyzed = false;
    private editing = false;
    private active = false;

    constructor(client: Client) {
        this.client = client;
        appEventBus.on("gmcp.char.info", event => {
            if (event.object_num !== undefined) {
                this.playerId = String(event.object_num);
            }
        })


        appEventBus.on("gmcp.objects.data", event => {
            this.check(event as Record<string, OwnData>);
        })
    }

    private check(data: Record<string, OwnData>) {
        if (!this.playerId) return;
        const own = data[this.playerId];
        if (!own) return;
        let changed = false;
        if (own.paralyzed !== undefined) {
            this.paralyzed = !!own.paralyzed;
            changed = true;
        }
        if (own.editing !== undefined) {
            this.editing = !!own.editing;
            changed = true;
        }
        if (changed) {
            const shouldPause = this.paralyzed || this.editing;
            this.client.Map.setPaused(shouldPause);
            if (shouldPause !== this.active) {
                this.active = shouldPause;
                appEventBus.emit(shouldPause ? 'pauserStart' : 'pauserEnd');
            }
        }
    }
}
