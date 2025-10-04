import {MapReader} from "mudlet-map-renderer";
import Client from "./Client";
import { getItemSync, setItemSync } from "./storage";
import { getLongDir, getShortDir, longToShort } from "./utils/directions";
import Room = MapData.Room;

type MapReadyPayload = { mapData: MapData.Map; colors: any };

const STORAGE_KEY = 'mapperRoomId';

export { longToShort };


const directionDeltas = {
    north: {x: 0, y: 1, z: 0},
    south: {x: 0, y: -1, z: 0},
    east: {x: 1, y: 0, z: 0},
    west: {x: -1, y: 0, z: 0},
    northwest: {x: -1, y: 1, z: 0},
    northeast: {x: 1, y: 1, z: 0},
    southwest: {x: -1, y: -1, z: 0},
    southeast: {x: 1, y: -1, z: 0},
    up: {x: 0, y: 0, z: 1},
    down: {x: 0, y: 0, z: -1}
};

export default class MapHelper {

    currentRoom: Room;
    locationHistory: number[] = []
    client: Client
    mapReader: MapReader | null = null
    refreshPosition = true;
    hashes = {};
    gmcpPosition: Position;
    paused = false;
    savedRoomId: number | null = null;
    areas: Record<string, string> = {}
    private readyListeners: ((payload: MapReadyPayload) => void)[] = [];
    private readyPayload: MapReadyPayload | null = null;

    constructor(clientExtension: Client) {
        this.client = clientExtension
        const savedData = getItemSync(STORAGE_KEY);
        const saved = savedData ? savedData[STORAGE_KEY] : null;
        if (saved) {
            this.savedRoomId = parseInt(saved);
        }
        this.client.addEventListener('enterLocation', (event) => this.handleNewLocation(event.detail))

        this.client.addEventListener('gmcp.room.info', (event: CustomEvent) => {
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

    initialize(mapData: MapData.Map, colors: any): number {
        const reader = new MapReader(mapData, colors)
        this.mapReader = reader
        this.hashes = {}
        // @ts-ignore
        Object.values(reader.roomIndex).forEach((room: any) => this.hashes[room.hash] = room)
        this.areas = {}
        reader.getAreas().forEach(area => {
            this.areas[area.areaId] = area.areaName
        })
        const payload: MapReadyPayload = { mapData, colors }
        this.readyPayload = payload
        this.readyListeners.splice(0).forEach(listener => listener(payload))
        const startId = this.savedRoomId ?? 1
        return startId
    }

    onReady(listener: (payload: MapReadyPayload) => void) {
        if (this.readyPayload) {
            listener(this.readyPayload)
            return
        }
        this.readyListeners.push(listener)
    }

    setPaused(paused: boolean) {
        this.paused = paused;
    }

    parseCommand(command) {
        if (command === "zerknij" || command === "spojrz" || command === "sp") {
            this.refreshPosition = true;
        }
        if (command.trim() === "idz") {
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
                if (dirBinds[getLongDir(command)]) {
                    return dirBinds[getLongDir(command)]
                }
            }
        }
        return command
    }

    move(direction: string) {
        if (this.paused) {
            return {direction, moved: false}
        }
        const reader = this.mapReader;
        if (!reader) {
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
                    const target = reader.getRoomById(id);
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
        const reader = this.mapReader;
        if (!reader) {
            this.savedRoomId = id;
            return;
        }
        if (this.currentRoom?.id === id) {
            return;
        }
        this.setMapRoom(reader.getRoomById(id))
    }

    setMapRoom(room: Room | undefined) {
        if (!room) {
            return;
        }
        this.locationHistory = [room.id]
        this.renderRoom(room);
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

    renderRoom(room: Room) {
        this.renderRoomById(room.id)
    }

    renderRoomById(id: number, sendEvent = true) {
        const reader = this.mapReader;
        if (!reader) {
            return;
        }
        const room = reader.getRoomById(id)
        if (!room) {
            return;
        }
        this.currentRoom = room
        setItemSync(STORAGE_KEY, id.toString())
        if (sendEvent) {
            this.client.sendEvent('enterLocation', {id: id, room});
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

}
