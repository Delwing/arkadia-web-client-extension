import { MapReader, PathFinder } from "mudlet-map-renderer";
import { getLongDir, getShortDir, longToShort } from "./directions";
import { getItemSync, setItemSync } from "@modules/core/storage";

const STORAGE_KEY = "mapperRoomId";

type Position = {
    x: number;
    y: number;
    z: number;
    id: string;
    name: string;
};

const directionDeltas = {
    north: { x: 0, y: -1, z: 0 },
    south: { x: 0, y: 1, z: 0 },
    east: { x: 1, y: 0, z: 0 },
    west: { x: -1, y: 0, z: 0 },
    northwest: { x: -1, y: -1, z: 0 },
    northeast: { x: 1, y: -1, z: 0 },
    southwest: { x: -1, y: 1, z: 0 },
    southeast: { x: 1, y: 1, z: 0 },
    up: { x: 0, y: 0, z: 1 },
    down: { x: 0, y: 0, z: -1 },
};

export interface MapFunctionalBind {
    set(key: string, fn: () => void): void;
}

export interface MapHelperClient {
    on(event: string, listener: (detail?: any) => void, options?: any): (() => void) | void;
    sendCommand(command: string, echo?: boolean, options?: any): void;
    sendEvent(event: string, payload?: any): void;
    getSuppressMapMoveEvent(): boolean;
    setSuppressMapMoveEvent(value: boolean): void;
    functionalBind?: MapFunctionalBind;
}

export interface MapStorage {
    getItem(key: string): any;
    setItem(key: string, value: any): void;
}

export interface MapHelperOptions {
    storage?: MapStorage;
}

const defaultStorage: MapStorage = {
    getItem: getItemSync,
    setItem: setItemSync,
};

export default class MapHelper {
    public currentRoom!: MapData.Room;
    public readonly locationHistory: number[] = [];
    private readonly client: MapHelperClient;
    private readonly storage: MapStorage;
    private mapReader!: MapReader;
    private pathFinder!: PathFinder;
    public refreshPosition = true;
    private hashes: Record<string, number> = {};
    private gmcpPosition!: Position;
    private paused = false;
    private savedRoomId: number | null = null;
    private areas: Record<string, string> = {};
    private mapReadyCallbacks: ((mapData: MapData.Map, colors: any) => void)[] = [];
    private mapData?: MapData.Map;
    private colors?: any;
    private mapReady = false;
    public isBlockable = false;

    constructor(client: MapHelperClient, options: MapHelperOptions = {}) {
        this.client = client;
        this.storage = options.storage ?? defaultStorage;

        const savedData = this.storage.getItem(STORAGE_KEY);
        const saved = savedData ? savedData[STORAGE_KEY] ?? savedData : null;
        if (saved) {
            const parsed = parseInt(String(saved));
            if (!Number.isNaN(parsed)) {
                this.savedRoomId = parsed;
            }
        }

        this.client.on("enterLocation", detail => this.handleNewLocation(detail as { room: any }));

        this.client.on("gmcp.room.info", (eventDetail) => {
            this.setBlockable(false);
            const detail = eventDetail as { map?: any };
            this.gmcpPosition = detail?.map;
            if (this.refreshPosition) {
                this.setMapPosition(this.gmcpPosition);
                this.refreshPosition = false;
            }
        });

        this.client.on("refreshPositionWhenAble", () => {
            if (!this.setMapPosition(this.gmcpPosition)) {
                this.refreshPosition = true;
            }
        });

        this.client.on("gmcp.char.info", () => {
            const unsubscribe = this.client.on("storage", ({ key, value }) => {
                if (key === STORAGE_KEY) {
                    const parsed = parseInt(String(value));
                    if (!Number.isNaN(parsed)) {
                        this.savedRoomId = parsed;
                        this.setMapRoomById(this.savedRoomId);
                    }
                    if (typeof unsubscribe === "function") {
                        unsubscribe();
                    }
                }
            });
        });

        this.client.sendEvent("refreshPositionWhenAble");
    }

    setBlockable(isBlockable: boolean) {
        this.isBlockable = isBlockable;
    }

    initialize(mapData: MapData.Map, colors: any): { startId: number; reader: MapReader; pathFinder: PathFinder } {
        this.mapData = mapData;
        this.colors = colors;
        this.mapReader = new MapReader(mapData, colors);
        this.pathFinder = new PathFinder(this.mapReader);
        this.hashes = {};
        this.areas = {};
        this.mapReader.getRooms().forEach(room => {
            this.hashes[room.hash] = room.id;
        });
        const startId = this.savedRoomId ?? 1;
        this.renderRoomById(startId);
        this.mapReader.getAreas().forEach(area => {
            this.areas[area.getAreaId()] = area.getAreaName();
        });
        this.mapReady = true;
        this.mapReadyCallbacks.forEach(cb => cb(mapData, colors));
        this.mapReadyCallbacks = [];
        return { startId, reader: this.mapReader, pathFinder: this.pathFinder };
    }

    onMapReady(callback: (mapData: MapData.Map, colors: any) => void) {
        if (this.mapReady && this.mapData && this.colors) {
            callback(this.mapData, this.colors);
            return;
        }
        this.mapReadyCallbacks.push(callback);
    }

    getMapReader(): MapReader {
        if (!this.mapReader) {
            throw new Error("Map reader not initialized");
        }
        return this.mapReader;
    }

    tryGetMapReader(): MapReader | null {
        return this.mapReader ?? null;
    }

    getRoomById(id: number): MapData.Room | null {
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
        if (this.currentRoom?.userData?.dir_bind) {
            const dirBinds = Object.fromEntries(
                this.currentRoom.userData.dir_bind
                    .split("&")
                    .map((item: string) => item.split("="))
            );
            if (dirBinds[getLongDir(command)]) {
                return dirBinds[getLongDir(command)];
            }
        }
        return command;
    }

    move(direction: string, isTeamFollow: boolean = false): { direction: string; moved: boolean; suppress?: boolean } {
        if (!this.mapReader) {
            return { direction, moved: false };
        }
        if (this.paused) {
            return { direction, moved: false };
        }
        let actualDirection = direction;
        if (this.currentRoom) {
            const allExits = Object.assign(
                {},
                this.currentRoom.exits ?? {},
                this.currentRoom.specialExits ?? {}
            );
            const potentialExit = getLongDir(direction);
            if (!this.currentRoom.exits || !this.currentRoom.exits[potentialExit]) {
                const exits = Object.entries(allExits)
                    .filter(([_, id]) => {
                        const target = this.mapReader.getRoom(id);
                        return this.findRoomByExit(this.currentRoom, target, getLongDir(direction));
                    })
                    .map(([exit]) => exit);
                if (exits.length > 0) {
                    actualDirection = getShortDir(exits[0]);
                }
            }

            if (actualDirection !== direction) {
                if (!isTeamFollow) {
                    this.client.sendCommand(actualDirection);
                }
                return { direction: actualDirection, moved: false, suppress: true };
            }

            const locationId = allExits[getLongDir(actualDirection)];
            if (locationId) {
                this.locationHistory.push(locationId);
                this.renderRoomById(locationId, true);
                if (!this.client.getSuppressMapMoveEvent()) {
                    this.client.sendEvent("mapMove");
                } else {
                    this.client.setSuppressMapMoveEvent(false);
                }
                return { direction: actualDirection, moved: true };
            }
        }
        return { direction: actualDirection, moved: false };
    }

    followMove(direction: string, fullFollow?: string) {
        const result = this.move(direction, true);
        if (result.moved) {
            return result.direction;
        }

       if (this.currentRoom?.specialExits) {
            const specials = Object.keys(this.currentRoom.specialExits);
            for (const ex of specials) {
                if (direction.includes(ex)) {
                    const res = this.move(ex, true);
                    if (res.moved) {
                        return res.direction;
                    }
                }
            }

            console.log(direction, specials);
            for (const ex of specials) {
                const part = ex.substring(0, Math.round(ex.length * 0.7));
                if (direction.includes(part)) {
                    const res = this.move(ex, true);
                    if (res.moved) {
                        return res.direction;
                    }
                }
            }
        }
        if (this.currentRoom?.userData?.team_follow_link) {
            const entries = this.currentRoom.userData.team_follow_link.split("#");
            for (const entry of entries) {
                const [search, exit] = entry.split("*");
                if (search && exit && direction.includes(search)) {
                    const res = this.move(exit, true);
                    if (res.moved) {
                        return res.direction;
                    }
                }
                if (fullFollow.includes(search)) {
                    const res = this.move(exit, true);
                    if (res.moved) {
                        return res.direction;
                    }
                }
            }
        }

        this.refreshPosition = true;

        return undefined;
    }

    refresh() {
        const roomId = this.currentRoom.id;
        this.setMapPosition(this.gmcpPosition);
        return roomId === this.currentRoom.id;
    }

    setMapPosition(data: Position) {
        if (data && data.x !== undefined && data.y !== undefined && data.name) {
            const hash = `${data.x}:${data.y}:0:${data.name}`;
            const room = this.hashes[hash];
            this.setMapRoom(room);
            this.refreshPosition = false;
            return true;
        }
        return false;
    }

    setMapRoomById(id: number) {
        if (this.currentRoom?.id === id) {
            return;
        }
        this.renderRoomById(id);
    }

    setMapRoom(room: number) {
        this.locationHistory.length = 0;
        this.locationHistory.push(room);
        this.renderRoomById(room);
        if (!this.client.getSuppressMapMoveEvent()) {
            this.client.sendEvent("mapMove");
        } else {
            this.client.setSuppressMapMoveEvent(false);
        }
    }

    moveBack() {
        this.locationHistory.pop();
        if (!this.locationHistory[this.locationHistory.length - 1]) {
            this.client.sendEvent("stepBack");
            return;
        }
        this.renderRoomById(this.locationHistory[this.locationHistory.length - 1]);
        this.client.sendEvent("stepBack");
        if (!this.client.getSuppressMapMoveEvent()) {
            this.client.sendEvent("mapMove");
        } else {
            this.client.setSuppressMapMoveEvent(false);
        }
    }

    renderRoomByIdSilently(id: number) {
        if (typeof id !== "number") {
            return;
        }
        const previousSuppress = this.client.getSuppressMapMoveEvent();
        this.client.setSuppressMapMoveEvent(true);
        try {
            this.renderRoomById(id, false);
        } finally {
            this.client.setSuppressMapMoveEvent(previousSuppress);
        }
    }

    renderRoomById(id: number, sendEvent = true) {
        if (!this.mapReader) {
            this.savedRoomId = id;
            return;
        }
        this.currentRoom = this.mapReader.getRoom(id);
        this.savedRoomId = id;
        this.storage.setItem(STORAGE_KEY, id.toString());
        if (sendEvent) {
            this.client.sendEvent("enterLocation", { id, room: this.currentRoom });
        }
    }

    findRoomByExit(room: MapData.Room, targetRoom: MapData.Room, targetDir: string) {
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

    handleNewLocation({ room }: { room: MapData.Room }) {
        this.client.on(
            "output-sent",
            () => {
                if (room?.userData?.bind) {
                    this.client.functionalBind?.set(
                        room.userData?.bind,
                        () => this.client.sendCommand(room.userData?.bind)
                    );
                } else if (room?.userData?.drinkable) {
                    this.client.functionalBind?.set(
                        "napij sie do syta wody",
                        () => this.client.sendCommand("napij sie do syta wody")
                    );
                }
            },
            { once: true }
        );
    }

    getAreaName(id: string) {
        return this.areas[id];
    }

    findPath(fromId: number, targetId: number) {
        return this.pathFinder.findPath(fromId, targetId);
    }
}
