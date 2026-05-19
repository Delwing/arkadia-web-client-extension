import Client from "../Client";
import {getLongDir, isDirection, polishToEnglish} from "@shared/map/directions";
import {stripPolishCharacters} from "../stripPolishCharacters";
import {parseExitString} from "./shortExits";
import {gmcp} from "../gmcp";
import {colorString, createColorFormat} from "@modules/core/Colors";
import {AnsiAwareBuffer} from "../ansi/FormatState";
import eventBus from "@modules/core/eventBus";
import {PathFinder} from "mudlet-map-renderer";

const TEMP_ID_OFFSET = 200000;
const LABYRINTH_AREA_ID = 9999;
const LABYRINTH_ENV = 266;
const ENTRANCE_ROOM_ID = 25344;
const LABYRINTH_MAP_ROOM_ID = 19494;

const LABYRINTH_EXIT_PATTERN = /^(?:Jest|Sa) tutaj .* widoczn(?:e|ych) wyjsc(?:|ia|ie): (.*)\.$/;
const STUDNIA_ROOM_ID = 23595;
const STUDNIA_COMMAND = 'wejdz do studni';
const LABYRINTH_STUDNIA_ENV = 288;

const englishToPolish: Record<string, string> = {};
for (const [pl, en] of Object.entries(polishToEnglish)) {
    if (!englishToPolish[en]) englishToPolish[en] = pl;
}

const COLOR_KNOWN = createColorFormat("#00CC00");
const COLOR_UNKNOWN = createColorFormat("#CC0000");
const COLOR_STUDNIA = createColorFormat("#00BFFF");

interface LabyrinthRoom {
    fingerprint: string;
    tempId: number;
    gridX: number;
    gridY: number;
    exits: Map<string, string | null>; // direction -> target fingerprint (null = unexplored)
    visitCount: number;
}

type CaptureState =
    | { phase: 'idle' }
    | { phase: 'capturing'; lines: string[]; direction: string | null; sourceFingerprint: string | null };

let isActive = false;
let captureState: CaptureState = {phase: 'idle'};
let currentFingerprint: string | null = null;
let pendingDirection: string | null = null;
let initialPlaceholder: LabyrinthRoom | null = null;
let savedBriefValue: unknown = undefined;
let nextTempIdCounter = 0;
let nextGridPosition = 0;

const rooms = new Map<string, LabyrinthRoom>();

function extractDirection(command: string): string | null {
    let cmd = stripPolishCharacters(command);
    if (cmd.startsWith('przemknij z druzyna ')) cmd = cmd.substring(20);
    else if (cmd.startsWith('przemknij ')) cmd = cmd.substring(10);
    else if (cmd.startsWith('jedz na ')) cmd = cmd.substring(8);

    if (isDirection(cmd)) return getLongDir(cmd);
    return null;
}

function spiralPosition(n: number): { x: number; y: number } {
    if (n === 0) return {x: 0, y: 0};
    let x = 0, y = 0;
    let dx = 1, dy = 0;
    let steps = 1, stepCount = 0, turnCount = 0;
    for (let i = 0; i < n; i++) {
        x += dx;
        y += dy;
        stepCount++;
        if (stepCount === steps) {
            stepCount = 0;
            const tmp = dx;
            dx = -dy;
            dy = tmp;
            turnCount++;
            if (turnCount % 2 === 0) steps++;
        }
    }
    return {x, y};
}

function getNextGridPosition(): { x: number; y: number } {
    const pos = spiralPosition(nextGridPosition++);
    return {x: pos.x * 2, y: pos.y * 2};
}

function createSyntheticArea(reader: any) {
    const areas: Record<number, any> = reader.areas;

    if (!areas[LABYRINTH_AREA_ID]) {
        const areaSource: MapData.Area = {
            areaName: 'Labirynt (mapper)',
            areaId: String(LABYRINTH_AREA_ID),
            rooms: [],
            labels: [],
        };

        // Create a processed Area object (same as MapReader constructor does)
        // Get the Area constructor from any existing area
        const existingArea = Object.values(areas)[0];
        if (existingArea) {
            areas[LABYRINTH_AREA_ID] = new existingArea.constructor(areaSource);
        }
    }
}

function createTempRoom(client: Client, room: LabyrinthRoom): void {
    const reader = client.Map.getMapReader() as any;
    const readerRooms: Record<number, MapData.Room> = reader.rooms;
    const hashes: Record<string, number> = (client.Map as any).hashes;

    const hash = `${room.gridX}:${room.gridY}:0:Labirynt.`;

    const tempRoom: MapData.Room = {
        id: room.tempId,
        area: LABYRINTH_AREA_ID,
        areaId: String(LABYRINTH_AREA_ID),
        x: room.gridX,
        y: room.gridY,
        z: 0,
        weight: 1,
        roomChar: '',
        name: 'Labirynt.',
        userData: {} as Record<string, string>,
        customLines: {} as Record<string, MapData.Line>,
        stubs: [],
        hash,
        env: LABYRINTH_ENV,
        exits: {} as Record<MapData.direction, number>,
        doors: {} as Record<MapData.direction, 1 | 2 | 3>,
        specialExits: {} as Record<string, number>,
    };

    hashes[hash] = room.tempId;
    readerRooms[room.tempId] = tempRoom;

    reader.areas[LABYRINTH_AREA_ID].area.rooms.push(tempRoom);
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

function updateMapRoom(client: Client, room: LabyrinthRoom) {
    const reader = client.Map.getMapReader() as any;
    const readerRooms: Record<number, MapData.Room> = reader.rooms;
    const mapRoom = readerRooms[room.tempId];
    if (!mapRoom) return;

    // Update exits to point to known targets
    const newExits: Record<string, number> = {};
    const stubs: number[] = [];

    for (const [dir, targetFingerprint] of room.exits) {
        if (targetFingerprint) {
            const targetRoom = rooms.get(targetFingerprint);
            if (targetRoom) {
                newExits[dir] = targetRoom.tempId;
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

function updateAllRoomChars(client: Client) {
    const reader = client.Map.getMapReader() as any;
    const readerRooms: Record<number, MapData.Room> = reader.rooms;

    let index = 0;
    for (const [, room] of rooms) {
        index++;
        const mapRoom = readerRooms[room.tempId];
        if (!mapRoom) continue;
        mapRoom.roomChar = String(index);
    }
}

function rebuildAndRender(client: Client, renderTempId?: number) {
    const reader = client.Map.getMapReader() as any;
    const areas: Record<number, any> = reader.areas;
    const area = areas[LABYRINTH_AREA_ID];
    if (area) {
        area.planes = area.createPlanes();
        area.exits = new Map();
        area.createExits();
        area.markDirty();
    }

    (client.Map as any).pathFinder = new PathFinder(client.Map.getMapReader() as any);

    const roomId = renderTempId ?? (currentFingerprint ? rooms.get(currentFingerprint)?.tempId : undefined);
    if (roomId !== undefined) {
        client.Map.renderRoomById(roomId);
    }
    eventBus.emit('mapDataChanged');
}


function finishCapture(client: Client, descriptionLines: string[], exitString: string, direction: string | null, sourceFingerprint: string | null) {
    const fingerprint = descriptionLines.join('\n').trim();
    if (!fingerprint) return;

    const exitDirs = parseExitString(exitString).map(e => getLongDir(e));

    let room = rooms.get(fingerprint);
    const isNew = !room;

    if (isNew) {
        if (initialPlaceholder) {
            // Reuse the placeholder room created on activation
            room = initialPlaceholder;
            room.fingerprint = fingerprint;
            initialPlaceholder = null;
        } else {
            const grid = getNextGridPosition();
            const tempId = TEMP_ID_OFFSET + nextTempIdCounter++;
            room = {
                fingerprint,
                tempId,
                gridX: grid.x,
                gridY: grid.y,
                exits: new Map(),
                visitCount: 0,
            };
            createTempRoom(client, room);
        }
        rooms.set(fingerprint, room);
    }

    room!.visitCount++;

    // Register exits (preserve existing known targets)
    for (const dir of exitDirs) {
        if (!room!.exits.has(dir)) {
            room!.exits.set(dir, null);
        }
    }

    // Record edge from source room
    if (direction && sourceFingerprint) {
        const sourceRoom = rooms.get(sourceFingerprint);
        if (sourceRoom) {
            sourceRoom.exits.set(direction, fingerprint);
            updateMapRoom(client, sourceRoom);
        }
    }

    const hasStudnia = /studnia/i.test(fingerprint);

    currentFingerprint = fingerprint;
    updateMapRoom(client, room!);
    updateAllRoomChars(client);

    // Studnia: set after updateMapRoom so the down exit isn't overwritten
    if (hasStudnia) {
        const reader = client.Map.getMapReader() as any;
        const mapRoom: MapData.Room = reader.rooms[room!.tempId];
        if (mapRoom) {
            mapRoom.env = LABYRINTH_STUDNIA_ENV;
            mapRoom.exits.down = STUDNIA_ROOM_ID;
            mapRoom.specialExits[STUDNIA_COMMAND] = STUDNIA_ROOM_ID;
        }
    }

    rebuildAndRender(client);

    const roomIndex = getRoomIndex(fingerprint);
    const buf = new AnsiAwareBuffer(`[Labirynt] Pokoj ${roomIndex}/${rooms.size}`);
    if (hasStudnia) {
        buf.append(" ");
        const linkBuf = colorString("[STUDNIA]", COLOR_STUDNIA);
        linkBuf.createLink([0, linkBuf.length], {
            onClick: () => client.sendCommand(STUDNIA_COMMAND),
            title: STUDNIA_COMMAND,
        });
        buf.appendBuffer(linkBuf);
    }
    buf.append(" | ", {});
    let first = true;
    for (const [dir, target] of room!.exits) {
        if (!first) buf.append(", ");
        first = false;
        const polishDir = englishToPolish[dir] ?? dir;
        if (target) {
            buf.appendBuffer(colorString(`${polishDir} [${getRoomIndex(target)}]`, COLOR_KNOWN));
        } else {
            buf.appendBuffer(colorString(polishDir, COLOR_UNKNOWN));
        }
    }
    client.println(buf);
}

function activate(client: Client) {
    const reader = client.Map.getMapReader() as any;
    createSyntheticArea(reader);
    isActive = true;
    client.println("[Labirynt] Mapper wlaczony.");
}

function deactivate(client: Client) {
    const reader = client.Map.getMapReader() as any;
    const readerRooms: Record<number, MapData.Room> = reader.rooms;
    const hashes: Record<string, number> = (client.Map as any).hashes;

    // Remove all temp rooms
    for (const room of rooms.values()) {
        const mapRoom = readerRooms[room.tempId];
        if (mapRoom) {
            delete hashes[mapRoom.hash];
            delete readerRooms[room.tempId];
        }
    }

    // Clean up unused placeholder (not in rooms map yet)
    if (initialPlaceholder) {
        const mapRoom = readerRooms[initialPlaceholder.tempId];
        if (mapRoom) {
            delete hashes[mapRoom.hash];
            delete readerRooms[initialPlaceholder.tempId];
        }
    }

    // Rebuild
    const areas: Record<number, any> = reader.areas;
    const area = areas[LABYRINTH_AREA_ID];
    if (area) {
        if (area.area) {
            area.area.rooms = [];
        }
        area.planes = area.createPlanes();
        area.exits = new Map();
        area.createExits();
        area.markDirty();
    }
    (client.Map as any).pathFinder = new PathFinder(client.Map.getMapReader() as any);

    // Restore brief setting
    client.sendGMCP('char.options', {brief: savedBriefValue});

    // Clear state
    rooms.clear();
    currentFingerprint = null;
    pendingDirection = null;
    initialPlaceholder = null;
    savedBriefValue = undefined;
    nextTempIdCounter = 0;
    nextGridPosition = 0;
    captureState = {phase: 'idle'};
    isActive = false;

    // Restore normal map position tracking
    client.sendEvent("refreshPositionWhenAble");

    eventBus.emit('mapDataChanged');
    client.println("[Labirynt] Mapper wylaczony.");
}

export default function initLabyrinthMapper(client: Client, aliases: { pattern: RegExp; callback: Function }[]) {
    const tag = "labyrinth-mapper";

    // Manual toggle
    aliases.push({
        pattern: /^\/labirynt_mapa$/,
        callback: () => {
            const reader = client.Map.tryGetMapReader();
            if (!reader) {
                client.println("Mapa nie jest jeszcze zaladowana.");
                return;
            }
            if (isActive) {
                deactivate(client);
            } else {
                activate(client);
                client.println("[Labirynt] Wejdz do labiryntu aby rozpoczac mapowanie.");
            }
        },
    });

    // Track direction from player commands + pre-activation brief=0
    client.registerCommandHook("labyrinth-mapper", (command) => {
        const direction = extractDirection(command);

        if (!isActive) {
            // Before entering labyrinth: set brief=0 so server sends long descriptions
            if (direction === 'down') {
                const currentRoomId = client.Map.currentRoom?.id;
                if (currentRoomId === ENTRANCE_ROOM_ID) {
                    savedBriefValue = gmcp?.char?.options?.brief;
                    client.sendGMCP('char.options', {brief: 0});
                }
            }
            return undefined;
        }

        if (direction) {
            pendingDirection = direction;
        }
        return undefined;
    });

    // Auto-activate when Map.move navigates to the labyrinth room
    client.on("enterLocation", (detail) => {
        const {id} = detail as { id: number };
        if (id === LABYRINTH_MAP_ROOM_ID && !isActive) {
            //if (!client.TeamManager.isLeader()) return;
            const reader = client.Map.tryGetMapReader();
            if (!reader) return;

            activate(client);
            client.Map.refreshPosition = false;

            // Create initial placeholder room and move the map there
            const grid = getNextGridPosition();
            const tempId = TEMP_ID_OFFSET + nextTempIdCounter++;
            initialPlaceholder = {
                fingerprint: '',
                tempId,
                gridX: grid.x,
                gridY: grid.y,
                exits: new Map(),
                visitCount: 0,
            };
            createTempRoom(client, initialPlaceholder);

            // Defer map render: the current enterLocation(19494) event still has
            // pending listeners (e.g. map moveHandler) that would override our view.
            // By deferring, we render after all handlers for room 19494 complete.
            setTimeout(() => rebuildAndRender(client, tempId), 0);
        }
    });

    // Room transitions via gmcp.room.info: start capture or deactivate
    client.on("gmcp.room.info", (value) => {
        if (!isActive) return;

        // Rooms with map position data are not in the labyrinth — deactivate
        if (value?.map) {
            deactivate(client);
            return;
        }

        // Suppress normal map position update
        client.Map.refreshPosition = false;

        // Start description capture for this room
        captureState = {
            phase: 'capturing',
            lines: [],
            direction: pendingDirection,
            sourceFingerprint: currentFingerprint,
        };
        pendingDirection = null;
    });

    // Capture description lines (room.long) and detect exit line to finish
    client.Triggers.registerTrigger(
        /.+/,
        (line) => {
            if (captureState.phase !== 'capturing') return line;

            const text = line.text ?? (typeof line === 'string' ? line : String(line));

            // Check if this is an exit line
            const match = text.match(LABYRINTH_EXIT_PATTERN);
            if (match) {
                const descLines = captureState.lines;
                const dir = captureState.direction;
                const src = captureState.sourceFingerprint;
                captureState = {phase: 'idle'};
                finishCapture(client, descLines, match[1], dir, src);
                return line;
            }

            captureState.lines.push(text);

            // Highlight "studnia" in description lines
            if (/studnia/i.test(text)) {
                line.colorWords("studnia", COLOR_STUDNIA, {caseInsensitive: true});
                line.createLinksForText("studnia", {
                    onClick: () => client.sendCommand(STUDNIA_COMMAND),
                    title: STUDNIA_COMMAND,
                }, {caseInsensitive: true});
            }
            return line;
        },
        tag
    );
}
