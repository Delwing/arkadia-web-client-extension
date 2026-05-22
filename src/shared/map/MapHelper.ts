import {MapReader, PathFinder} from "mudlet-map-renderer";
import {getLongDir, getShortDir, longToShort} from "./directions";
import {characterStorage} from "@modules/core/storage";

type Position = {
    x: number;
    y: number;
    z: number;
    id: string;
    name: string;
};

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
    down: {x: 0, y: 0, z: -1},
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

    shouldSetDrinkableBind?(): boolean;

    setPreWalkCommands?(cmds: string[]): void;
    setPostWalkCommands?(cmds: string[]): void;
}

export interface MapStorage {
    getItem(key: string): any;

    setItem(key: string, value: any): void;
}

export interface MapHelperOptions {
    storage?: MapStorage;
}

const defaultStorage: MapStorage = {
    getItem: () => characterStorage.get('mapperRoomId'),
    setItem: (_key: string, value: any) => characterStorage.set('mapperRoomId', value),
};

// 20-color palette for trip planner segments - visually distinct colors
export const SEGMENT_COLORS = [
    '#7FFF00', // chartreuse (green-yellow)
    '#FF6B6B', // coral red
    '#4ECDC4', // teal
    '#FFE66D', // yellow
    '#95E1D3', // mint
    '#F38181', // salmon
    '#AA96DA', // lavender
    '#FCBAD3', // pink
    '#A8D8EA', // light blue
    '#FF9F43', // orange
    '#26DE81', // green
    '#FC5C65', // red
    '#45AAF2', // sky blue
    '#FED330', // gold
    '#2BCBBA', // turquoise
    '#EB3B5A', // crimson
    '#FA8231', // tangerine
    '#20BF6B', // emerald
    '#8854D0', // purple
    '#3867D6', // royal blue
];

export default class MapHelper {
    public currentRoom!: MapData.Room;
    public readonly locationHistory: number[] = [];
    private readonly client: MapHelperClient;
    private readonly storage: MapStorage;
    private mapReader!: MapReader;
    private pathFinder!: PathFinder;
    public refreshPosition = true;
    private hashes: Record<string, number> = {};
    private internalIds: Record<string, number> = {};
    private gmcpPosition!: Position;
    public paused = false;
    private savedRoomId: number | null = null;
    private onTransport = false;
    private lastMoveDirection: string | null = null;
    private areas: Record<string, string> = {};
    private mapReadyCallbacks: ((mapData: MapData.Map, colors: any) => void)[] = [];
    private mapData?: MapData.Map;
    private colors?: any;
    private mapReady = false;
    public isBlockable = false;
    private _destinations: number[] = [];
    private _transportRoute: {
        walkSegments: Array<{ path: number[]; color: string }>;
        hops: Array<{ fromRoomId: number; toRoomId: number; transportName: string; label?: string; color: string }>;
    } | null = null;
    private highlights: number[] = [];
    private pendingBindAbort?: AbortController;
    private highlighterIdCounter = 0;
    private highlighters: Map<string, { roomIds: Set<number>; color: string; enabled: boolean }> = new Map();

    get destinations(): number[] {
        return this._destinations;
    }

    constructor(client: MapHelperClient, options: MapHelperOptions = {}) {
        this.client = client;
        this.storage = options.storage ?? defaultStorage;

        const saved = this.storage.getItem('mapperRoomId');
        if (saved != null) {
            const parsed = parseInt(String(saved));
            if (!Number.isNaN(parsed)) {
                this.savedRoomId = parsed;
            }
        }

        this.client.on("enterLocation", detail => this.handleNewLocation(detail as { room: any }));
        this.client.on("stepBack", () => this.pendingBindAbort?.abort());
        this.client.on("transport.onBoard", (v: boolean) => { this.onTransport = v; });

        this.client.on("renderMapLocation", (ev: { locationId: number }) => {
            this.renderRoomByIdSilently(ev.locationId);
        });

        this.client.on("leadToByInternalId", (internalId: string) => {
            if (!internalId) return;
            const roomId = this.internalIds[internalId];
            if (roomId != null) {
                this.leadTo(roomId);
            }
        });

        this.client.on("gmcp.room.info", (eventDetail) => {
            this.setBlockable(false);
            this.gmcpPosition = eventDetail?.map;
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
            const value = characterStorage.get('mapperRoomId');
            if (value != null) {
                const parsed = parseInt(String(value));
                if (!Number.isNaN(parsed)) {
                    this.savedRoomId = parsed;
                    this.setMapRoomById(this.savedRoomId, {silent: true});
                }
            }
        });

        this.client.on("reset", () => {
            this.gmcpPosition = undefined;
            this.client.sendEvent("refreshPositionWhenAble");
        })

        this.client.on("map.setLocation", (data: { roomId: number }) => {
            this.setMapRoomById(data.roomId);
        });

        this.client.on("leadTo", (target: number) => {
            this.leadTo(target);
        });

        this.client.on("clearLeadTo", () => {
            this.clearLeadTo();
        });

        this.client.on("tripPlanner.leadTo", (targets: number[]) => {
            this.setMultiDestinations(targets);
        });

        this.client.on("highlights", (highlights: number[]) => {
            this.setHighlights(highlights);
        });

        this.client.on("requestMapLocationLabel", () => {
            this.emitLocationLabel();
        });

        this.client.on("requestMapHighlights", () => {
            this.emitHighlights();
        });

        this.client.on("requestMapPath", () => {
            this.emitPath();
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
        this.internalIds = {};
        this.areas = {};
        this.mapReader.getRooms().forEach(room => {
            this.hashes[room.hash] = room.id;
            const internalId = room.userData?.internal_id;
            if (internalId) {
                this.internalIds[internalId] = room.id;
            }
        });
        const startId = this.savedRoomId ?? 1;
        this.renderRoomById(startId);
        this.mapReader.getAreas().forEach(area => {
            this.areas[area.getAreaId()] = area.getAreaName();
        });
        this.mapReady = true;
        this.mapReadyCallbacks.forEach(cb => cb(mapData, colors));
        this.mapReadyCallbacks = [];
        this.client.sendEvent("mapReady");
        return {startId, reader: this.mapReader, pathFinder: this.pathFinder};
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

    getRoomIdByInternalId(internalId: string): number | null {
        return this.internalIds[internalId] ?? null;
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
            return {direction, moved: false};
        }
        if (this.paused) {
            return {direction, moved: false};
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
                const specialExitMatch = this.currentRoom.specialExits
                    ? Object.entries(this.currentRoom.specialExits)
                        .filter(([_, id]) => {
                            const target = this.mapReader.getRoom(id);
                            return this.findRoomByExit(this.currentRoom, target, potentialExit);
                        })
                        .map(([exit]) => exit)
                    : [];
                if (specialExitMatch.length > 0) {
                    actualDirection = getShortDir(specialExitMatch[0]);
                } else {
                    const exits = Object.entries(allExits)
                        .filter(([_, id]) => {
                            const target = this.mapReader.getRoom(id);
                            return this.findRoomByExit(this.currentRoom, target, potentialExit);
                        })
                        .map(([exit]) => exit);
                    if (exits.length > 0) {
                        actualDirection = getShortDir(exits[0]);
                    }
                }
            }

            if (actualDirection !== direction) {
                if (!isTeamFollow) {
                    this.client.sendCommand(actualDirection);
                }
                return {direction: actualDirection, moved: false, suppress: true};
            }

            const locationId = allExits[getLongDir(actualDirection)];
            if (locationId) {
                this.locationHistory.push(locationId);
                this.lastMoveDirection = getLongDir(actualDirection);
                this.renderRoomById(locationId, true);
                if (!this.client.getSuppressMapMoveEvent()) {
                    this.client.sendEvent("mapMove");
                } else {
                    this.client.setSuppressMapMoveEvent(false);
                }
                return {direction: actualDirection, moved: true};
            }
        }
        return {direction: actualDirection, moved: false};
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

        if (!this.isGmcpPositionCurrent()) {
            this.refreshPosition = true;
        }

        return undefined;
    }

    private isGmcpPositionCurrent(): boolean {
        if (!this.gmcpPosition || !this.currentRoom) return false;
        const hash = `${this.gmcpPosition.x}:${this.gmcpPosition.y}:0:${this.gmcpPosition.name}`;
        return this.hashes[hash] === this.currentRoom.id;
    }

    refresh() {
        const roomId = this.currentRoom.id;
        if (this.setMapPosition(this.gmcpPosition)) {
            this.refreshPosition = false;
        }
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

    setMapRoomById(id: number, options?: { silent?: boolean; direction?: string | null }) {
        if (this.currentRoom?.id === id) {
            if (!options?.silent) {
                this.client.sendEvent("enterLocation", {
                    id,
                    room: this.currentRoom,
                    direction: options?.direction ?? null
                });
            }
            return;
        }
        this.locationHistory.length = 0;
        this.locationHistory.push(id);
        this.lastMoveDirection = options?.direction ?? null;
        this.renderRoomById(id);
    }

    setMapRoom(room: number, direction?: string | null) {
        this.locationHistory.length = 0;
        this.locationHistory.push(room);
        this.lastMoveDirection = direction ?? null;
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
        this.storage.setItem('mapperRoomId', id);
        if (sendEvent) {
            const direction = this.lastMoveDirection;
            this.lastMoveDirection = null;
            this.client.sendEvent("enterLocation", {id, room: this.currentRoom, direction});
        }
        this.removeReachedDestination(id);
        this.emitDrawData();
    }

    findRoomByExit(room: MapData.Room, targetRoom: MapData.Room, targetDir: string) {
        if (room.area !== targetRoom.area) {
            return false;
        }

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

    static parseBind(bindStr: string): { command: string; delay: number | null }[] {
        const result: { command: string; delay: number | null }[] = [];
        const parts = bindStr.split(/[#;]/);
        for (const part of parts) {
            const segments = part.split('*');
            const command = segments[0];
            if (!command) continue;
            const delay = segments.length >= 2 ? parseFloat(segments[1]) : null;
            result.push({command, delay: delay != null && !isNaN(delay) ? delay : null});
        }
        return result;
    }

    static getBindPrintable(bindStr: string): string {
        const parts = bindStr.split(/[#;]/);
        return parts.map(part => part.split('*')[0]).filter(Boolean).join(';');
    }

    executeBind(bindStr: string) {
        const commands = MapHelper.parseBind(bindStr);
        for (const cmd of commands) {
            if (cmd.delay != null && cmd.delay > 0) {
                setTimeout(() => this.client.sendCommand(cmd.command), cmd.delay * 1000);
            } else {
                this.client.sendCommand(cmd.command);
            }
        }
    }

    handleNewLocation({room}: { room: MapData.Room }) {
        if (room?.userData?.walk_pre_cmd !== undefined) {
            const val: string = room.userData.walk_pre_cmd;
            this.client.setPreWalkCommands?.(
                val === '<reset>' ? [] : val.split('#').map((s: string) => s.trim()).filter(Boolean)
            );
        }
        if (room?.userData?.walk_post_cmd !== undefined) {
            const val: string = room.userData.walk_post_cmd;
            this.client.setPostWalkCommands?.(
                val === '<reset>' ? [] : val.split('#').map((s: string) => s.trim()).filter(Boolean)
            );
        }

        const abortController = new AbortController();
        this.pendingBindAbort = abortController;
        const roomId = room?.id;

        this.client.on(
            "output-sent",
            () => {
                if (abortController.signal.aborted) {
                    return;
                }
                this.pendingBindAbort = undefined;
                if (typeof roomId === "number" && this.currentRoom?.id !== roomId) {
                    return;
                }
                if (room?.userData?.bind) {
                    const bindStr = room.userData.bind;
                    const printable = MapHelper.getBindPrintable(bindStr);
                    this.client.functionalBind?.set(
                        printable,
                        () => this.executeBind(bindStr)
                    );
                } else if (room?.userData?.drinkable && !this.onTransport && this.client.shouldSetDrinkableBind?.() !== false) {
                    this.client.functionalBind?.set(
                        "napij sie do syta wody",
                        () => this.client.sendCommand("napij sie do syta wody")
                    );
                }
            },
            {once: true, signal: abortController.signal}
        );
    }

    getAreaName(id: string) {
        return this.areas[id];
    }

    findPath(fromId: number, targetId: number) {
        return this.pathFinder.findPath(fromId, targetId);
    }

    leadTo(id: number) {
        const currentId = this.currentRoom?.id;
        if (currentId === id) {
            this.client.sendEvent("notify", { text: 'Jestes juz na miejscu' });
            return;
        }
        const path = this.pathFinder?.findPath(currentId, id);
        if (!path || path.length <= 1) {
            this.client.sendEvent("notify", { text: 'Brak sciezki do lokacji' });
            return;
        }
        this._destinations = [id];
        this._transportRoute = null;
        this.emitDrawData();
    }

    setMultiDestinations(ids: number[]) {
        this._destinations = ids;
        this._transportRoute = null;
        this.emitDrawData();
    }

    clearLeadTo() {
        this._destinations = [];
        this._transportRoute = null;
        this.emitDrawData();
    }

    setTransportRoute(route: {
        walkSegments: Array<{ path: number[]; color: string }>;
        hops: Array<{ fromRoomId: number; toRoomId: number; transportName: string; label?: string; color: string }>;
        finalDestination?: number;
    }) {
        this._transportRoute = { walkSegments: route.walkSegments, hops: route.hops };
        this._destinations = typeof route.finalDestination === "number" ? [route.finalDestination] : [];
        this.emitDrawData();
    }

    clearTransportRoute() {
        this._transportRoute = null;
        this.emitDrawData();
    }

    setHighlights(highlights: number[]) {
        this.highlights = highlights;
        this.emitDrawData();
    }

    createHighlighter(options?: { color?: string; enabled?: boolean }): {
        id: string;
        add: (roomIds: number | number[]) => void;
        remove: (roomIds: number | number[]) => void;
        clear: () => void;
        enable: () => void;
        disable: () => void;
        isEnabled: () => boolean;
        setColor: (color: string) => void;
        getColor: () => string;
        getRoomIds: () => number[];
        destroy: () => void;
    } {
        const id = `highlighter_${++this.highlighterIdCounter}`;
        const state = {
            roomIds: new Set<number>(),
            color: options?.color ?? "yellow",
            enabled: options?.enabled ?? true
        };
        this.highlighters.set(id, state);

        const emitIfNeeded = () => {
            if (state.enabled) {
                this.emitHighlights();
            }
        };

        return {
            id,
            add: (roomIds: number | number[]) => {
                const ids = Array.isArray(roomIds) ? roomIds : [roomIds];
                ids.forEach(roomId => state.roomIds.add(roomId));
                emitIfNeeded();
            },
            remove: (roomIds: number | number[]) => {
                const ids = Array.isArray(roomIds) ? roomIds : [roomIds];
                ids.forEach(roomId => state.roomIds.delete(roomId));
                emitIfNeeded();
            },
            clear: () => {
                state.roomIds.clear();
                emitIfNeeded();
            },
            enable: () => {
                if (!state.enabled) {
                    state.enabled = true;
                    this.emitHighlights();
                }
            },
            disable: () => {
                if (state.enabled) {
                    state.enabled = false;
                    this.emitHighlights();
                }
            },
            isEnabled: () => state.enabled,
            setColor: (color: string) => {
                state.color = color;
                emitIfNeeded();
            },
            getColor: () => state.color,
            getRoomIds: () => Array.from(state.roomIds),
            destroy: () => {
                this.highlighters.delete(id);
                this.emitHighlights();
            }
        };
    }

    removeHighlighter(id: string) {
        if (this.highlighters.delete(id)) {
            this.emitHighlights();
        }
    }

    removeReachedDestination(roomId: number) {
        const index = this._destinations.indexOf(roomId);
        if (index > -1) {
            this._destinations.splice(index, 1);
        }
    }

    emitDrawData() {
        this.emitPath();
        this.emitHighlights();
        this.emitLocationLabel();
    }

    emitPath() {
        if (this._transportRoute) {
            this.client.sendEvent("mapPath", { segments: this._transportRoute.walkSegments });
            this.client.sendEvent("mapTransportHops", this._transportRoute.hops);
            return;
        }
        this.client.sendEvent("mapTransportHops", null);
        const currentId = this.currentRoom?.id;
        if (this._destinations.length > 0 && currentId) {
            // Build path segments through all destinations, each with a different color
            const segments: Array<{ path: number[]; color: string }> = [];
            let fromId = currentId;
            let colorIndex = 0;
            for (const destId of this._destinations) {
                const segment = this.pathFinder?.findPath(fromId, destId);
                if (segment && segment.length > 0) {
                    segments.push({
                        path: segment,
                        color: SEGMENT_COLORS[colorIndex % SEGMENT_COLORS.length]
                    });
                    colorIndex++;
                    fromId = destId;
                }
            }
            if (segments.length > 0) {
                this.client.sendEvent("mapPath", { segments });
                return;
            }
        }
        this.client.sendEvent("mapPath", null);
    }

    emitHighlights() {
        const allHighlights: { roomId: number; color: string }[] = [];

        // Add legacy highlights (from setHighlights/zaznaczaj)
        for (const roomId of this.highlights) {
            allHighlights.push({ roomId, color: "yellow" });
        }

        // Add highlights from all enabled highlighters
        for (const state of this.highlighters.values()) {
            if (state.enabled) {
                for (const roomId of state.roomIds) {
                    allHighlights.push({ roomId, color: state.color });
                }
            }
        }

        this.client.sendEvent("mapHighlights", allHighlights);
    }

    emitLocationLabel() {
        this.client.sendEvent("mapLocationLabel", this.buildLocationLabel());
    }

    private buildLocationLabel(): string {
        const currentId = this.currentRoom?.id;
        if (!currentId || !this.mapReader) {
            return "";
        }

        const room = this.currentRoom;
        const area = this.mapReader.getArea(room?.area);
        if (!area) {
            return "";
        }

        const roomName = room?.name || "";
        const areaName = area.getAreaName();
        const showRoomName = roomName && roomName !== String(currentId);
        let text = showRoomName ? `#${currentId} ${roomName} (${areaName})` : `#${currentId} ${areaName}`;

        if (this._destinations.length > 0) {
            // Calculate total distance through all destinations
            let totalDistance = 0;
            let fromId = currentId;
            let hasValidPath = false;
            for (const destId of this._destinations) {
                const segment = this.pathFinder?.findPath(fromId, destId);
                if (segment && segment.length > 0) {
                    totalDistance += segment.length - 1;
                    fromId = destId;
                    hasValidPath = true;
                }
            }

            if (hasValidPath) {
                const finalDestId = this._destinations[this._destinations.length - 1];
                const destRoom = this.mapReader?.getRoom(finalDestId);
                const destArea = destRoom ? this.mapReader.getArea(destRoom.area) : null;
                const destName = destArea ? destArea.getAreaName() : String(finalDestId);

                if (this._destinations.length > 1) {
                    text += ` → #${finalDestId} ${destName} (${totalDistance}, ${this._destinations.length} przystankow)`;
                } else {
                    text += ` → #${finalDestId} ${destName} (${totalDistance})`;
                }
            }
        }

        return text;
    }
}
