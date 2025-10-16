import Client from "./Client";
import { getItemSync, setItemSync } from "./storage";
import { getLongDir, getShortDir, longToShort } from "./utils/directions";
import Room = MapData.Room;
import { MapReader, PathFinder } from "mudlet-map-renderer"

const STORAGE_KEY = 'mapperRoomId';

export { longToShort };


const directionDeltas = {
    north: {x: 0, y: -1, z: 0},
    south: {x: 0, y: 1, z: 0},
    east: {x: 1, y: 0, z: 0},
    west: {x: -1, y: 0, z: 0},
    northwest: {x: -1, y: -1, z: 0},
    northeast: {x: 1, y: -1, z: 0},
    southwest: {x: -1, y: 1, z: 0},
    southeast: {x: 1, y: 1, z: 0},
    up: {x: 0, y: 0, z: 1},
    down: {x: 0, y: 0, z: -1}
};

export default class MapHelper {

    currentRoom: Room;
    locationHistory: number[] = []
    client: Client
    mapReader!: MapReader
    pathFinder!: PathFinder
    refreshPosition = true;
    hashes = {};
    gmcpPosition: Position;
    paused = false;
    savedRoomId: number | null = null;
    areas: Record<string, string> = {}
    isBlockable = false;
    private mapReadyCallbacks: ((mapData: MapData.Map, colors: any) => void)[] = [];
    private mapData?: MapData.Map;
    private colors?: any;
    private mapReady = false;

    constructor(clientExtension: Client) {
        this.client = clientExtension
        const savedData = getItemSync(STORAGE_KEY);
        const saved = savedData ? savedData[STORAGE_KEY] : null;
        if (saved) {
            this.savedRoomId = parseInt(saved);
        }
        this.client.addEventListener('enterLocation', (event) => this.handleNewLocation(event.detail))

        this.client.addEventListener('gmcp.room.info', (event: CustomEvent) => {
            this.setBlockable(false);
            this.gmcpPosition = event.detail.map;
            if (this.refreshPosition) {
                this.setMapPosition(this.gmcpPosition)
                this.refreshPosition = false
            }
        })

        this.client.addEventListener('refreshPositionWhenAble', () => {
            this.refreshPosition = true;
        });

        this.client.addEventListener('gmcp.char.info', () => {
            const listener = (event: CustomEvent) => {
                if (event.detail.key === STORAGE_KEY) {
                    const value = parseInt(event.detail.value);
                    if (!isNaN(value)) {
                        this.savedRoomId = value;
                        this.setMapRoomById(this.savedRoomId);
                    }
                }
            };
            this.client.addEventListener('storage', listener);
        });

        this.client.sendEvent('refreshPositionWhenAble');
    }

    setBlockable(isBlockable: boolean) {
        this.isBlockable = isBlockable;
    }

    initialize(mapData: MapData.Map, colors: any): { startId: number; reader: MapReader, pathFinder: PathFinder } {
        this.mapData = mapData;
        this.colors = colors;
        this.mapReader = new MapReader(mapData, colors)
        this.pathFinder = new PathFinder(this.mapReader)
        this.hashes = {}
        this.areas = {}
        this.mapReader.getRooms().forEach(room => this.hashes[room.hash] = room.id)
        const startId = this.savedRoomId ?? 1;
        this.renderRoomById(startId)
        this.mapReader.getAreas().forEach(area => {
            this.areas[area.getAreaId()] = area.getAreaName()
        })
        this.mapReady = true;
        this.mapReadyCallbacks.forEach(cb => cb(mapData, colors));
        this.mapReadyCallbacks = [];
        return { startId, reader: this.mapReader, pathFinder: this.pathFinder };
    }

    onMapReady(callback: (mapData: MapData.Map, colors: any) => void) {
        if (this.mapReady && this.mapData && this.colors) {
            callback(this.mapData, this.colors)
            return;
        }
        this.mapReadyCallbacks.push(callback)
    }

    getMapReader(): MapReader {
        if (!this.mapReader) {
            throw new Error("Map reader not initialized");
        }
        return this.mapReader
    }

    tryGetMapReader(): MapReader | null {
        return this.mapReader ?? null;
    }

    getRoomById(id: number): Room | null {
        if (!this.mapReader) {
            return null;
        }
        const reader: any = this.mapReader as any;
        if (typeof reader.getRoomById === "function") {
            return reader.getRoomById(id) ?? null;
        }
        const room = this.mapReader.getRoom(id);
        return room ?? null;
    }

    setPaused(paused: boolean) {
        this.paused = paused;
    }

    parseCommand(command: string): string | null {
        const trimmed = command.trim()
        const lowerTrimmed = trimmed.toLowerCase()
        if (lowerTrimmed === "idz") {
            this.refreshPosition = true;
            if (this.currentRoom) {
                const allExits = Object.assign(
                    {},
                    this.currentRoom.exits ?? {},
                    this.currentRoom.specialExits ?? {}
                );
                const exitDirs = Object.keys(allExits);
                if (exitDirs.length === 2 && this.locationHistory.length >= 2) {
                    const prevId = this.locationHistory[this.locationHistory.length - 2];
                    const cameFrom = exitDirs.find(d => allExits[d] === prevId);
                    const alt = exitDirs.find(d => d !== cameFrom);
                    if (alt) {
                        return longToShort[alt] ?? alt;
                    }
                }
            }
        }
        if (this.currentRoom) {
            if (this.currentRoom.userData.dir_bind) {
                const dirBinds = Object.fromEntries(this.currentRoom.userData.dir_bind.split("&").map((item: string) => item.split("=")))
                const longDir = getLongDir(trimmed)
                if (dirBinds[longDir]) {
                    return dirBinds[longDir]
                }
            }
        }
        return command
    }

    move(direction: string) {
        if (!this.mapReader) {
            return {direction, moved: false}
        }
        if (this.paused) {
            return {direction, moved: false}
        }
        let actualDirection = direction
        if (this.currentRoom) {
            const allExits = Object.assign(
                {},
                this.currentRoom.exits ?? {},
                this.currentRoom.specialExits ?? {}
            );
            const potentialExit = getLongDir(direction);
            if (!this.currentRoom.exits || !this.currentRoom.exits[potentialExit]) {
                const exits = Object.entries(allExits).filter(([_, id]) => {
                    const target = this.mapReader.getRoom(id);
                    return this.findRoomByExit(this.currentRoom, target, getLongDir(direction));
                }).map(([exit]) => exit);
                if (exits.length > 0) {
                    actualDirection = getShortDir(exits[0]);
                }
            }

            const locationId = allExits[getLongDir(actualDirection)]
            if (locationId) {
                this.locationHistory.push(locationId)
                this.renderRoomById(locationId, true);
                if (!this.client.suppressMapMoveEvent) {
                    this.client.sendEvent('mapMove')
                } else {
                    this.client.suppressMapMoveEvent = false
                }
                return {direction: actualDirection, moved: true}
            }
        }
        return {direction: actualDirection, moved: false}
    }

    followMove(direction: string) {
        const result = this.move(direction)
        if (result.moved) {
            return;
        }

        if (this.currentRoom?.userData?.team_follow_link) {
            const entries = this.currentRoom.userData.team_follow_link.split('#')
            for (const entry of entries) {
                const [search, exit] = entry.split('*')
                if (search && exit && direction.includes(search)) {
                    const res = this.move(exit)
                    if (res.moved) {
                        return res.direction
                    }
                }
            }
        }
        if (this.currentRoom?.specialExits) {
            const specials = Object.keys(this.currentRoom.specialExits)
            for (const ex of specials) {
                if (direction.includes(ex)) {
                    const res = this.move(ex)
                    if (res.moved) {
                        return res.direction
                    }
                }
            }
            for (const ex of specials) {
                const part = ex.substring(0, Math.ceil(ex.length * 0.7))
                if (direction.includes(part)) {
                    const res = this.move(ex)
                    if (res.moved) {
                        return res.direction
                    }
                }
            }
        }

        return direction
    }

    refresh() {
        this.setMapPosition(this.gmcpPosition)
    }

    setMapPosition(data: Position) {
        if (data && data.x && data.y && data.name) {
            const hash = `${data.x}:${data.y}:0:${data.name}`;
            const room = this.hashes[hash];
            this.setMapRoom(room)
        }
    }

    setMapRoomById(id: number) {
        if (this.currentRoom?.id === id) {
            return;
        }
        this.renderRoomById(id)
    }

    setMapRoom(room: number) {
        this.locationHistory = [room]
        this.renderRoomById(room);
        if (!this.client.suppressMapMoveEvent) {
            this.client.sendEvent('mapMove')
        } else {
            this.client.suppressMapMoveEvent = false
        }
    }

    moveBack() {
        this.locationHistory.pop()
        if (!this.locationHistory[this.locationHistory.length - 1]) {
            this.client.sendEvent('stepBack')
            return
        }
        this.renderRoomById(this.locationHistory[this.locationHistory.length - 1])
        this.client.sendEvent('stepBack')
        if (!this.client.suppressMapMoveEvent) {
            this.client.sendEvent('mapMove')
        } else {
            this.client.suppressMapMoveEvent = false
        }
    }

    renderRoomById(id: number, sendEvent = true) {
        if (!this.mapReader) {
            this.savedRoomId = id;
            return;
        }
        this.currentRoom = this.mapReader.getRoom(id)
        this.savedRoomId = id;
        setItemSync(STORAGE_KEY, id.toString())
        if (sendEvent) {
            this.client.sendEvent('enterLocation', {id: id, room: this.currentRoom});
        }
    }

    findRoomByExit(room: Room, targetRoom: Room, targetDir: string) {
        const delta = directionDeltas[targetDir];
        if (!delta) {
            return false;
        }
        const dx = targetRoom.x - room.x;
        const dy = targetRoom.y - room.y;
        const dz = targetRoom.z - room.z;

        const check = (d: number, expected: number) => {
            if (expected === 0) {
                return d === 0;
            }
            return expected > 0 ? d > 0 : d < 0;
        };

        return check(dx, delta.x) && check(dy, delta.y) && check(dz, delta.z);
    }

    handleNewLocation({room: room}) {
        this.client.addEventListener('output-sent', () => {
            if (room.userData?.bind) {
                this.client.FunctionalBind.set(room.userData?.bind, () => this.client.sendCommand(room.userData?.bind))
            } else if (room.userData?.drinkable) {
                this.client.FunctionalBind.set("napij sie do syta wody", () => this.client.sendCommand("napij sie do syta wody"))
            }
        }, {once: true})
    }

    getAreaName(id: string) {
        return this.areas[id]
    }

    findPath(fromId: number, targetId: number) {
        console.log("findPath", fromId, targetId)
        return this.pathFinder.findPath(fromId, targetId)
    }

}
