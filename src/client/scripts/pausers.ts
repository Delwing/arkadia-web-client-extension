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

    // Losing the body we were reading in has to lift the pause with it: the
    // 'editing: false' that would have ended it arrives under the new id, which
    // the check below would never look at, and the mapper would stay paused.
    client.on('player.objectNum', (num) => {
        playerId = num === undefined ? undefined : String(num);
        paralyzed = false;
        editing = false;
        if (active) {
            active = false;
            client.Map.setPaused(false);
            client.sendEvent('pauserEnd');
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
