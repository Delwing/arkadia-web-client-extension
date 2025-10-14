import Client from "../Client";
import {longToShort} from "../MapHelper";
import {getShortcut} from "./shortcuts";
import appEventBus from "../events/app-event-bus";

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
                appEventBus.emit('leadTo', dest);
            }
        },
        {
            pattern: /\/prowadz-$/,
            callback: () => {
                appEventBus.emit('leadTo');
            }
        },
        {
            pattern: /\/go$/,
            callback: () => {
                const embedded: any = (window as any).embedded;
                const room: any = client.Map.currentRoom;
                if (!embedded?.destinations?.length || !room) return;
                const target = parseInt(embedded.destinations[0]);
                const path = client.Map.findPath(room.id, target);
                if (!path || path.length < 2) return;
                const next = path[1];
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
            callback: async (m: RegExpMatchArray) => {
                const termRaw = m[1];
                const term = termRaw.toLowerCase();
                const reader = client.Map.tryGetMapReader();
                const current = client.Map.currentRoom;
                if (!reader || !current) return;
                const matches: { id: number, name: string; area: string; dist: number }[] = [];
                for (const room of reader.getRooms()) {
                    const name = room.name;
                    if (name && name.toLowerCase().includes(term)) {
                        const path = client.Map.findPath(current.id, room.id);
                        const dist = path ? path.length - 1 : Number.MAX_SAFE_INTEGER;
                        const area = typeof (reader as any).getArea === 'function' ? (reader as any).getArea(room.area) : null;
                        const areaName = area?.getAreaName?.() ?? client.Map.getAreaName(String(room.area)) ?? '';
                        matches.push({id: room.id, name: room.name, area: areaName, dist});
                    }
                }
                matches.sort((a, b) => a.dist - b.dist);
                const topMatches = matches.slice(0, 10);
                const header = `Wyniki przeszukiwania '${termRaw}'`;
                if (topMatches.length) {
                    const maxIdLength = Math.max(...topMatches.map(match => String(match.id).length));
                    const lines = topMatches.map(match => {
                        const paddedId = String(match.id).padStart(maxIdLength, ' ');
                        const clickable = client.OutputHandler.makeStringClickable(`${match.name} (${match.area})`, () => {
                            appEventBus.emit('leadTo', match.id);
                        });
                        return `${paddedId} ${clickable}`;
                    });
                    client.println(`${header}\n${lines.join('\n')}`);
                } else {
                    client.println(`${header}\nNie znaleziono.`);
                }
            }
        }
    );
}
