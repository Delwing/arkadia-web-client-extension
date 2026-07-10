import Client from "../Client";
import { longToShort } from "@shared/map/directions";
import {getShortcut} from "./shortcuts";
import {AnsiAwareBuffer} from "@client/ansi/FormatState";
import eventBus from "@modules/core/eventBus";
import {getNote} from "@modules/data/locationNotesStorage";
import {getPluginLocationNotes} from "@modules/core/pluginLocationNotesRegistry";
import {getSnapshot as getMultibindSnapshot} from "@modules/data/multibindStore";
import {getMultibindLabel} from "../multibindKeys";
import {findTransportPath, type TransportPathSegment, type TransportPathOptions} from "@shared/map/transportPathFinder";
import {getTransportDefs} from "./transports/definitions";
import {SEGMENT_COLORS} from "@shared/map/MapHelper";

type SearchableRoom = {
    id: number;
    area: number;
    hash?: string;
    name?: string;
    exits?: Record<string, number>;
    specialExits?: Record<string, number>;
    doors?: Record<string, number>;
    customLines?: Record<string, { points: { x: number; y: number }[]; attributes: { color: { r: number; g: number; b: number; alpha: number }; style: string; arrow: boolean } }>;
    userData?: Record<string, string>;
    x?: number;
    y?: number;
    z?: number;
    env?: number;
};

export default function initMapAliases(client: Client, aliases: { pattern: RegExp; callback: Function }[]) {
    aliases.push(
        {
            pattern: /^\/cofnij$/,
            callback: () => {
                client.Map.moveBack();
            }
        },
        {
            pattern: /^\/move (.*)$/,
            callback: (matches: RegExpMatchArray) => {
                client.Map.move(matches[1]);
            }
        },
        {
            pattern: /^\/ustaw (.*)$/,
            callback: (matches: RegExpMatchArray) => {
                client.Map.setMapRoomById(parseInt(matches[1]));
            }
        },
        {
            pattern: /^\/prowadz (.*)$/,
            callback: (matches: RegExpMatchArray) => {
                // Strip quotes if present for names with spaces
                let input = matches[1];
                if (input.startsWith('"') && input.endsWith('"')) {
                    input = input.slice(1, -1);
                }
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
            pattern: /^\/prowadz-$/,
            callback: () => {
                client.sendEvent('clearLeadTo');
            }
        },
        {
            pattern: /^\/prowadzt(!?)\s+(.*)$/,
            callback: (matches: RegExpMatchArray) => {
                const aggressive = matches[1] === '!';
                let input = matches[2];
                if (input.startsWith('"') && input.endsWith('"')) {
                    input = input.slice(1, -1);
                }
                const shortcutId = getShortcut(input);
                const numericId = Number(input);
                const targetId = typeof shortcutId === 'number'
                    ? shortcutId
                    : (!Number.isNaN(numericId) ? numericId : null);
                if (targetId === null) {
                    client.println(`Nie znaleziono celu prowadzenia dla '${input}'.`);
                    return;
                }

                const reader = client.Map.tryGetMapReader();
                const current = client.Map.currentRoom;
                if (!reader || !current) {
                    client.println('Brak aktualnej lokalizacji.');
                    return;
                }
                if (current.id === targetId) {
                    client.println('Jestes juz na miejscu.');
                    return;
                }

                const opts: TransportPathOptions | undefined = aggressive
                    ? { boardingPenalty: 10, timeToHopRatio: 0.1 }
                    : undefined;
                const segments = findTransportPath(reader, getTransportDefs(), current.id, targetId, opts);
                if (!segments || segments.length === 0) {
                    client.println(`Brak sciezki (z transportem) do lokacji ${targetId}.`);
                    return;
                }

                const walkSegments: Array<{ path: number[]; color: string }> = [];
                const hops: Array<{ fromRoomId: number; toRoomId: number; transportName: string; label?: string; color: string }> = [];
                let colorIndex = 0;
                const nextColor = () => SEGMENT_COLORS[colorIndex++ % SEGMENT_COLORS.length];

                let totalWalkRooms = 0;
                let totalTransportSeconds = 0;

                for (const seg of segments) {
                    if (seg.kind === 'walk') {
                        const color = nextColor();
                        walkSegments.push({ path: seg.rooms, color });
                        totalWalkRooms += Math.max(0, seg.rooms.length - 1);
                    } else {
                        const color = nextColor();
                        hops.push({
                            fromRoomId: seg.fromRoomId,
                            toRoomId: seg.toRoomId,
                            transportName: seg.transportName,
                            label: seg.label,
                            color,
                        });
                        if (typeof seg.timeSeconds === 'number') {
                            totalTransportSeconds += seg.timeSeconds;
                        }
                    }
                }

                client.Map.setTransportRoute({ walkSegments, hops, finalDestination: targetId });

                printTransportInstructions(client, segments, totalWalkRooms, totalTransportSeconds, aggressive);
            }
        },
        {
            pattern: /^\/go$/,
            callback: () => {
                const room = client.Map.currentRoom as SearchableRoom | undefined;
                const destinations = client.Map.destinations;
                if (!destinations?.length || !room) return;
                const target = destinations[0];
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
            pattern: /^\/info(?:\s+(\d+))?$/i,
            callback: async (m: RegExpMatchArray) => {
                const reader = client.Map.tryGetMapReader();
                let room: SearchableRoom | undefined;
                if (m[1]) {
                    const id = parseInt(m[1]);
                    room = (reader ? (reader as any).getRoom(id) : null) ?? client.Map.getRoomById(id) as SearchableRoom | undefined;
                    if (!room) {
                        client.println(`Nie znaleziono lokacji o id ${id}.`);
                        return;
                    }
                } else {
                    room = client.Map.currentRoom as SearchableRoom | undefined;
                    if (!room) {
                        client.println('Brak aktualnej lokalizacji.');
                        return;
                    }
                }
                const area = reader && typeof (reader as any).getArea === 'function'
                    ? (reader as any).getArea(room.area) : null;
                const areaName = area?.getAreaName?.() ?? client.Map.getAreaName(String(room.area)) ?? '';
                const envColor: string | null = reader && typeof (reader as any).getColorValue === 'function'
                    ? (reader as any).getColorValue(room.env) ?? null : null;

                const DIRECTION_LABELS: Record<string, string> = {
                    north: 'polnoc', south: 'poludnie', east: 'wschod', west: 'zachod',
                    northeast: 'polnocny-wschod', northwest: 'polnocny-zachod',
                    southeast: 'poludniowy-wschod', southwest: 'poludniowy-zachod',
                    up: 'gora', down: 'dol', in: 'do srodka', out: 'na zewnatrz',
                };
                const DOOR_LABELS: Record<number, string> = { 1: 'otwarte', 2: 'zamkniete', 3: 'zablokowane' };
                const fmtDir = (d: string) => DIRECTION_LABELS[d] ?? d;

                const COL = 22;
                const gray = { foreground: { space: 'hex' as const, color: '#888888' } };
                const white = { foreground: { space: 'hex' as const, color: '#dddddd' } };
                const row = (label: string, value: string, valueStyle?: import('@client/ansi/FormatState').FormatStateSnapshot) => {
                    output.append(label.padEnd(COL), gray);
                    output.append(`${value}\n`, valueStyle ?? white);
                };

                const output = new AnsiAwareBuffer();
                output.append(`--- Lokacja: ${room.id} ---\n`);
                if (room.hash) row('Hash', room.hash);
                row('Nazwa', room.name || `#${room.id}`);
                row('Kraina', areaName);
                row('Wspolrzedne', `${room.x ?? 0}, ${room.y ?? 0}, ${room.z ?? 0}`);
                output.append('Srodowisko'.padEnd(COL), gray);
                if (envColor) {
                    output.append(' ', { background: { space: 'hex' as const, color: envColor } });
                    output.append(' ');
                }
                output.append(` ${room.env ?? 0}\n`, white);

                const exits = Object.entries(room.exits ?? {});
                const specialExits = Object.entries(room.specialExits ?? {});
                if (exits.length > 0 || specialExits.length > 0) {
                    output.append('Wyjscia\n', gray);
                    for (const [dir, targetId] of exits) {
                        const doorState = room.doors?.[dir];
                        const doorInfo = doorState != null ? ` (drzwi: ${DOOR_LABELS[doorState] ?? doorState})` : '';
                        row(`  ${fmtDir(dir)}`, `${targetId}${doorInfo}`);
                    }
                    for (const [cmd, targetId] of specialExits) {
                        row(`  ${cmd}`, String(targetId));
                    }
                }

                const doorsWithoutExits = Object.entries(room.doors ?? {}).filter(([dir]) => !(room.exits ?? {})[dir]);
                if (doorsWithoutExits.length > 0) {
                    output.append('Drzwi\n', gray);
                    for (const [dir, state] of doorsWithoutExits) {
                        row(`  ${fmtDir(dir)}`, DOOR_LABELS[state] ?? String(state));
                    }
                }

                const customLines = Object.entries(room.customLines ?? {});
                if (customLines.length > 0) {
                    output.append('Linie\n', gray);
                    for (const [dir, line] of customLines) {
                        const { r, g, b } = line.attributes.color;
                        const colorHex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                        output.append(`  ${fmtDir(dir)}`.padEnd(COL), gray);
                        output.append('  ', { background: { space: 'hex' as const, color: colorHex } });
                        const arrowInfo = line.attributes.arrow ? ', strzalka' : '';
                        const pointsInfo = line.points.length > 0 ? ` (${line.points.length} pkt)` : '';
                        output.append(` ${line.attributes.style}${arrowInfo}${pointsInfo}\n`, white);
                    }
                }

                const userData = room.userData ?? {};
                const mapNote = userData.note;
                const locationNote = await getNote(room.id).catch(() => null);
                const pluginNotes = getPluginLocationNotes(room.id);

                if (mapNote || locationNote || pluginNotes.length > 0) {
                    output.append('Notatki\n', gray);
                    if (mapNote) row('  Mapa', mapNote);
                    if (locationNote) row('  Uzytkownik', locationNote.note);
                    for (const pn of pluginNotes) {
                        row(`  ${pn.pluginName}`, pn.note);
                    }
                }

                const dirBind = userData.dir_bind;
                if (dirBind) {
                    const entries = dirBind.split('&').map(item => item.split('=')).filter(pair => pair.length === 2);
                    if (entries.length > 0) {
                        output.append('Bindy kierunkow\n', gray);
                        for (const [longDir, shortDir] of entries) {
                            row(`  ${fmtDir(longDir)}`, shortDir);
                        }
                    }
                }

                if ((userData.bind != null && userData.bind !== '') || (userData.drinkable != null && userData.drinkable !== '')) {
                    output.append('Bindy lokacji\n', gray);
                    if (userData.bind != null && userData.bind !== '') row('  bind', userData.bind);
                    if (userData.drinkable != null && userData.drinkable !== '') row('  drinkable', 'tak');
                }

                const allMultibinds = await getMultibindSnapshot().catch(() => []);
                const roomMultibinds = allMultibinds.filter(mb => mb.roomId === room.id).sort((a, b) => a.index - b.index);
                if (roomMultibinds.length > 0) {
                    output.append('Multibindy\n', gray);
                    for (const { index, action } of roomMultibinds) {
                        row(`  [${getMultibindLabel(index)}]`, action);
                    }
                }

                const teamFollowLink = userData.team_follow_link;
                if (teamFollowLink) {
                    const entries = teamFollowLink.split('#').map(e => e.split('*')).filter(p => p.length === 2);
                    if (entries.length > 0) {
                        output.append('Team follow\n', gray);
                        for (const [search, exit] of entries) {
                            row(`  ${search}`, exit);
                        }
                    }
                }

                let gpsEntries: { gps_string_lines: string[]; room_id: number; area_name?: string }[] = [];
                if (userData.gps) {
                    try { gpsEntries = JSON.parse(userData.gps); } catch { /* ignore */ }
                }
                if (gpsEntries.length > 0) {
                    output.append(`GPS (${gpsEntries.length})\n`, gray);
                    for (const gps of gpsEntries) {
                        row('  room_id', String(gps.room_id));
                        for (const line of gps.gps_string_lines) {
                            output.append(`    ${line}\n`);
                        }
                        if (gps.area_name) row('  area', gps.area_name);
                    }
                }

                const description = userData.description;
                if (description) {
                    output.append('Opis\n', gray);
                    output.append(`  ${description.split('\\n').join('\n  ')}\n`);
                }

                if ((userData.walk_pre_cmd != null && userData.walk_pre_cmd !== '') || (userData.walk_post_cmd != null && userData.walk_post_cmd !== '')) {
                    output.append('Komendy chodzenia\n', gray);
                    if (userData.walk_pre_cmd != null && userData.walk_pre_cmd !== '') row('  pre', userData.walk_pre_cmd);
                    if (userData.walk_post_cmd != null && userData.walk_post_cmd !== '') row('  post', userData.walk_post_cmd);
                }

                const KNOWN_KEYS = new Set(['note', 'description', 'dir_bind', 'bind', 'drinkable', 'gps', 'team_follow_link', 'walk_pre_cmd', 'walk_post_cmd']);
                const otherEntries = Object.entries(userData).filter(([key]) => !KNOWN_KEYS.has(key));
                if (otherEntries.length > 0) {
                    output.append('Dane uzytkownika\n', gray);
                    for (const [key, value] of otherEntries) {
                        row(`  ${key}`, value);
                    }
                }

                client.println(output);
            }
        },
        {
            pattern: /^\/note$/i,
            callback: () => {
                const room = client.Map.currentRoom as SearchableRoom | undefined;
                if (room) {
                    client.sendEvent('locationNote.open', { roomId: room.id });
                } else {
                    client.println('Brak aktualnej lokalizacji.');
                }
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

                        // Build line as separate buffer to ensure correct link positioning
                        const lineBuffer = new AnsiAwareBuffer();
                        lineBuffer.append(paddedId + ' ');
                        const linkStart = lineBuffer.length;
                        lineBuffer.append(roomText);
                        lineBuffer.createLink([linkStart, linkStart + roomText.length], {
                            onClick: () => {
                                client.sendEvent('leadTo', match.id);
                            },
                            title: `Kliknij aby prowadzić do: ${match.name}`
                        });

                        lineBuffer.append(' ');
                        const showStart = lineBuffer.length;
                        lineBuffer.append('[ pokaz ]');
                        lineBuffer.createLink([showStart, showStart + '[ pokaz ]'.length], {
                            onClick: () => {
                                eventBus.emit('staticmap.popup.open', { roomId: match.id });
                            },
                            title: `Pokaz na mapie: ${match.name}`
                        });

                        output.appendBuffer(lineBuffer);
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

function printTransportInstructions(
    client: Client,
    segments: TransportPathSegment[],
    totalWalkRooms: number,
    totalTransportSeconds: number,
    aggressive = false,
) {
    const reader = client.Map.tryGetMapReader();
    const labelForRoom = (id: number): string => {
        const room = reader?.getRoom(id) as SearchableRoom | undefined;
        if (!room) return `#${id}`;
        const area = reader && typeof (reader as any).getArea === 'function' ? (reader as any).getArea(room.area) : null;
        const areaName = area?.getAreaName?.() ?? '';
        const name = room.name && room.name !== String(room.id) ? room.name : '';
        if (name && areaName) return `#${id} ${name} (${areaName})`;
        if (areaName) return `#${id} ${areaName}`;
        return `#${id}`;
    };

    const gray = { foreground: { space: 'hex' as const, color: '#888888' } };
    const white = { foreground: { space: 'hex' as const, color: '#dddddd' } };
    const yellow = { foreground: { space: 'hex' as const, color: '#ffd166' } };

    const output = new AnsiAwareBuffer();
    const transportCount = segments.filter(s => s.kind === 'transport').length;
    const summaryParts: string[] = [];
    summaryParts.push(`${totalWalkRooms} pokoi pieszo`);
    if (transportCount > 0) {
        const mins = Math.round(totalTransportSeconds / 60);
        summaryParts.push(`${transportCount} ${transportCount === 1 ? 'przesiadka' : 'przesiadki'} (~${mins > 0 ? mins + ' min' : totalTransportSeconds + 's'})`);
    }
    const header = aggressive ? 'Trasa z transportem (min. pieszo)' : 'Trasa z transportem';
    output.append(`${header}: ${summaryParts.join(', ')}\n`, gray);

    let stepNum = 1;
    for (const seg of segments) {
        if (seg.kind === 'walk') {
            const from = seg.rooms[0];
            const to = seg.rooms[seg.rooms.length - 1];
            const hops = seg.rooms.length - 1;
            output.append(`${stepNum++}. `, gray);
            output.append(`Idz `, white);
            output.append(`${labelForRoom(from)}`, gray);
            output.append(` → `, white);
            output.append(`${labelForRoom(to)}`, white);
            output.append(` (${hops} ${hops === 1 ? 'pokoj' : 'pokoi'})\n`, gray);
        } else {
            output.append(`${stepNum++}. `, gray);
            output.append(`Wsiadz: `, yellow);
            output.append(`${seg.transportName}`, white);
            if (seg.label) {
                output.append(` → ${seg.label}`, white);
            }
            const timeNote = typeof seg.timeSeconds === 'number' ? ` (~${seg.timeSeconds}s)` : '';
            output.append(`${timeNote}\n`, gray);
            if (seg.viaStops && seg.viaStops.length > 0) {
                const viaLabels = seg.viaStops.map(v => v.label ?? `#${v.roomId}`).join(', ');
                output.append(`   przez: `, gray);
                output.append(`${viaLabels}\n`, white);
            }
            output.append(`   wysiadz na: `, gray);
            output.append(`${labelForRoom(seg.toRoomId)}\n`, white);
        }
    }
    output.append(`Anuluj: `, gray);
    output.append(`/prowadz-\n`, white);
    client.println(output);
}
