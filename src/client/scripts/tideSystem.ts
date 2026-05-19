import Client from "../Client";
import eventBus from "@modules/core/eventBus";
import {PathFinder} from "mudlet-map-renderer";

const TIDE_ROOM_IDS = [18975, 18990, 18977, 18978, 18979, 18976, 18980, 20809, 20798, 20799, 20800, 20801, 20802, 20803, 20804, 20805, 20807, 20806];
const SHIFT_ONLY_ROOM_ID = 20808;
const ALL_AFFECTED_IDS = [...TIDE_ROOM_IDS, SHIFT_ONLY_ROOM_ID];
const TIDE_ROOM_SET = new Set(TIDE_ROOM_IDS);
const TEMP_ID_OFFSET = 100000;

// Additional exits for temp surface rooms based on visual grid adjacency
// These connections don't exist on the underwater level but should exist on the surface
const ADDITIONAL_TEMP_EXITS: Record<number, Record<string, number>> = {
    18976: {south: 18980, southeast: 18977},
    18977: {west: 18980, southwest: 18979, northwest: 18976},
    18978: {south: 20806, southwest: 20807, northwest: 18980},
    18979: {south: 20807, southeast: 20806, northeast: 18977, northwest: 20798},
    18980: {north: 18976, east: 18977, southeast: 18978},
    20798: {south: 20809, southeast: 18979},
    20799: {south: 20800, southeast: 20809},
    20800: {north: 20799, east: 20809},
    20801: {north: 20809, east: 20807},
    20802: {east: 20803},
    20803: {west: 20802, northeast: 20807},
    20806: {north: 18978, west: 20807, northwest: 18979},
    20807: {north: 18979, east: 20806, west: 20801, northeast: 18978, southwest: 20803, northwest: 20809},
    20809: {north: 20798, south: 20801, southeast: 20807, west: 20800, northwest: 20799},
};

// Room pairs where all exits between them transfer from shifted room to its temp room
const TRANSFERRED_EXIT_PAIRS: { tideRoomId: number; externalRoomId: number }[] = [
    {tideRoomId: 18975, externalRoomId: 3287},
];

const NEARBY_ROOM_IDS = new Set(TRANSFERRED_EXIT_PAIRS.map(p => p.externalRoomId));

interface SavedRoomState {
    z: number;
    hash: string;
    exits: Record<string, number>;
}

const ALL_AFFECTED_SET = new Set(ALL_AFFECTED_IDS);

let isHighTide = false;
const savedStates = new Map<number, SavedRoomState>();
const savedExternalExits = new Map<number, Record<string, number>>();

export default function initTideSystem(client: Client, aliases: { pattern: RegExp; callback: Function }[]) {
    const tag = "tide-system";

    aliases.push({
        pattern: /^\/przyplyw$/,
        callback: () => {
            const reader = client.Map.tryGetMapReader();
            if (!reader) {
                client.println("Mapa nie jest jeszcze zaladowana.");
                return;
            }
            isHighTide = !isHighTide;
            if (isHighTide) {
                activate(client);
                client.println("Przyplyw wlaczony.");
            } else {
                deactivate(client);
                client.println("Przyplyw wylaczony.");
            }
        },
    });

    // Tide comes in - activate if not already active
    client.Triggers.registerTrigger([
            /^[ >]*Szczyt fali chwile balansuje, a nastepnie z duza szybkoscia przechyla sie/,
            'Tam, gdzie przed chwila byl suchy lad, jest teraz falujace morze.'
        ],
        (line) => {
            if (!isHighTide && client.Map.tryGetMapReader() && isNearTideArea(client)) {
                isHighTide = true;
                activate(client);
            }
            return line;
        }, tag);

    // Tide goes out - deactivate if active
    client.Triggers.registerTrigger([
            /poziom morza gwaltownie opada/,
            /^[ >]*Czujesz jak w jednej chwili poziom morza gwaltownie opada\./,
        ],
        (line) => {
            if (isHighTide && client.Map.tryGetMapReader() && isNearTideArea(client)) {
                isHighTide = false;
                deactivate(client);
            }
            return line;
        }, tag);

    // Detect tide state from room exits: "Mozesz stad poplynac" = high tide, no "gore" = surface
    client.on("gmcp_msg.room.exits", (exits) => {
        if (!client.Map.tryGetMapReader() || !isInTideArea(client)) return;
        const text = exits.originalText ?? exits.text;
        if (text.includes("Mozesz stad poplynac")) {
            if (!isHighTide) {
                isHighTide = true;
                activate(client);
                if (!text.includes("gore")) {
                    moveToTempRoom(client);
                }
            }
        } else if (isHighTide) {
            isHighTide = false;
            deactivate(client);
        }
    });
}

function isInTideArea(client: Client): boolean {
    const id = client.Map.currentRoom?.id;
    if (!id) return false;
    return ALL_AFFECTED_SET.has(id) || (id >= TEMP_ID_OFFSET && ALL_AFFECTED_SET.has(id - TEMP_ID_OFFSET));
}

function isNearTideArea(client: Client): boolean {
    const id = client.Map.currentRoom?.id;
    if (!id) return false;
    return NEARBY_ROOM_IDS.has(id) || isInTideArea(client);
}

function activate(client: Client) {
    const reader = client.Map.getMapReader() as any;
    const readerRooms: Record<number, MapData.Room> = reader.rooms;
    const hashes: Record<string, number> = (client.Map as any).hashes;
    const affectedAreas = new Set<number>();

    // 1. Save original state and shift all affected rooms to z=-1
    for (const id of ALL_AFFECTED_IDS) {
        const room = readerRooms[id];
        if (!room) continue;

        savedStates.set(id, {
            z: room.z,
            hash: room.hash,
            exits: {...room.exits},
        });

        delete hashes[room.hash];
        room.z = -1;
        affectedAreas.add(room.area);
    }

    // 2. Create temp surface rooms for each tide room (not shift-only)
    for (const id of TIDE_ROOM_IDS) {
        const original = readerRooms[id];
        if (!original) continue;

        const tempId = id + TEMP_ID_OFFSET;
        const saved = savedStates.get(id)!;

        // Copy exits, remapping tide-room targets to their temp equivalents
        const tempExits: Record<string, number> = {};
        for (const [dir, target] of Object.entries(saved.exits)) {
            if (dir === "up" || dir === "down") continue;
            if (TIDE_ROOM_SET.has(target)) {
                tempExits[dir] = target + TEMP_ID_OFFSET;
            } else if (target !== SHIFT_ONLY_ROOM_ID) {
                tempExits[dir] = target;
            }
        }

        // Vertical links between temp (surface) and original (underwater)
        tempExits.down = id;
        original.exits.up = tempId;

        const tempRoom: MapData.Room = {
            id: tempId,
            area: original.area,
            areaId: (original as any).areaId ?? String(original.area),
            x: original.x,
            y: original.y,
            z: 0,
            weight: original.weight,
            roomChar: original.roomChar,
            name: original.name,
            userData: {},
            customLines: original.customLines,
            stubs: [],
            hash: saved.hash,
            env: original.env,
            exits: tempExits as Record<MapData.direction, number>,
            doors: {} as Record<MapData.direction, 1 | 2 | 3>,
            specialExits: {} as Record<string, number>,
        };

        hashes[tempRoom.hash] = tempId;
        readerRooms[tempId] = tempRoom;

        reader.areas[original.area].area.rooms.push(tempRoom);
    }

    // 3. Add additional surface connections between temp rooms
    for (const [roomId, exits] of Object.entries(ADDITIONAL_TEMP_EXITS)) {
        const tempId = Number(roomId) + TEMP_ID_OFFSET;
        const tempRoom = readerRooms[tempId];
        if (!tempRoom) continue;
        for (const [dir, targetId] of Object.entries(exits)) {
            tempRoom.exits[dir as MapData.direction] = targetId + TEMP_ID_OFFSET;
        }
    }

    // 4. Transfer all exits between tide/external room pairs
    for (const {tideRoomId, externalRoomId} of TRANSFERRED_EXIT_PAIRS) {
        const tempId = tideRoomId + TEMP_ID_OFFSET;
        const shiftedRoom = readerRooms[tideRoomId];
        const tempRoom = readerRooms[tempId];
        const externalRoom = readerRooms[externalRoomId];
        if (!shiftedRoom || !tempRoom || !externalRoom) continue;

        // Move all exits from shifted room pointing to external → temp room
        for (const [dir, target] of Object.entries(shiftedRoom.exits)) {
            if (target === externalRoomId) {
                delete shiftedRoom.exits[dir as MapData.direction];
                tempRoom.exits[dir as MapData.direction] = externalRoomId;
            }
        }

        // Redirect all exits from external room pointing to original → temp
        savedExternalExits.set(externalRoomId, {...externalRoom.exits});
        for (const [dir, target] of Object.entries(externalRoom.exits)) {
            if (target === tideRoomId) {
                externalRoom.exits[dir as MapData.direction] = tempId;
            }
        }
        affectedAreas.add(externalRoom.area);
    }

    // 5. Rebuild areas, pathfinder, re-render
    rebuildAreas(reader, affectedAreas);
    rebuildPathFinder(client);
    rerender(client);
    eventBus.emit('mapDataChanged');
}

function deactivate(client: Client) {
    const reader = client.Map.getMapReader() as any;
    const readerRooms: Record<number, MapData.Room> = reader.rooms;
    const hashes: Record<string, number> = (client.Map as any).hashes;
    const affectedAreas = new Set<number>();

    // If player is on a temp room, resolve to original
    let currentId = client.Map.currentRoom?.id;
    if (currentId && currentId >= TEMP_ID_OFFSET) {
        currentId = currentId - TEMP_ID_OFFSET;
    }

    // 1. Remove temp rooms
    for (const id of TIDE_ROOM_IDS) {
        const tempId = id + TEMP_ID_OFFSET;
        const tempRoom = readerRooms[tempId];
        if (!tempRoom) continue;

        delete hashes[tempRoom.hash];
        delete readerRooms[tempId];

        const areaSource = reader.areas[tempRoom.area]?.area;
        if (areaSource) {
            areaSource.rooms = areaSource.rooms.filter((r: MapData.Room) => r.id !== tempId);
        }
        affectedAreas.add(tempRoom.area);
    }

    // 2. Restore original room states
    for (const [id, saved] of savedStates) {
        const room = readerRooms[id];
        if (!room) continue;

        room.z = saved.z;
        room.hash = saved.hash;
        room.exits = {...saved.exits} as Record<MapData.direction, number>;
        hashes[saved.hash] = id;
        affectedAreas.add(room.area);
    }
    savedStates.clear();

    // 3. Restore external room exits
    for (const [externalId, savedExits] of savedExternalExits) {
        const room = readerRooms[externalId];
        if (!room) continue;
        room.exits = {...savedExits} as Record<MapData.direction, number>;
        affectedAreas.add(room.area);
    }
    savedExternalExits.clear();

    // 4. Rebuild areas, pathfinder, re-render
    rebuildAreas(reader, affectedAreas);
    rebuildPathFinder(client);

    if (currentId) {
        client.Map.renderRoomById(currentId);
    }
    eventBus.emit('mapDataChanged');
}

function rebuildAreas(reader: any, affectedAreas: Set<number>) {
    const areas: Record<number, any> = reader.areas;
    for (const areaId of affectedAreas) {
        const area = areas[areaId];
        if (!area) continue;
        area.planes = area.createPlanes();
        area.exits = new Map();
        area.createExits();
        area.markDirty();
    }
}

function rebuildPathFinder(client: Client) {
    (client.Map as any).pathFinder = new PathFinder(client.Map.getMapReader() as any);
}

function moveToTempRoom(client: Client) {
    const id = client.Map.currentRoom?.id;
    if (id && ALL_AFFECTED_SET.has(id)) {
        const tempId = id + TEMP_ID_OFFSET;
        const reader = client.Map.getMapReader();
        if (reader.getRoom(tempId)) {
            client.Map.renderRoomById(tempId);
        }
    }
}

function rerender(client: Client) {
    const currentId = client.Map.currentRoom?.id;
    if (currentId) {
        client.Map.renderRoomById(currentId);
    }
}
