import Client from "./Client";

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
        this.client.on('gmcp.char.info', (info) => {
            const detail = info as { object_num?: unknown };
            if (detail?.object_num !== undefined) {
                this.playerId = String(detail.object_num);
            }
        });
        this.client.on('gmcp.objects.data', (data) => {
            this.check((data ?? {}) as Record<string, OwnData>);
        });
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
                this.client.sendEvent(shouldPause ? 'pauserStart' : 'pauserEnd');
            }
        }
    }
}
