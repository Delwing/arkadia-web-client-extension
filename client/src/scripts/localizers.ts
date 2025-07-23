import Client from "../Client";

import localizers from "../localizers.json";

interface LocalizerEntry {
    location: number;
    patterns: string[];
}

export default function initLocalizers(client: Client) {
    (localizers as LocalizerEntry[]).forEach(entry => {
        const patterns = entry.patterns;
        if (!patterns || patterns.length === 0) {
            return;
        }
        const delta = patterns.length - 1;
        let current = 1;
        const parent = client.Triggers.registerTrigger(
            patterns[0],
            () => {
                if (patterns.length === 1) {
                    client.Map.setMapRoomById(entry.location);
                    client.sendEvent('notify', { text: `Map Sync: localizer ${entry.location}` });
                } else {
                    current = 0;
                }
                return undefined;
            },
            "localizers",
            { stayOpenLines: delta }
        );
        if (patterns.length > 1) {
            parent.registerChild((_, line) => {
                if (line === patterns[current]) {
                    current++;
                    if (current === patterns.length) {
                        client.Map.setMapRoomById(entry.location);
                        client.sendEvent('notify', { text: `Map Sync: localizer ${entry.location}` });
                        current = 1;
                    }
                    return [line];
                }
                return undefined;
            });
        }
    });
}
