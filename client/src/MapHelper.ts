import {MapReader} from "mudlet-map-renderer";
import Client from "./Client";
import Room = MapData.Room;

const STORAGE_KEY = 'mapperRoomId';

export const polishToEnglish = {
    ["polnoc"]: "north",
    ["poludnie"]: "south",
    ["wschod"]: "east",
    ["zachod"]: "west",
    ["polnocny-wschod"]: "northeast",
    ["polnocny-zachod"]: "northwest",
    ["poludniowy-wschod"]: "southeast",
    ["poludniowy-zachod"]: "southwest",
    ["dol"]: "down",
    ["gora"]: "up",
    ["gore"]: "up"
};
export const longToShort = {
    north: "n",
    south: "s",
    east: "e",
    west: "w",
    northeast: "ne",
    northwest: "nw",
    southeast: "se",
    southwest: "sw",
    up: "u",
    down: "d"
};

const exits = {
    "e": "east",
    "w": "west",
    "n": "north",
    "s": "south",
    "sw": "southwest",
    "se": "southeast",
    "nw": "northwest",
    "ne": "northeast",
    "u": "up",
    "d": "down"
};

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

function getLongDir(dir: string): string {
    return polishToEnglish[dir] ?? exits[dir] ?? dir;
}

function getShortDir(dir: string): string {
    return longToShort[dir] ?? dir;
}

export default class MapHelper {

    currentRoom: Room;
    locationHistory: number[] = []
    client: Client
    mapReader: MapReader
    refreshPosition = true;
    hashes = {};
    gmcpPosition: Position;
    savedRoomId: number | null = null;

    constructor(clientExtension: Client) {
        this.client = clientExtension
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            this.savedRoomId = parseInt(saved);
        }
        this.client.addEventListener('enterLocation', (event) => this.handleNewLocation(event.detail))
        window.addEventListener('map-ready', (event: CustomEvent) => {
            this.mapReader = new MapReader(event.detail.mapData, event.detail.colors)
            // @ts-ignore
            Object.values(this.mapReader.roomIndex).forEach(room => this.hashes[room.hash] = room);
            const startId = this.savedRoomId ?? 1;
            window.dispatchEvent(new CustomEvent('map-ready-with-data', {detail: {mapData: event.detail.mapData, colors: event.detail.colors, startId: startId}}))
            this.renderRoomById(startId)
        })

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

        this.client.sendEvent('refreshPositionWhenAble');
    }

    parseCommand(command) {
        if (command === "zerknij" || command === "spojrz" || command === "sp") {
            this.refreshPosition = true;
        }
        if (command.trim() === "idz") {
            this.refresh();
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
                    const target = this.mapReader.getRoomById(id);
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
        this.setMapRoom(this.mapReader.getRoomById(id))
    }

    setMapRoom(room: Room) {
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
        this.currentRoom = this.mapReader.getRoomById(id)
        localStorage.setItem(STORAGE_KEY, id.toString())
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

}