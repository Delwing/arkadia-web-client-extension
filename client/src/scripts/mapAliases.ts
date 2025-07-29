import Client from "../Client";
import { longToShort } from "../MapHelper";
import { getShortcut } from "./shortcuts";

export default function initMapAliases(client: Client, aliases: { pattern: RegExp; callback: Function }[]) {
    aliases.push(
        {
            pattern: /\/cofnij$/,
            callback: () => {
                client.Map.moveBack();
            }
        },
        {
            pattern: /\/move (.*)$/,
            callback: (matches: RegExpMatchArray) => {
                client.Map.move(matches[1]);
            }
        },
        {
            pattern: /\/ustaw (.*)$/,
            callback: (matches: RegExpMatchArray) => {
                client.Map.setMapRoomById(parseInt(matches[1]));
            }
        },
        {
            pattern: /\/prowadz (.*)$/,
            callback: (matches: RegExpMatchArray) => {
                const dest = getShortcut(matches[1]) ?? matches[1];
                client.sendEvent('leadTo', dest);
            }
        },
        {
            pattern: /\/prowadz-$/,
            callback: () => {
                client.sendEvent('leadTo');
            }
        },
        {
            pattern: /\/go$/,
            callback: () => {
                const embedded: any = (window as any).embedded;
                const room: any = client.Map.currentRoom;
                if (!embedded?.destinations?.length || !room) return;
                const target = parseInt(embedded.destinations[0]);
                const path = client.Map.mapReader.getPath(room.id, target);
                if (!path || path.length < 2) return;
                const next = parseInt(path[1]);
                const allExits = Object.assign({}, room.exits ?? {}, room.specialExits ?? {});
                const entry = Object.entries(allExits).find(([_, id]) => id === next);
                if (!entry) return;
                const dir = entry[0];
                client.sendCommand(longToShort[dir] ?? dir);
            }
        },
        {
            pattern: /\/zlok$/,
            callback: () => {
                client.Map.refresh();
            }
        },
        {
            pattern: /^\/przeszukaj (.+)$/,
            callback: (m: RegExpMatchArray) => {
                const term = m[1].toLowerCase();
                const reader = client.Map.mapReader;
                const current = client.Map.currentRoom as any;
                if (!reader || !current) return;
                const matches: { name: string; area: string; dist: number }[] = [];
                reader.getAreas().forEach((area: MapData.Area) => {
                    area.rooms.forEach((room: any) => {
                        const name = room.name as string | undefined;
                        if (name && name.toLowerCase().includes(term)) {
                            const path = reader.getPath(current.id, room.id);
                            const dist = path ? path.length - 1 : Number.MAX_SAFE_INTEGER;
                            matches.push({ name: room.name, area: area.areaName, dist });
                        }
                    });
                });
                matches.sort((a, b) => a.dist - b.dist);
                const lines = matches.slice(0, 10).map(m => `${m.name} (${m.area})`);
                if (lines.length) {
                    client.println(lines.join('\n'));
                } else {
                    client.println('Nie znaleziono.');
                }
            }
        }
    );
}
