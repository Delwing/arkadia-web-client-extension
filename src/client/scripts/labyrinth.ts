import Client from "../Client";
import {getLongDir, isDirection} from "@shared/map/directions";
import {stripPolishCharacters} from "../stripPolishCharacters";
import eventBus from "@modules/core/eventBus";

const LABYRINTH_ENV = 266;
const LABYRINTH_AREA = 39;
const LABYRINTH_Z = -1;

const reverseDirection: Record<string, string> = {
    north: "south",
    south: "north",
    east: "west",
    west: "east",
    northeast: "southwest",
    southwest: "northeast",
    northwest: "southeast",
    southeast: "northwest",
    up: "down",
    down: "up",
};

interface PendingMove {
    sourceId: number;
    direction: string;
    targetId: number;
}

const COMBAT_SYMBOL = "⚔";

let isActive = false;
const labyrinthRooms = new Set<number>();
const savedExits = new Map<number, Record<string, number>>();
const savedSymbols = new Map<number, string>();
const removedExits = new Map<number, Set<string>>();
const combatRooms = new Set<number>();
let pendingMove: PendingMove | null = null;

function extractDirection(command: string): string | null {
    let cmd = stripPolishCharacters(command);
    if (cmd.startsWith('przemknij z druzyna ')) cmd = cmd.substring(20);
    else if (cmd.startsWith('przemknij ')) cmd = cmd.substring(10);
    else if (cmd.startsWith('jedz na ')) cmd = cmd.substring(8);

    if (isDirection(cmd)) return getLongDir(cmd);
    return null;
}

function findLabyrinthRooms(client: Client) {
    labyrinthRooms.clear();
    const reader = client.Map.getMapReader();
    const rooms = reader.getRooms();
    const env266Rooms = new Set<number>();

    for (const room of rooms) {
        if (room.env === LABYRINTH_ENV && room.area === LABYRINTH_AREA && room.z === LABYRINTH_Z) {
            env266Rooms.add(room.id);
        }
    }

    // Only include rooms that connect to other env 266 rooms
    for (const roomId of env266Rooms) {
        const room = reader.getRoom(roomId);
        if (!room?.exits) continue;
        for (const targetId of Object.values(room.exits)) {
            if (env266Rooms.has(targetId)) {
                labyrinthRooms.add(roomId);
                break;
            }
        }
    }
}

function activate(client: Client) {
    findLabyrinthRooms(client);
    savedExits.clear();
    savedSymbols.clear();
    removedExits.clear();
    combatRooms.clear();
    pendingMove = null;

    const reader = client.Map.getMapReader();
    for (const roomId of labyrinthRooms) {
        const room = reader.getRoom(roomId);
        if (!room) continue;
        if (room.exits) {
            savedExits.set(roomId, {...room.exits});
        }
        savedSymbols.set(roomId, room.roomChar);
    }
}

function deactivate(client: Client) {
    const reader = client.Map.getMapReader() as any;
    const readerRooms: Record<number, MapData.Room> = reader.rooms;
    const affectedAreas = new Set<number>();

    for (const [roomId, exits] of savedExits) {
        const room = readerRooms[roomId];
        if (!room) continue;
        room.exits = {...exits} as Record<MapData.direction, number>;
        affectedAreas.add(room.area);
    }

    for (const [roomId, roomChar] of savedSymbols) {
        const room = readerRooms[roomId];
        if (room) room.roomChar = roomChar;
    }

    rebuildAreas(reader, affectedAreas);
    rebuildPathFinder((client.Map as any).pathFinder);

    savedExits.clear();
    savedSymbols.clear();
    removedExits.clear();
    combatRooms.clear();
    pendingMove = null;
    labyrinthRooms.clear();

    if (client.Map.currentRoom) {
        client.Map.renderRoomById(client.Map.currentRoom.id);
    }
    eventBus.emit('mapDataChanged');
}

function removeExit(client: Client, move: PendingMove) {
    const reader = client.Map.getMapReader() as any;
    const readerRooms: Record<number, MapData.Room> = reader.rooms;
    const affectedAreas = new Set<number>();

    const sourceRoom = readerRooms[move.sourceId];
    const targetRoom = readerRooms[move.targetId];
    const reverse = reverseDirection[move.direction];

    if (sourceRoom) {
        delete sourceRoom.exits[move.direction as MapData.direction];
        affectedAreas.add(sourceRoom.area);

        if (!removedExits.has(move.sourceId)) removedExits.set(move.sourceId, new Set());
        removedExits.get(move.sourceId)!.add(move.direction);
    }

    if (targetRoom && reverse) {
        delete targetRoom.exits[reverse as MapData.direction];
        affectedAreas.add(targetRoom.area);

        if (!removedExits.has(move.targetId)) removedExits.set(move.targetId, new Set());
        removedExits.get(move.targetId)!.add(reverse);
    }

    rebuildAreas(reader, affectedAreas);
    rebuildPathFinder((client.Map as any).pathFinder);

    if (client.Map.currentRoom) {
        client.Map.renderRoomById(client.Map.currentRoom.id);
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

function rebuildPathFinder(pathFinder: any) {
    pathFinder.graph = pathFinder.buildGraph();
    pathFinder.cache = new Map();
}

export default function initLabyrinth(client: Client, aliases: { pattern: RegExp; callback: Function }[]) {
    const tag = "labyrinth";

    aliases.push({
        pattern: /^\/labirynt$/,
        callback: () => {
            const reader = client.Map.tryGetMapReader();
            if (!reader) {
                client.println("Mapa nie jest jeszcze zaladowana.");
                return;
            }
            isActive = !isActive;
            if (isActive) {
                activate(client);
                client.println("Tryb labiryntu wlaczony.");
            } else {
                deactivate(client);
                client.println("Tryb labiryntu wylaczony.");
            }
        },
    });

    // Command hook: re-add removed exits temporarily so Map.move() succeeds
    // and the blocker handler's moveBack() correctly reverses the move
    client.registerCommandHook("labyrinth", (command) => {
        if (!isActive) return undefined;
        const currentRoom = client.Map.currentRoom;
        if (!currentRoom || !labyrinthRooms.has(currentRoom.id)) return undefined;

        const direction = extractDirection(command);
        if (!direction) return undefined;

        const blocked = removedExits.get(currentRoom.id);
        if (blocked?.has(direction)) {
            const saved = savedExits.get(currentRoom.id);
            const targetId = saved?.[direction];
            if (targetId) {
                currentRoom.exits[direction as MapData.direction] = targetId;
            }
        }

        return undefined;
    });

    // Track pending moves between labyrinth rooms
    client.on("enterLocation", (detail) => {
        if (!isActive) return;
        const {id, direction} = detail as { id: number; room: unknown; direction: string | null };
        if (!direction) return;
        if (!labyrinthRooms.has(id)) return;

        const history = client.Map.locationHistory;
        if (history.length < 2) return;
        const sourceId = history[history.length - 2];
        if (!labyrinthRooms.has(sourceId)) return;

        pendingMove = {sourceId, direction, targetId: id};
    });

    // gmcp.room.info confirms successful move
    client.on("gmcp.room.info", () => {
        if (pendingMove) {
            pendingMove = null;
        }
    });

    // Shrub blocker: exit definitely doesn't exist
    client.Triggers.registerTrigger(
        /^Ruszasz na .+?, ale zaraz wchodzisz w gesta platanine galezi i lisci zywoplotow\.$/,
        (line) => {
            if (pendingMove) {
                const move = pendingMove;
                pendingMove = null;
                removeExit(client, move);
            }
            return line;
        },
        tag
    );

    // Sunrise: labyrinth resets, turn off automatically
    client.on("clock.sunrise", () => {
        if (isActive) {
            isActive = false;
            deactivate(client);
        }
    });

    // Demon blocker: uncertain, exit might or might not exist
    client.Triggers.registerTrigger(
        /^Nie mozesz sie tam udac, gdyz ktos lapie cie kurczowo/,
        (line) => {
            if (pendingMove) {
                pendingMove = null;
            }
            return line;
        },
        tag
    );

    // Mark labyrinth rooms with sword symbol when combat.avatar lines appear
    client.Triggers.registerTrigger(
        /.*/,
        (line, _matches, type) => {
            if (!isActive || type !== "combat.avatar") return line;
            const roomId = client.Map.currentRoom?.id;
            if (!roomId || !labyrinthRooms.has(roomId) || combatRooms.has(roomId)) return line;

            combatRooms.add(roomId);
            const reader = client.Map.getMapReader() as any;
            const room: MapData.Room = reader.rooms[roomId];
            if (room) {
                room.roomChar = COMBAT_SYMBOL;
                const areas: Record<number, any> = reader.areas;
                const area = areas[room.area];
                if (area) {
                    area.markDirty();
                }
                client.Map.renderRoomById(roomId);
            }
            return line;
        },
        tag
    );
}
