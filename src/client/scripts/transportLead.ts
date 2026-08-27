import type Client from "../Client";
import {AnsiAwareBuffer} from "@client/ansi/FormatState";
import type {RouteSegment} from "@shared/map/transportPathFinder";

type RoomLike = {
    id: number;
    area: number;
    name?: string;
};

/**
 * Spells out a route that cannot be followed by watching the map alone: which wagon to leave
 * where, which ship to board, where to get off. The routing itself happens in the map helper; this
 * only reads the plan out.
 */
export default function initRouteInstructions(client: Client) {
    client.on('routePlanned', plan => {
        printRouteInstructions(client, plan.segments, plan);
    });
}

function printRouteInstructions(
    client: Client,
    segments: RouteSegment[],
    plan: { viaFallback: boolean; aggressive: boolean; driving: boolean },
) {
    const reader = client.Map.tryGetMapReader();
    const labelForRoom = (id: number): string => {
        const room = reader?.getRoom(id) as RoomLike | undefined;
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

    const roomsIn = (kind: 'walk' | 'drive') => segments.reduce(
        (total, segment) => segment.kind === kind ? total + segment.rooms.length - 1 : total,
        0,
    );
    const totalWalkRooms = roomsIn('walk');
    const totalDriveRooms = roomsIn('drive');
    const transportCount = segments.filter(s => s.kind === 'transport').length;
    const totalTransportSeconds = segments.reduce(
        (total, segment) => segment.kind === 'transport' && typeof segment.timeSeconds === 'number'
            ? total + segment.timeSeconds
            : total,
        0,
    );

    const output = new AnsiAwareBuffer();
    const summaryParts: string[] = [];
    if (totalDriveRooms > 0) summaryParts.push(`${totalDriveRooms} pokoi wozem`);
    summaryParts.push(`${totalWalkRooms} pokoi pieszo`);
    if (transportCount > 0) {
        const mins = Math.round(totalTransportSeconds / 60);
        summaryParts.push(`${transportCount} ${transportCount === 1 ? 'przesiadka' : 'przesiadki'} (~${mins > 0 ? mins + ' min' : totalTransportSeconds + 's'})`);
    }
    // Falling back while driving means neither the wagon nor walking got there, which is not the
    // same thing as there being no way on foot.
    const header = plan.viaFallback
        ? (plan.driving ? 'Brak drogi wozem ani pieszo - trasa z transportem' : 'Brak drogi pieszo - trasa z transportem')
        : (plan.aggressive ? 'Trasa z transportem (min. pieszo)' : 'Trasa z transportem');
    output.append(`${header}: ${summaryParts.join(', ')}\n`, gray);

    // The wagon rides along, so it is left at the end of the last leg made on it - which may be a
    // crossing rather than a drive - and only when the journey goes on without it.
    let lastOnWagon = -1;
    segments.forEach((seg, index) => {
        if (seg.kind === 'drive' || (seg.kind === 'transport' && seg.withWagon)) lastOnWagon = index;
    });
    const leaveWagonAfter = lastOnWagon >= 0 && lastOnWagon < segments.length - 1 ? lastOnWagon : -1;
    const endOf = (seg: RouteSegment) => seg.kind === 'transport' ? seg.toRoomId : seg.rooms[seg.rooms.length - 1];

    let stepNum = 1;
    for (const [index, seg] of segments.entries()) {
        if (seg.kind === 'walk' || seg.kind === 'drive') {
            const from = seg.rooms[0];
            const to = seg.rooms[seg.rooms.length - 1];
            const hops = seg.rooms.length - 1;
            output.append(`${stepNum++}. `, gray);
            output.append(seg.kind === 'drive' ? `Jedz wozem ` : `Idz `, white);
            output.append(`${labelForRoom(from)}`, gray);
            output.append(` → `, white);
            output.append(`${labelForRoom(to)}`, white);
            output.append(` (${hops} ${hops === 1 ? 'pokoj' : 'pokoi'})\n`, gray);
        } else {
            output.append(`${stepNum++}. `, gray);
            output.append(seg.withWagon ? `Wsiadz z wozem: ` : `Wsiadz: `, yellow);
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
        if (index === leaveWagonAfter) {
            output.append(`   zostaw woz na: `, yellow);
            output.append(`${labelForRoom(endOf(seg))}\n`, white);
        }
    }
    output.append(`Anuluj: `, gray);
    output.append(`/prowadz-\n`, white);
    client.println(output);
}
