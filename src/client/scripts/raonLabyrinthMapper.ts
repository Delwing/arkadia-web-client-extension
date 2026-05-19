import Client from "../Client";
import {getLongDir, isDirection, polishToEnglish} from "@shared/map/directions";
import {stripPolishCharacters} from "../stripPolishCharacters";
import {parseExitString} from "./shortExits";
import {gmcp} from "../gmcp";
import {colorString, createColorFormat} from "@modules/core/Colors";
import {AnsiAwareBuffer} from "../ansi/FormatState";
import eventBus from "@modules/core/eventBus";
import {PathFinder} from "mudlet-map-renderer";

const ENTRY_ROOM_ID = 23147;
const ENTRY_UP_TARGET = 23146;

const POOL_ROOM_IDS: number[] = [
    23148, 24425, 24426, 24427, 24428, 24429, 24430, 24431,
    24432, 24433, 24434, 24437, 24438, 24439, 24440, 24441,
    24442, 24443, 24444, 24445,
];

const SPARE_ROOM_IDS: number[] = [24447, 24448, 24449];
const CHAPEL_ROOM_ID = 24446;

const ALL_ROOM_IDS = [ENTRY_ROOM_ID, ...POOL_ROOM_IDS, ...SPARE_ROOM_IDS, CHAPEL_ROOM_ID];

const LABYRINTH_EXIT_PATTERN = /^(?:Jest|Sa) tutaj .* widoczn(?:e|ych) wyjsc(?:|ia|ie): (.*)\.$/;

type RoomType = 'sarcophagus' | 'griffins' | 'figurines' | 'altar' | 'bowl' | 'chapel' | 'normal';

const ROOM_TYPE_KEYWORDS: { type: RoomType; keywords: string[] }[] = [
    {type: 'sarcophagus', keywords: ['sarkofag', 'grobowiec', 'grobowcu']},
    {type: 'griffins', keywords: ['gryfy']},
    {type: 'figurines', keywords: ['figurki']},
    {type: 'altar', keywords: ['oltarz']},
    {type: 'bowl', keywords: ['misy']},
    {type: 'chapel', keywords: ['kaplica', 'rzedy law']},
];

const ROOM_TYPE_CHAR: Record<RoomType, string> = {
    sarcophagus: 'S',
    griffins: 'G',
    figurines: 'F',
    altar: 'O',
    bowl: 'M',
    chapel: 'K',
    normal: '',
};

const ROOM_TYPE_LABEL: Record<RoomType, string> = {
    sarcophagus: 'SARKOFAG',
    griffins: 'GRYFY',
    figurines: 'FIGURKI',
    altar: 'OLTARZ',
    bowl: 'MISA',
    chapel: 'CEREMONIALNA',
    normal: '',
};

const ROOM_TYPE_ENV: Record<RoomType, number> = {
    sarcophagus: 124,  // [175,0,0] dark red
    griffins: 220,     // [255,215,0] gold
    altar: 270,        // [0,255,255] cyan
    figurines: 129,    // [175,0,255] purple
    bowl: 39,          // [0,175,255] blue
    chapel: 0,         // keeps original env
    normal: 272,       // [128,128,128] gray
};

const COLOR_KNOWN = createColorFormat("#00CC00");
const COLOR_UNKNOWN = createColorFormat("#CC0000");
const COLOR_TYPE = createColorFormat("#FFD700");

const GRID_SPACING = 2;

// Direction deltas for room placement and custom lines (positive y = south on map)
const DIRECTION_DELTA: Record<string, { x: number; y: number }> = {
    north: {x: 0, y: -1}, south: {x: 0, y: 1},
    east: {x: 1, y: 0}, west: {x: -1, y: 0},
    northeast: {x: 1, y: -1}, northwest: {x: -1, y: -1},
    southeast: {x: 1, y: 1}, southwest: {x: -1, y: 1},
};
const SHORT_DIR: Record<string, string> = {
    north: 'n', south: 's', east: 'e', west: 'w',
    northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
};
const CUSTOM_LINE_SEG = 0.8;
const CUSTOM_LINE_ATTR: MapData.LineAttribute = {
    color: {r: 200, g: 200, b: 200, alpha: 255},
    style: 'solid line',
    arrow: false,
};

const englishToPolish: Record<string, string> = {};
for (const [pl, en] of Object.entries(polishToEnglish)) {
    if (!englishToPolish[en]) englishToPolish[en] = pl;
}

function detectRoomType(fingerprint: string): RoomType {
    const lower = fingerprint.toLowerCase();
    for (const {type, keywords} of ROOM_TYPE_KEYWORDS) {
        for (const kw of keywords) {
            if (lower.includes(kw)) return type;
        }
    }
    return 'normal';
}

function extractDirection(command: string): string | null {
    let cmd = stripPolishCharacters(command);
    if (cmd.startsWith('przemknij z druzyna ')) cmd = cmd.substring(20);
    else if (cmd.startsWith('przemknij ')) cmd = cmd.substring(10);
    else if (cmd.startsWith('jedz na ')) cmd = cmd.substring(8);
    if (isDirection(cmd)) return getLongDir(cmd);
    return null;
}

function directionToStubNumber(dir: string): number {
    const map: Record<string, number> = {
        north: 1, northeast: 2, northwest: 3,
        east: 4, west: 5,
        south: 6, southeast: 7, southwest: 8,
        up: 9, down: 10,
    };
    return map[dir] ?? 0;
}

interface RaonRoom {
    fingerprint: string;
    mapRoomId: number;
    roomType: RoomType;
    exits: Map<string, string | null>; // direction -> target fingerprint (null = unexplored)
    visitCount: number;
    doorDirection?: string; // direction of masywne drzwi (leads to chapel)
}

interface SavedRoomData {
    ref: MapData.Room;
    exits: Record<string, number>;
    stubs: number[];
    env: number;
    roomChar: string;
    customLines: Record<string, MapData.Line>;
    x: number;
    y: number;
}

type CaptureState =
    | { phase: 'idle' }
    | { phase: 'capturing'; lines: string[]; direction: string | null; sourceFingerprint: string | null; doorDirection: string | null; teleport?: boolean };

const reverseDirection: Record<string, string> = {
    north: "south", south: "north", east: "west", west: "east",
    northeast: "southwest", southwest: "northeast",
    northwest: "southeast", southeast: "northwest",
    up: "down", down: "up",
};

let isActive = false;
let isInitialized = false; // true after first activation (rooms snapshot taken)
let captureState: CaptureState = {phase: 'idle'};
let currentFingerprint: string | null = null;
let pendingLook = false;
let savedBriefValue: unknown = undefined;
let chaliceSet = false;
let figurinesSet = false;
let hasTeleportedRooms = false;
const clearedSarcophagi = new Set<string>(); // fingerprints of sarcophagus rooms where all enemies killed
const figurineEyes: Record<string, string> = {}; // smok/gryf/jednorozec -> eye color

const rooms = new Map<string, RaonRoom>();
let availablePool: number[] = [];
let availableSpares: number[] = [];
const savedRoomData = new Map<number, SavedRoomData>();
const occupiedPositions = new Set<string>();
let entryX = 0;
let entryY = 0;


function claimNextRoom(): number | null {
    return availablePool.shift() ?? availableSpares.shift() ?? null;
}

function rebuildAndRender(client: Client, renderRoomId?: number) {
    const reader = client.Map.getMapReader() as any;
    const readerRooms: Record<number, MapData.Room> = reader.rooms;
    const areas: Record<number, any> = reader.areas;
    const affectedAreas = new Set<number>();

    for (const roomId of ALL_ROOM_IDS) {
        const room = readerRooms[roomId];
        if (room) affectedAreas.add(room.area);
    }

    for (const areaId of affectedAreas) {
        const area = areas[areaId];
        if (!area) continue;
        area.planes = area.createPlanes();
        area.exits = new Map();
        area.createExits();
        area.markDirty();
    }

    (client.Map as any).pathFinder = new PathFinder(client.Map.getMapReader() as any);

    const roomId = renderRoomId ?? (currentFingerprint ? rooms.get(currentFingerprint)?.mapRoomId : undefined);
    if (roomId !== undefined) {
        client.Map.renderRoomById(roomId);
    }
    client.Map.refreshPosition = false;
    eventBus.emit('mapDataChanged');
}

function updateMapRoom(client: Client, room: RaonRoom) {
    const reader = client.Map.getMapReader() as any;
    const readerRooms: Record<number, MapData.Room> = reader.rooms;
    const mapRoom = readerRooms[room.mapRoomId];
    if (!mapRoom) return;

    const newExits: Record<string, number> = {};
    const stubs: number[] = [];

    for (const [dir, targetFingerprint] of room.exits) {
        if (targetFingerprint === '__entry__') {
            newExits[dir] = ENTRY_ROOM_ID;
        } else if (targetFingerprint) {
            const targetRoom = rooms.get(targetFingerprint);
            if (targetRoom) {
                newExits[dir] = targetRoom.mapRoomId;
            } else {
                const stub = directionToStubNumber(dir);
                if (stub) stubs.push(stub);
            }
        } else {
            const stub = directionToStubNumber(dir);
            if (stub) stubs.push(stub);
        }
    }

    mapRoom.exits = newExits as Record<MapData.direction, number>;
    mapRoom.stubs = stubs;
}

function getRoomIndex(fingerprint: string): number {
    let i = 0;
    for (const key of rooms.keys()) {
        i++;
        if (key === fingerprint) return i;
    }
    return 0;
}

function printRoomStatus(client: Client, fingerprint: string) {
    const room = rooms.get(fingerprint);
    if (!room) return;

    const roomIndex = getRoomIndex(fingerprint);
    const buf = new AnsiAwareBuffer(`[Raon] Pokoj ${roomIndex}/${rooms.size}`);

    const typeLabel = ROOM_TYPE_LABEL[room.roomType];
    if (typeLabel) {
        buf.append(" ");
        const done = (room.roomType === 'altar' && chaliceSet) || (room.roomType === 'figurines' && figurinesSet) || (room.roomType === 'sarcophagus' && clearedSarcophagi.has(fingerprint));
        const pending = (room.roomType === 'altar' && !chaliceSet) || (room.roomType === 'figurines' && !figurinesSet) || (room.roomType === 'sarcophagus' && !clearedSarcophagi.has(fingerprint));
        const labelColor = done ? COLOR_KNOWN : pending ? COLOR_UNKNOWN : COLOR_TYPE;
        const suffix = done ? ' ✓' : pending ? ' ✗' : '';
        buf.appendBuffer(colorString(`[${typeLabel}${suffix}]`, labelColor));
    }

    buf.append(" | ");
    let first = true;
    for (const [dir, target] of room.exits) {
        if (!first) buf.append(", ");
        first = false;
        const polishDir = englishToPolish[dir] ?? dir;
        if (target === '__entry__') {
            buf.appendBuffer(colorString(`${polishDir} [wyjscie]`, COLOR_KNOWN));
        } else if (target) {
            buf.appendBuffer(colorString(`${polishDir} [${getRoomIndex(target)}]`, COLOR_KNOWN));
        } else {
            buf.appendBuffer(colorString(polishDir, COLOR_UNKNOWN));
        }
    }
    client.println(buf);
}

function updateAllRoomChars(client: Client) {
    const reader = client.Map.getMapReader() as any;
    const readerRooms: Record<number, MapData.Room> = reader.rooms;

    let index = 0;
    for (const [, room] of rooms) {
        index++;
        const mapRoom = readerRooms[room.mapRoomId];
        if (!mapRoom) continue;
        const typeChar = ROOM_TYPE_CHAR[room.roomType];
        mapRoom.roomChar = typeChar || String(index);
    }
}

function buildCustomLines(client: Client) {
    const reader = client.Map.getMapReader() as any;
    const readerRooms: Record<number, MapData.Room> = reader.rooms;

    // Clear custom lines for all labyrinth rooms
    for (const [, room] of rooms) {
        const mapRoom = readerRooms[room.mapRoomId];
        if (mapRoom) mapRoom.customLines = {} as Record<string, MapData.Line>;
    }
    const entryMapRoom: MapData.Room | undefined = readerRooms[ENTRY_ROOM_ID];
    if (entryMapRoom) entryMapRoom.customLines = {} as Record<string, MapData.Line>;

    for (const [, room] of rooms) {
        const sourceMap = readerRooms[room.mapRoomId];
        if (!sourceMap) continue;

        for (const [dir, targetFP] of room.exits) {
            if (!targetFP || !DIRECTION_DELTA[dir]) continue;

            let targetMap: MapData.Room | undefined;
            let returnDir: string | undefined;

            if (targetFP === '__entry__') {
                targetMap = readerRooms[ENTRY_ROOM_ID];
                returnDir = reverseDirection[dir];
            } else {
                const targetRoom = rooms.get(targetFP);
                if (!targetRoom) continue;
                targetMap = readerRooms[targetRoom.mapRoomId];
                for (const [tDir, tFP] of targetRoom.exits) {
                    if (tFP === room.fingerprint) { returnDir = tDir; break; }
                }
                if (!returnDir) returnDir = reverseDirection[dir];
            }

            if (!targetMap || !returnDir || !DIRECTION_DELTA[returnDir]) continue;

            const sx = sourceMap.x, sy = sourceMap.y;
            const tx = targetMap.x, ty = targetMap.y;
            const d1 = DIRECTION_DELTA[dir];
            const d2 = DIRECTION_DELTA[returnDir];
            if (!d2) continue;

            const shortDir = SHORT_DIR[dir];
            if (!shortDir) continue;

            sourceMap.customLines[shortDir] = {
                points: [
                    {x: sx + d1.x * CUSTOM_LINE_SEG, y: -(sy + d1.y * CUSTOM_LINE_SEG)},
                    {x: tx + d2.x * CUSTOM_LINE_SEG, y: -(ty + d2.y * CUSTOM_LINE_SEG)},
                    {x: tx, y: -ty},
                ],
                attributes: CUSTOM_LINE_ATTR,
            };
        }
    }

    // Entry room exits into labyrinth
    if (entryMapRoom) {
        for (const [dir, targetId] of Object.entries(entryMapRoom.exits)) {
            if (targetId === ENTRY_UP_TARGET) continue;
            if (!DIRECTION_DELTA[dir]) continue;
            const targetMap = readerRooms[targetId as unknown as number];
            if (!targetMap) continue;

            let returnDir = reverseDirection[dir];
            for (const [, room] of rooms) {
                if (room.mapRoomId === (targetId as unknown as number)) {
                    for (const [tDir, tFP] of room.exits) {
                        if (tFP === '__entry__') { returnDir = tDir; break; }
                    }
                    break;
                }
            }

            const d1 = DIRECTION_DELTA[dir];
            const d2 = DIRECTION_DELTA[returnDir];
            if (!d1 || !d2) continue;
            const shortDir = SHORT_DIR[dir];
            if (!shortDir) continue;

            const sx = entryMapRoom.x, sy = entryMapRoom.y;
            const tx = targetMap.x, ty = targetMap.y;

            entryMapRoom.customLines[shortDir] = {
                points: [
                    {x: sx + d1.x * CUSTOM_LINE_SEG, y: -(sy + d1.y * CUSTOM_LINE_SEG)},
                    {x: tx + d2.x * CUSTOM_LINE_SEG, y: -(ty + d2.y * CUSTOM_LINE_SEG)},
                    {x: tx, y: -ty},
                ],
                attributes: CUSTOM_LINE_ATTR,
            };
        }
    }
}

function isOnEntryLine(x: number, y: number): boolean {
    return x === entryX && y >= entryY && y <= entryY + 20;
}

function findFreePosition(baseX: number, baseY: number): { x: number; y: number } {
    if (!occupiedPositions.has(`${baseX}:${baseY}`) && !isOnEntryLine(baseX, baseY)) {
        return {x: baseX, y: baseY};
    }
    for (let radius = 1; radius <= 10; radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
                const nx = baseX + dx * GRID_SPACING;
                const ny = baseY + dy * GRID_SPACING;
                if (!occupiedPositions.has(`${nx}:${ny}`) && !isOnEntryLine(nx, ny)) {
                    return {x: nx, y: ny};
                }
            }
        }
    }
    return {x: baseX, y: baseY};
}

function repositionAllRooms(client: Client) {
    const reader = client.Map.getMapReader() as any;
    const readerRooms: Record<number, MapData.Room> = reader.rooms;

    occupiedPositions.clear();
    occupiedPositions.add(`${entryX}:${entryY}`);

    const visited = new Set<string>();
    const queue: string[] = [];

    // Seed BFS with rooms directly connected to entry
    for (const [fp, room] of rooms) {
        for (const [, target] of room.exits) {
            if (target !== '__entry__' || visited.has(fp)) continue;
            visited.add(fp);
            const mapRoom = readerRooms[room.mapRoomId];
            if (!mapRoom) continue;
            // First entry-connected room placed 20 units below entry (matching initial placement)
            const pos = queue.length === 0
                ? {x: entryX, y: entryY + 20}
                : findFreePosition(entryX, entryY + 20);
            mapRoom.x = pos.x;
            mapRoom.y = pos.y;
            occupiedPositions.add(`${pos.x}:${pos.y}`);
            queue.push(fp);
        }
    }

    // BFS — place each room relative to its parent in the direction of the exit
    while (queue.length > 0) {
        const curFP = queue.shift()!;
        const curRoom = rooms.get(curFP)!;
        const curMap = readerRooms[curRoom.mapRoomId];
        if (!curMap) continue;

        for (const [dir, targetFP] of curRoom.exits) {
            if (!targetFP || targetFP === '__entry__' || visited.has(targetFP)) continue;
            const targetRoom = rooms.get(targetFP);
            if (!targetRoom) continue;
            const targetMap = readerRooms[targetRoom.mapRoomId];
            if (!targetMap) continue;
            const delta = DIRECTION_DELTA[dir];
            if (!delta) continue;

            visited.add(targetFP);
            const pos = findFreePosition(
                curMap.x + delta.x * GRID_SPACING,
                curMap.y + delta.y * GRID_SPACING,
            );
            targetMap.x = pos.x;
            targetMap.y = pos.y;
            occupiedPositions.add(`${pos.x}:${pos.y}`);
            queue.push(targetFP);
        }
    }
}

const CHAPEL_PLACEHOLDER_FP = '__chapel_placeholder__';

function getChapelFingerprint(): string | null {
    for (const [fp, r] of rooms) {
        if (r.roomType === 'chapel') return fp;
    }
    return null;
}

function createChapelPlaceholder(client: Client, sourceRoom: RaonRoom, doorDirection: string) {
    const reader = client.Map.getMapReader() as any;
    const readerRooms: Record<number, MapData.Room> = reader.rooms;

    const saved = savedRoomData.get(CHAPEL_ROOM_ID);
    if (!saved) return;
    const mapRoom = saved.ref;

    mapRoom.exits = {} as Record<MapData.direction, number>;
    mapRoom.stubs = [];
    mapRoom.roomChar = ROOM_TYPE_CHAR['chapel'];
    mapRoom.customLines = {} as Record<string, MapData.Line>;
    mapRoom.env = saved.env;

    // Position chapel in the door direction from source room
    const srcMap = readerRooms[sourceRoom.mapRoomId];
    const delta = DIRECTION_DELTA[doorDirection];
    if (srcMap && delta) {
        const pos = findFreePosition(srcMap.x + delta.x * GRID_SPACING, srcMap.y + delta.y * GRID_SPACING);
        mapRoom.x = pos.x;
        mapRoom.y = pos.y;
        occupiedPositions.add(`${pos.x}:${pos.y}`);
    }

    // Add to map
    const hashes: Record<string, number> = (client.Map as any).hashes;
    readerRooms[CHAPEL_ROOM_ID] = mapRoom;
    hashes[mapRoom.hash] = CHAPEL_ROOM_ID;
    reader.areas[mapRoom.area].area.rooms.push(mapRoom);

    const chapel: RaonRoom = {
        fingerprint: CHAPEL_PLACEHOLDER_FP,
        mapRoomId: CHAPEL_ROOM_ID,
        roomType: 'chapel',
        exits: new Map(),
        visitCount: 0,
    };
    rooms.set(CHAPEL_PLACEHOLDER_FP, chapel);
}

function finishCapture(client: Client, descriptionLines: string[], exitString: string, direction: string | null, sourceFingerprint: string | null, doorDirection: string | null, teleport = false) {
    const fingerprint = descriptionLines.join('\n').trim();
    if (!fingerprint) return;

    // Skip capture of entry room itself (only south from entry leads into labyrinth)
    if (!sourceFingerprint && direction && direction !== 'south') {
        return;
    }

    // Detect return to entry room (source already links this direction to entry)
    if (direction && sourceFingerprint) {
        const sourceRoom = rooms.get(sourceFingerprint);
        if (sourceRoom && sourceRoom.exits.get(direction) === '__entry__') {
            currentFingerprint = null;
            rebuildAndRender(client, ENTRY_ROOM_ID);
            return;
        }
    }

    const exitDirs = parseExitString(exitString).map(e => getLongDir(e));
    const roomType = detectRoomType(fingerprint);

    let room = rooms.get(fingerprint);
    const isNew = !room;

    // Altar room changes description — alias new fingerprint to existing altar room
    if (isNew && roomType === 'altar') {
        for (const [, existing] of rooms) {
            if (existing.roomType === 'altar') {
                room = existing;
                rooms.set(fingerprint, room);
                break;
            }
        }
    }

    // Chapel placeholder — replace with real fingerprint on first visit
    if (isNew && roomType === 'chapel') {
        const placeholder = rooms.get(CHAPEL_PLACEHOLDER_FP);
        if (placeholder) {
            rooms.delete(CHAPEL_PLACEHOLDER_FP);
            placeholder.fingerprint = fingerprint;
            room = placeholder;
            rooms.set(fingerprint, room);
        }
    }

    if (!room) {
        let mapRoomId: number | null;
        if (roomType === 'chapel') {
            mapRoomId = CHAPEL_ROOM_ID;
        } else {
            mapRoomId = claimNextRoom();
        }
        if (mapRoomId === null) {
            client.println("[Raon] Brak dostepnych pokojow w puli!");
            return;
        }
        room = {
            fingerprint,
            mapRoomId,
            roomType,
            exits: new Map(),
            visitCount: 0,
        };
        rooms.set(fingerprint, room);
        if (teleport) hasTeleportedRooms = true;

        const saved = savedRoomData.get(mapRoomId);
        if (!saved) return;
        const mapRoom = saved.ref;

        // Clear the claimed room
        mapRoom.exits = {} as Record<MapData.direction, number>;
        mapRoom.stubs = [];
        mapRoom.roomChar = '';
        mapRoom.customLines = {} as Record<string, MapData.Line>;

        // Position room based on direction from source
        const reader = client.Map.getMapReader() as any;
        const readerRooms: Record<number, MapData.Room> = reader.rooms;
        if (direction) {
            const delta = DIRECTION_DELTA[direction];
            if (delta) {
                let srcX: number | undefined, srcY: number | undefined;
                if (sourceFingerprint) {
                    const src = rooms.get(sourceFingerprint);
                    if (src) {
                        const srcMap = readerRooms[src.mapRoomId];
                        if (srcMap) { srcX = srcMap.x; srcY = srcMap.y; }
                    }
                } else {
                    // First room: place 20 units below entry
                    const entryMap = readerRooms[ENTRY_ROOM_ID];
                    if (entryMap) { srcX = entryMap.x; srcY = entryMap.y + 20; }
                }
                if (srcX !== undefined && srcY !== undefined) {
                    const pos = sourceFingerprint
                        ? findFreePosition(srcX + delta.x * GRID_SPACING, srcY + delta.y * GRID_SPACING)
                        : {x: srcX, y: srcY};
                    mapRoom.x = pos.x;
                    mapRoom.y = pos.y;
                    occupiedPositions.add(`${pos.x}:${pos.y}`);
                }
            }
        } else if (sourceFingerprint) {
            // Teleport: place near source room with offset
            const src = rooms.get(sourceFingerprint);
            if (src) {
                const srcMap = readerRooms[src.mapRoomId];
                if (srcMap) {
                    const pos = findFreePosition(srcMap.x + GRID_SPACING * 3, srcMap.y + GRID_SPACING * 3);
                    mapRoom.x = pos.x;
                    mapRoom.y = pos.y;
                    occupiedPositions.add(`${pos.x}:${pos.y}`);
                }
            }
        }

        // Set env color based on room type
        if (roomType === 'chapel') {
            mapRoom.env = saved.env;
        } else {
            mapRoom.env = ROOM_TYPE_ENV[roomType];
        }

        // Re-add room to map
        const hashes: Record<string, number> = (client.Map as any).hashes;
        readerRooms[mapRoomId] = mapRoom;
        hashes[mapRoom.hash] = mapRoomId;
        reader.areas[mapRoom.area].area.rooms.push(mapRoom);
    }

    room!.visitCount++;

    // Register exits (preserve existing known targets)
    for (const dir of exitDirs) {
        if (!room!.exits.has(dir)) {
            room!.exits.set(dir, null);
        }
    }

    // Record bidirectional edge from source room
    if (direction && sourceFingerprint) {
        const sourceRoom = rooms.get(sourceFingerprint);
        if (sourceRoom) {
            sourceRoom.exits.set(direction, fingerprint);
        }
        // Reverse exit back to source
        const reverse = reverseDirection[direction];
        if (reverse) {
            room!.exits.set(reverse, sourceFingerprint);
        }
    }

    // First room: link entry room <-> this room
    if (!sourceFingerprint && direction) {
        const reader = client.Map.getMapReader() as any;
        const entryMapRoom: MapData.Room = reader.rooms[ENTRY_ROOM_ID];
        if (entryMapRoom) {
            entryMapRoom.exits[direction as MapData.direction] = room!.mapRoomId;
            entryMapRoom.stubs = entryMapRoom.stubs.filter((s: number) => s !== directionToStubNumber(direction));
        }
        // Reverse exit back to entry room
        const reverse = reverseDirection[direction];
        if (reverse) {
            room!.exits.set(reverse, '__entry__');
        }
    }

    // Store door direction on room
    if (doorDirection) {
        room!.doorDirection = doorDirection;
    }

    // Create chapel placeholder on first door detection
    if (doorDirection && !getChapelFingerprint()) {
        createChapelPlaceholder(client, room!, doorDirection);
    }

    // Connect door rooms <-> chapel bidirectionally
    const chapelFP = getChapelFingerprint();
    if (chapelFP) {
        const chapel = rooms.get(chapelFP)!;
        for (const [, r] of rooms) {
            if (!r.doorDirection || r.roomType === 'chapel') continue;
            r.exits.set(r.doorDirection, chapelFP);
            const reverse = reverseDirection[r.doorDirection];
            if (reverse) {
                chapel.exits.set(reverse, r.fingerprint);
            }
        }
    }

    // After edges are finalized, check if teleported rooms just merged with main graph
    if (hasTeleportedRooms && !teleport) {
        const reachable = new Set<string>();
        const bfsQ: string[] = [];
        for (const [fp, r] of rooms) {
            for (const [, target] of r.exits) {
                if (target === '__entry__' && !reachable.has(fp)) {
                    reachable.add(fp);
                    bfsQ.push(fp);
                }
            }
        }
        while (bfsQ.length > 0) {
            const fp = bfsQ.shift()!;
            const r = rooms.get(fp);
            if (!r) continue;
            for (const [, target] of r.exits) {
                if (target && target !== '__entry__' && rooms.has(target) && !reachable.has(target)) {
                    reachable.add(target);
                    bfsQ.push(target);
                }
            }
        }
        if (reachable.size === rooms.size) {
            repositionAllRooms(client);
            hasTeleportedRooms = false;
            client.println(colorString("[Raon] Polaczono z glowna mapa - pozycje pokojow przeliczone.", COLOR_TYPE));
        }
    }

    currentFingerprint = fingerprint;

    // Update ALL discovered rooms' map exits to ensure full bidirectional consistency
    for (const [, r] of rooms) {
        updateMapRoom(client, r);
    }
    updateAllRoomChars(client);
    buildCustomLines(client);
    rebuildAndRender(client);

    printRoomStatus(client, fingerprint);

    // Functional binds for special rooms
    if (room!.roomType === 'griffins') {
        client.FunctionalBind.set("ob gryfy;ob szczeliny;ob wglebienia;ob mozaike;wcisnij kafelek");
    } else if (room!.roomType === 'bowl') {
        client.FunctionalBind.set("ob rubin;przekrec rubin");
    } else if (room!.roomType === 'altar' && !chaliceSet) {
        client.FunctionalBind.set("postaw kielich na oltarzu");
    } else if (room!.roomType === 'figurines' && !figurinesSet && figurineEyes['smok'] && figurineEyes['gryf'] && figurineEyes['jednorozec']) {
        client.FunctionalBind.set(`przesun figurke smoka na ${figurineEyes['smok']} pole;przesun figurke jednorozca na ${figurineEyes['jednorozec']} pole;przesun figurke gryfa na ${figurineEyes['gryf']} pole`);
    }
}

function initRooms(client: Client) {
    const reader = client.Map.getMapReader() as any;
    const readerRooms: Record<number, MapData.Room> = reader.rooms;
    const hashes: Record<string, number> = (client.Map as any).hashes;

    // Snapshot all rooms, then remove pool rooms from map entirely
    savedRoomData.clear();
    occupiedPositions.clear();
    for (const roomId of ALL_ROOM_IDS) {
        const room = readerRooms[roomId];
        if (!room) continue;
        savedRoomData.set(roomId, {
            ref: room,
            exits: {...room.exits},
            stubs: [...room.stubs],
            env: room.env,
            roomChar: room.roomChar,
            customLines: {...room.customLines},
            x: room.x,
            y: room.y,
        });
        if (roomId === ENTRY_ROOM_ID) {
            entryX = room.x;
            entryY = room.y;
            occupiedPositions.add(`${room.x}:${room.y}`);
            continue;
        }
        // Remove from map
        delete hashes[room.hash];
        delete readerRooms[roomId];
        const areaSource = reader.areas[room.area]?.area;
        if (areaSource) {
            areaSource.rooms = areaSource.rooms.filter((r: MapData.Room) => r.id !== roomId);
        }
    }

    // Entry room: keep env, set exits to up + south stub
    const entryRoom = readerRooms[ENTRY_ROOM_ID];
    if (entryRoom) {
        entryRoom.exits = {up: ENTRY_UP_TARGET} as Record<MapData.direction, number>;
        entryRoom.stubs = [directionToStubNumber('south')];
    }

    availablePool = [...POOL_ROOM_IDS];
    availableSpares = [...SPARE_ROOM_IDS];
    rooms.clear();
    currentFingerprint = null;
    isInitialized = true;
}

function activate(client: Client) {
    if (!isInitialized) {
        initRooms(client);
    }

    isActive = true;
    client.Map.refreshPosition = false;
    rebuildAndRender(client, ENTRY_ROOM_ID);
    client.println("[Raon] Mapper wlaczony.");
}

// Pause mapping: stop capturing but keep all discovered rooms
function pause(client: Client) {
    isActive = false;
    captureState = {phase: 'idle'};
    pendingLook = false;
    currentFingerprint = null;
    client.sendGMCP('char.options', {brief: savedBriefValue});
    client.println("[Raon] Mapper wstrzymany.");
}

// Full deactivate: restore original map data
function fullReset(client: Client) {
    const reader = client.Map.getMapReader() as any;
    const readerRooms: Record<number, MapData.Room> = reader.rooms;
    const hashes: Record<string, number> = (client.Map as any).hashes;
    const areas: Record<number, any> = reader.areas;
    const affectedAreas = new Set<number>();

    for (const [roomId, saved] of savedRoomData) {
        const room = saved.ref;
        room.exits = {...saved.exits} as Record<MapData.direction, number>;
        room.stubs = [...saved.stubs];
        room.env = saved.env;
        room.roomChar = saved.roomChar;
        room.customLines = {...saved.customLines};
        room.x = saved.x;
        room.y = saved.y;

        // Re-add to map if not present (rooms removed but never claimed)
        if (!readerRooms[roomId]) {
            readerRooms[roomId] = room;
            hashes[room.hash] = roomId;
            const areaSource = areas[room.area]?.area;
            if (areaSource) {
                areaSource.rooms.push(room);
            }
        }
        affectedAreas.add(room.area);
    }

    for (const areaId of affectedAreas) {
        const area = areas[areaId];
        if (!area) continue;
        area.planes = area.createPlanes();
        area.exits = new Map();
        area.createExits();
        area.markDirty();
    }

    (client.Map as any).pathFinder = new PathFinder(client.Map.getMapReader() as any);

    client.sendGMCP('char.options', {brief: savedBriefValue});

    rooms.clear();
    savedRoomData.clear();
    occupiedPositions.clear();
    availablePool = [];
    availableSpares = [];
    currentFingerprint = null;

    savedBriefValue = undefined;
    captureState = {phase: 'idle'};
    pendingLook = false;
    chaliceSet = false;
    figurinesSet = false;
    hasTeleportedRooms = false;
    clearedSarcophagi.clear();
    isActive = false;
    isInitialized = false;

    eventBus.emit('mapDataChanged');
    client.println("[Raon] Mapper wylaczony i mapa przywrocona.");
}

export default function initRaonLabyrinthMapper(client: Client, aliases: { pattern: RegExp; callback: Function }[]) {
    const tag = "raon-labyrinth-mapper";

    // Manual toggle: full reset
    aliases.push({
        pattern: /^\/raon_mapa$/,
        callback: () => {
            const reader = client.Map.tryGetMapReader();
            if (!reader) {
                client.println("Mapa nie jest jeszcze zaladowana.");
                return;
            }
            if (isActive || isInitialized) {
                fullReset(client);
            } else {
                activate(client);
                client.println("[Raon] Wejdz do labiryntu aby rozpoczac mapowanie.");
            }
        },
    });

    // Leader mode: track direction and look commands when active
    client.registerCommandHook("raon-labyrinth-mapper", (command) => {
        if (!isActive) return undefined;

        const cmd = stripPolishCharacters(command).trim();
        if (cmd === 'sp' || cmd === 'spojrz') {
            pendingLook = true;
            return undefined;
        }

        const direction = extractDirection(command);
        if (!direction) return undefined;

        captureState = {
            phase: 'capturing',
            lines: [],
            direction,
            sourceFingerprint: currentFingerprint,
            doorDirection: null,
        };
        return undefined;
    });

    // Activate when entering entry room (going down from 23146)
    client.on("enterLocation", (detail) => {
        const {id} = detail as { id: number };
        if (id === ENTRY_ROOM_ID && !isActive) {
            const reader = client.Map.tryGetMapReader();
            if (!reader) return;
            savedBriefValue = gmcp?.char?.options?.brief;
            client.sendGMCP('char.options', {brief: 0});
            if (isInitialized) {
                // Resume paused session
                isActive = true;
                client.Map.refreshPosition = false;
                rebuildAndRender(client, ENTRY_ROOM_ID);
                client.println("[Raon] Mapper wznowiony.");
            } else {
                activate(client);
            }
        }
    });

    // Track sarcophagus cleared when all enemies killed
    eventBus.on('allEnemiesKilled', () => {
        if (!isActive || !currentFingerprint) return;
        const room = rooms.get(currentFingerprint);
        if (room && room.roomType === 'sarcophagus') {
            clearedSarcophagi.add(currentFingerprint);
            const reader = client.Map.getMapReader() as any;
            const mapRoom: MapData.Room | undefined = reader.rooms[room.mapRoomId];
            if (mapRoom) {
                mapRoom.env = 266;
                rebuildAndRender(client);
            }
        }
    });

    // Follower mode: "podazasz za [name] na [direction]" starts capture
    client.Triggers.registerTrigger(
        /[Pp]odazasz za .+ na (.+)\.$/,
        (line, matches) => {
            const dirText = stripPolishCharacters(matches![1]);
            if (!isDirection(dirText)) return line;
            if (!isActive) return line;
            const direction = getLongDir(dirText);

            captureState = {
                phase: 'capturing',
                lines: [],
                direction,
                sourceFingerprint: currentFingerprint,
                doorDirection: null,
            };
            return line;
        },
        tag
    );

    // Capture description lines and detect exit line to finish
    client.Triggers.registerTrigger(
        /.+/,
        (line) => {
            const text = line.text ?? (typeof line === 'string' ? line : String(line));
            const stripped = stripPolishCharacters(text);

            // Detect bowl smoke teleport — start/reset capture without direction
            if (isActive && stripped.includes('z misy bucha')) {
                if (captureState.phase !== 'capturing') {
                    captureState = {
                        phase: 'capturing',
                        lines: [],
                        direction: null,
                        sourceFingerprint: currentFingerprint,
                        doorDirection: null,
                        teleport: true,
                    };
                } else {
                    captureState.direction = null;
                    captureState.lines = [];
                    captureState.teleport = true;
                }
                client.println(colorString("[Raon] Teleport z misy!", COLOR_TYPE));
                return line;
            }

            if (captureState.phase !== 'capturing') {
                if (pendingLook && currentFingerprint) {
                    if (LABYRINTH_EXIT_PATTERN.test(text)) {
                        pendingLook = false;
                        printRoomStatus(client, currentFingerprint);
                    }
                }
                return line;
            }

            // Skip additional smoke narration lines during teleport
            if (captureState.teleport) {
                const smokeKeywords = ['nabierasz oparu', 'odbierajac ci orientacje', 'przekletej trucizny', 'zmierzasz ku najblizszemu'];
                if (smokeKeywords.some(kw => stripped.includes(kw))) {
                    return line;
                }
            }

            // Detect door text — extract direction to chapel, skip from description
            const doorMatch = text.match(/^(?:Zamkniete|Otwarte) masywne drzwi prowadzace na (\S+)/);
            if (doorMatch) {
                const rawDir = doorMatch[1].replace(/\.$/, '');
                const doorDirText = stripPolishCharacters(rawDir);
                if (isDirection(doorDirText)) {
                    captureState.doorDirection = getLongDir(doorDirText);
                }
                return line;
            }

            // Skip "podazasz za" movement lines (with or without "Wraz z ..." prefix)
            if (/podazasz za .+ na .+\.$/.test(text)) return line;

            const match = text.match(LABYRINTH_EXIT_PATTERN);
            if (match) {
                const descLines = captureState.lines;
                const dir = captureState.direction;
                const src = captureState.sourceFingerprint;
                const doorDir = captureState.doorDirection;
                const isTeleport = captureState.teleport ?? false;
                captureState = {phase: 'idle'};
                finishCapture(client, descLines, match[1], dir, src, doorDir, isTeleport);
                return line;
            }

            captureState.lines.push(text);
            return line;
        },
        tag
    );

    // Track chalice placed on altar
    client.Triggers.registerTrigger(
        /(?:stawia krysztalowy kielich na oltarzu|Stawiasz krysztalowy kielich na oltarzu)\./,
        (line) => {
            if (!isActive) return line;
            chaliceSet = true;
            return line;
        },
        tag
    );

    // Track figurines placed on fields
    client.Triggers.registerTrigger(
        /(?:przesuwa|Przesuwasz) figurke \S+ na \S+ pole/,
        (line) => {
            if (!isActive) return line;
            figurinesSet = true;
            return line;
        },
        tag
    );

    // Bowl smoke starting
    client.Triggers.registerTrigger(
        /^Z dna misy zaczyna unosic sie najpierw ledwo widoczna/,
        (line) => {
            if (!isActive) return line;
            const buf = colorString("[ STOP ] ", createColorFormat("red"));
            buf.appendBuffer(colorString(line.text, createColorFormat("red")));
            client.FunctionalBind.set("ob rubin;przekrec rubin");
            return buf;
        },
        tag
    );

    // Bowl smoke cleared
    client.Triggers.registerTrigger(
        /^Bialy dym przestaje wydobywac sie z wnetrza kamiennej misy\./,
        (line) => {
            if (!isActive) return line;
            return colorString(line.text, createColorFormat("SpringGreen"));
        },
        tag
    );

    // Figurine eye color triggers (persist across labyrinth runs)
    client.Triggers.registerTrigger(
        /(\S+) oczy jarza sie delikatna poswiata/,
        (line, matches) => {
            figurineEyes['smok'] = matches![1].toLowerCase();
            return line;
        },
        tag
    );
    client.Triggers.registerTrigger(
        /(\S+) oczy gryfa lsnia niebezpiecznie/,
        (line, matches) => {
            figurineEyes['gryf'] = matches![1].toLowerCase();
            return line;
        },
        tag
    );
    client.Triggers.registerTrigger(
        /Jego (\S+), tajemnicze oczy zwrocone sa/,
        (line, matches) => {
            figurineEyes['jednorozec'] = matches![1].toLowerCase();
            return line;
        },
        tag
    );

    // Leaving labyrinth (staircase room) — pause mapping but keep state
    client.Triggers.registerTrigger(
        /^Zagubione w niebycie, kamienne schody sa jedyna namacalna rzecza/,
        (line) => {
            if (isActive) {
                pause(client);
            }
            return line;
        },
        tag
    );
}
