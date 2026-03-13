import Client from "../Client";

interface OwnData {
    paralyzed?: boolean;
    editing?: boolean;
}

export default function initPausers(client: Client) {
    let playerId: string | undefined;
    let paralyzed = false;
    let editing = false;
    let active = false;

    client.on('gmcp.char.info', (info) => {
        if (info?.object_num !== undefined) {
            playerId = String(info.object_num);
        }
    });

    client.on('gmcp.objects.data', (data) => {
        check((data ?? {}) as Record<string, OwnData>);
    });

    function check(data: Record<string, OwnData>) {
        if (!playerId) return;
        const own = data[playerId];
        if (!own) return;
        let changed = false;
        if (own.paralyzed !== undefined) {
            paralyzed = !!own.paralyzed;
            changed = true;
        }
        if (own.editing !== undefined) {
            editing = !!own.editing;
            changed = true;
        }
        if (changed) {
            const shouldPause = paralyzed || editing;
            client.Map.setPaused(shouldPause);
            if (shouldPause !== active) {
                active = shouldPause;
                client.sendEvent(shouldPause ? 'pauserStart' : 'pauserEnd');
            }
        }
    }
}
