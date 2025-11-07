import Client from "../Client";
import { longToShort } from "@shared/map/directions";
import {getShortcut} from "./shortcuts";
import {AnsiAwareBuffer} from "@client/ansi/FormatState";

type SearchableRoom = {
    id: number;
    area: number;
    name?: string;
    exits?: Record<string, number>;
    specialExits?: Record<string, number>;
};

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
                const input = matches[1];
                const shortcutId = getShortcut(input);
                if (typeof shortcutId === 'number') {
                    client.sendEvent('leadTo', shortcutId);
                    return;
                }

                const numericId = Number(input);
                if (!Number.isNaN(numericId)) {
                    client.sendEvent('leadTo', numericId);
                    return;
                }

                client.println(`Nie znaleziono celu prowadzenia dla '${input}'.`);
            }
        },
        {
            pattern: /\/prowadz-$/,
            callback: () => {
                client.sendEvent('clearLeadTo');
            }
        },
        {
            pattern: /\/go$/,
            callback: () => {
                const embedded: any = (globalThis as any).embedded;
                const room = client.Map.currentRoom as SearchableRoom | undefined;
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
                const current = client.Map.currentRoom as SearchableRoom | undefined;
                if (!reader || !current) return;
                const matches: { id: number, name: string; area: string; dist: number }[] = [];
                const rooms = reader.getRooms() as SearchableRoom[];
                for (const room of rooms) {
                    const name = room.name;
                    if (name && name.toLowerCase().includes(term)) {
                        const path = client.Map.findPath(current.id, room.id);
                        const dist = path ? path.length - 1 : Number.MAX_SAFE_INTEGER;
                        const area = typeof (reader as any).getArea === 'function' ? (reader as any).getArea(room.area) : null;
                        const areaName = area?.getAreaName?.() ?? client.Map.getAreaName(String(room.area)) ?? '';
                        matches.push({id: room.id, name: name, area: areaName, dist});
                    }
                }
                matches.sort((a, b) => a.dist - b.dist);
                const topMatches = matches.slice(0, 10);
                const header = `Wyniki przeszukiwania '${termRaw}'`;
                if (topMatches.length) {
                    const maxIdLength = Math.max(...topMatches.map(match => String(match.id).length));
                    const output = new AnsiAwareBuffer(header + '\n');
                    topMatches.forEach((match, idx) => {
                        const paddedId = String(match.id).padStart(maxIdLength, ' ');
                        const roomText = `${match.name} (${match.area})`;
                        const lineText = `${paddedId} ${roomText}`;

                        const lineStart = output.length;
                        output.append(lineText);

                        // Create link for the room name and area
                        const linkStart = lineStart + paddedId.length + 1;
                        output.createLink([linkStart, linkStart + roomText.length], {
                            onClick: () => {
                                client.sendEvent('leadTo', match.id);
                            },
                            title: `Kliknij aby prowadzić do: ${match.name}`
                        });

                        if (idx < topMatches.length - 1) {
                            output.append('\n');
                        }
                    });
                    client.println(output);
                } else {
                    client.println(`${header}\nNie znaleziono.`);
                }
            }
        }
    );
}
