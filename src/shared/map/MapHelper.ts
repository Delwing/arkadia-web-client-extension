import {MapReader, PathFinder} from "mudlet-map-renderer";
import {describeCarriageRoute} from "./carriagePathFinder";
import {planRoute, type RouteSegment} from "./transportPathFinder";
import type {TransportDef} from "@client/scripts/transports/definitions";
import {getLongDir, getShortDir, isPolishDirection, longToShort} from "./directions";
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

/**
 * A single room's worth of live map edits. Only the fields present are touched.
 * See {@link MapHelper.applyRoomChanges}.
 */
export interface RoomChange {
    roomId: number;
    /**
     * What to do with the room:
     * - `patch` (default) — update an existing room, skip if it is missing.
     * - `upsert` — update, or create it when missing. Needs `area`.
     * - `delete` — remove the room from the map entirely.
     */
    op?: 'patch' | 'upsert' | 'delete';
    /** Area to place a newly created room in. Only read when upserting. */
    area?: number;
    name?: string;
    roomChar?: string;
    env?: number;
    weight?: number;
    x?: number;
    y?: number;
    z?: number;
    exits?: Partial<Record<MapData.direction, number>>;
    /** Replaces the room's special exits wholesale. */
    specialExits?: Record<string, number>;
    /**
     * Replaces the room's drawn exit lines wholesale, keyed by short direction
     * (`n`, `se`, …) or special-exit name. Points are in **source orientation**
     * (y-up), the same as `mapExport.json` — unlike `x`/`y` above, which the
     * reader has already flipped.
     */
    customLines?: Record<string, MapData.Line>;
    /** Merged into existing userData; a `null` value removes that key. */
    userData?: Record<string, string | null>;
}

/**
 * One area in the shape the renderer consumes — the same objects found in the
 * published `mapExport.json`. Coordinates are in **source orientation** (y-up,
 * as Mudlet stores them); {@link MapHelper.syncAreas} flips y on the way in,
 * exactly as `MapReader` does when it first builds the map.
 */
export interface MapAreaData {
    areaId: string | number;
    areaName?: string;
    rooms: MapData.Room[];
    labels?: unknown[];
}

/** Tuning for {@link MapHelper.applyRoomChanges}; every rebuild defaults to on. */
export interface ApplyChangesOptions {
    rebuildAreas?: boolean;
    rebuildPaths?: boolean;
    rerender?: boolean;
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

/** How to get there, when the plain way on foot is not what was asked for. */
export interface LeadOptions {
    /** Allow boarding ships and coaches on the way, as /prowadzt does. */
    transport?: boolean;
    /** Minimise walking at the price of more transfers, as /prowadzt! does. */
    aggressive?: boolean;
    /** Spell the route out; off while redrawing one that has already been explained. */
    announce?: boolean;
}

export interface MapStorage {
    getItem(key: string): any;

    setItem(key: string, value: any): void;
}

export interface MapHelperOptions {
    storage?: MapStorage;
    /**
     * Rooms a carriage may not enter, or null when not driving one. Injected rather than read from
     * client state so this stays UI- and client-agnostic; leadTo() consults it on every call, so
     * toggling carriage mode needs no invalidation.
     */
    carriageBlocks?: () => ReadonlySet<number> | null;
    /**
     * The transports that may be boarded on the way. Injected because the timetables live in the
     * client scripts, which this must not reach into.
     */
    transportDefs?: () => TransportDef[];
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
    private areaChangeListeners = new Set<(areaIds: number[]) => void>();
    private pathFinder!: PathFinder;
    public refreshPosition = true;
    // True when the most recent gmcp.room.info applied a position change that has
    // not yet been reconciled with a follow-step. Lets followMove() avoid moving
    // a second time on top of a position GMCP already advanced this step.
    private gmcpJustMoved = false;
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
    private readonly carriageBlocks?: () => ReadonlySet<number> | null;
    private readonly transportDefs?: () => TransportDef[];
    /** Where we are currently leading to, so the route can be redrawn when the rules change. */
    private leadTarget: number | null = null;
    /** How that lead was asked for, so redrawing it keeps riding what it was riding. */
    private leadOptions: LeadOptions = {};
    /** True while the drawn route came from the carriage router rather than the plain pathfinder. */
    private carriageLead = false;
    /** Transfer point already announced, so travelling along the route does not repeat itself. */
    private announcedTransfer: number | null = null;
    private pendingBindAbort?: AbortController;
    private highlighterIdCounter = 0;
    private highlighters: Map<string, { roomIds: Set<number>; color: string; enabled: boolean }> = new Map();

    get destinations(): number[] {
        return this._destinations;
    }

    constructor(client: MapHelperClient, options: MapHelperOptions = {}) {
        this.client = client;
        this.storage = options.storage ?? defaultStorage;
        this.carriageBlocks = options.carriageBlocks;
        this.transportDefs = options.transportDefs;

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
            // Reset per room.info so a leftover flag from a step without a
            // follow-step can't suppress the next step's relative move.
            this.gmcpJustMoved = false;
            if (this.refreshPosition) {
                const before = this.currentRoom?.id;
                this.setMapPosition(this.gmcpPosition);
                this.refreshPosition = false;
                if (this.currentRoom?.id !== before) {
                    this.gmcpJustMoved = true;
                }
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

        this.client.on("leadToWithTransport", (request: { roomId: number; aggressive?: boolean }) => {
            this.leadTo(request.roomId, { transport: true, aggressive: request.aggressive === true });
        });

        // Mounting or leaving a carriage changes which rooms are passable, as does marking one, so
        // a route already on screen has to be worked out again.
        this.client.on("carriageModeChanged", () => this.releadForChangedRules());
        this.client.on("carriageBlocks.changed", () => this.releadForChangedRules());
        // An ordinary lead is recomputed from the current room every time it is drawn, but a
        // planned route - by wagon, by ship - is stored as fixed segments, so without this it
        // stays frozen where the journey began instead of following us along it. Not while
        // actually aboard something, though: the rooms a vehicle passes through are its route, not
        // ours, and replanning from them would throw away the ride we are in the middle of.
        this.client.on("enterLocation", () => {
            if (this.onTransport) return;
            if (this.carriageLead || this._transportRoute) this.releadForChangedRules();
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
        // Announce through the same channel as every later change, so consumers
        // have a single code path — and so a rebuilt map tells views holding
        // their own reader reference that theirs is now stale.
        this.emitAreasChanged(this.getAreaIds());
        return {startId, reader: this.mapReader, pathFinder: this.pathFinder};
    }

    /** Every area id currently loaded. */
    getAreaIds(): number[] {
        if (!this.mapReader) {
            return [];
        }
        return this.mapReader.getAreas().map(area => area.getAreaId());
    }

    /**
     * Subscribe to area-scoped map changes — the single entry point for anything
     * derived from map data, such as the GPS triggers.
     *
     * Fires immediately with every loaded area when the map is already up, then
     * again whenever areas change, so one callback covers all four ways map data
     * arrives: the initial load, a whole map pushed from the editor, an area
     * synced from the editor, and a live room patch. Consumers can therefore
     * treat "these areas changed, rebuild them" as their only case, instead of
     * distinguishing first build from rebuild.
     *
     * @returns an unsubscribe function.
     */
    onAreasChanged(callback: (areaIds: number[]) => void): () => void {
        this.areaChangeListeners.add(callback);
        if (this.mapReady) {
            callback(this.getAreaIds());
        }
        return () => {
            this.areaChangeListeners.delete(callback);
        };
    }

    /** Tell area-scoped consumers which areas they need to rebuild. */
    private emitAreasChanged(areaIds: number[]) {
        if (areaIds.length === 0) {
            return;
        }
        this.areaChangeListeners.forEach(listener => listener(areaIds));
        this.client.sendEvent("mapDataChanged");
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

    /**
     * The pathfinder built alongside the current reader. Replaced whenever the
     * map is rebuilt, so views holding their own reference must re-read it.
     */
    getPathFinder(): PathFinder {
        return this.pathFinder;
    }

    tryGetMapReader(): MapReader | null {
        return this.mapReader ?? null;
    }

    getRoomIdByInternalId(internalId: string): number | null {
        return this.internalIds[internalId] ?? null;
    }

    /**
     * Swap in an entirely different map for the rest of the session.
     *
     * Rebuilds the reader, pathfinder and every index from scratch, which is why
     * it is the right tool when the shape of the map itself changed — areas
     * added or removed, or simply a different map than the one that was loaded.
     * {@link syncAreas} cannot express those, since the renderer builds its area
     * wrappers once at load.
     *
     * The player's position is preserved when the new map still has that room.
     * Colours are optional; the current palette is kept when none is supplied.
     *
     * In-memory only: the next map data refresh replaces this again.
     *
     * @returns false when the payload held no areas, in which case nothing changed.
     */
    replaceMap(mapData: MapData.Map, colors?: any): boolean {
        if (!Array.isArray(mapData) || mapData.length === 0) {
            return false;
        }
        // Keep the player where they are: initialize() restores savedRoomId,
        // which renderRoomById has been maintaining all along.
        this.savedRoomId = this.currentRoom?.id ?? this.savedRoomId;
        // initialize() announces every area, so no separate notification here.
        this.initialize(mapData, colors ?? this.colors);
        return true;
    }

    /**
     * Replace whole areas of the loaded map in place.
     *
     * The area is the renderer's natural unit — geometry and exits are cached
     * per area and rebuilt by `createPlanes()`/`createExits()` — so swapping one
     * wholesale covers every kind of edit at once: rooms, labels, custom lines,
     * added or removed rooms. That makes it the blunt-but-complete counterpart
     * to {@link applyRoomChanges}, which is cheaper but only speaks room fields.
     *
     * Areas the map does not already have are skipped: creating one needs a full
     * reload, since the renderer builds its area wrappers up front.
     *
     * Edits are memory-only and vanish when map data reloads.
     *
     * @returns how many areas were replaced.
     */
    syncAreas(areas: MapAreaData[]): number {
        if (!this.mapReader || areas.length === 0) {
            return 0;
        }
        const reader: any = this.mapReader as any;
        const rooms: Record<number, MapData.Room> = reader.rooms;
        const syncedAreaIds: number[] = [];
        let synced = 0;

        for (const incoming of areas) {
            const areaId = typeof incoming.areaId === "number" ? incoming.areaId : parseInt(incoming.areaId, 10);
            const wrapped = reader.areas?.[areaId];
            if (!wrapped?.area) {
                continue;
            }

            // Retire the outgoing rooms from every index that points at them.
            for (const room of wrapped.area.rooms ?? []) {
                delete rooms[room.id];
                if (room.hash) {
                    delete this.hashes[room.hash];
                }
                const internalId = room.userData?.internal_id;
                if (internalId) {
                    delete this.internalIds[internalId];
                }
            }

            // MapReader negates y when it first builds the map, so incoming data
            // in source orientation has to be flipped the same way here.
            const nextRooms = (incoming.rooms ?? []).map(room => ({...room, y: -room.y}));

            wrapped.area.rooms = nextRooms;
            wrapped.area.labels = incoming.labels ?? [];
            if (incoming.areaName) {
                wrapped.area.areaName = incoming.areaName;
                this.areas[areaId] = incoming.areaName;
            }

            for (const room of nextRooms) {
                rooms[room.id] = room;
                if (room.hash) {
                    this.hashes[room.hash] = room.id;
                }
                const internalId = room.userData?.internal_id;
                if (internalId) {
                    this.internalIds[internalId] = room.id;
                }
            }

            wrapped.planes = wrapped.createPlanes();
            wrapped.exits = new Map();
            wrapped.createExits();
            wrapped.markDirty();
            syncedAreaIds.push(areaId);
            synced++;
        }

        if (synced === 0) {
            return 0;
        }

        this.pathFinder = new PathFinder(this.mapReader as any);
        if (this.currentRoom) {
            // currentRoom may point at an object we just replaced; re-resolve it
            // so later reads do not see a detached room.
            const refreshed = rooms[this.currentRoom.id];
            if (refreshed) {
                this.currentRoom = refreshed;
            }
            this.renderRoomById(this.currentRoom.id);
        }
        this.emitAreasChanged(syncedAreaIds);

        return synced;
    }

    /**
     * Drop a room from the live map.
     *
     * The reader keeps each room in two places that must stay in step: its
     * `rooms` lookup and the owning area's `rooms` array — the same object in
     * both, which is what the area's `createPlanes()` rebuilds from.
     */
    private removeRoomLive(
        rooms: Record<number, MapData.Room>,
        roomId: number,
        affectedAreas: Set<number>,
    ): boolean {
        const room = rooms[roomId];
        if (!room) {
            return false;
        }
        const area: any = (this.mapReader as any).areas?.[room.area];
        const areaRooms: MapData.Room[] | undefined = area?.area?.rooms;
        if (areaRooms) {
            const index = areaRooms.findIndex(candidate => candidate.id === roomId);
            if (index !== -1) {
                areaRooms.splice(index, 1);
            }
        }
        delete rooms[roomId];
        if (room.hash) {
            delete this.hashes[room.hash];
        }
        const internalId = room.userData?.internal_id;
        if (internalId) {
            delete this.internalIds[internalId];
        }
        affectedAreas.add(room.area);
        return true;
    }

    /**
     * Add a room to the live map, registering it in both places the reader
     * tracks rooms. Returns undefined when the target area is unknown, since a
     * room outside any area would never be drawn.
     */
    private createRoomLive(
        rooms: Record<number, MapData.Room>,
        change: RoomChange,
    ): MapData.Room | undefined {
        const areaId = change.area;
        if (areaId === undefined) {
            return undefined;
        }
        const area: any = (this.mapReader as any).areas?.[areaId];
        const areaRooms: MapData.Room[] | undefined = area?.area?.rooms;
        if (!areaRooms) {
            return undefined;
        }

        // Field values arrive via the normal patch pass below; this is only a
        // well-formed shell so the renderer never sees a half-built room.
        const room = {
            id: change.roomId,
            area: areaId,
            x: 0,
            y: 0,
            z: 0,
            weight: 1,
            roomChar: "",
            name: "",
            env: 0,
            hash: "",
            userData: {},
            customLines: {},
            stubs: [],
            exits: {},
            doors: {},
            specialExits: {},
        } as unknown as MapData.Room;

        rooms[change.roomId] = room;
        areaRooms.push(room);
        return room;
    }

    /**
     * Apply in-memory edits to the loaded map and refresh whatever they invalidate.
     *
     * Rooms handed out by the reader are live objects, so mutating a field is the
     * easy part; the work is that the renderer caches per-area geometry and the
     * pathfinder caches exits, so a bare mutation either does not show up or
     * leaves routing stale. This is the same sequence the labyrinth and tide
     * scripts perform by hand, exposed so callers outside this module (notably
     * plugins, via `api.map.applyChanges`) can do it correctly.
     *
     * Edits are memory-only and vanish when map data reloads.
     *
     * @returns how many rooms actually changed.
     */
    applyRoomChanges(changes: RoomChange[], options?: ApplyChangesOptions): number {
        if (!this.mapReader || changes.length === 0) {
            return 0;
        }
        const rooms: Record<number, MapData.Room> = (this.mapReader as any).rooms;
        const affectedAreas = new Set<number>();
        let changed = 0;

        for (const change of changes) {
            const op = change.op ?? "patch";

            if (op === "delete") {
                if (this.removeRoomLive(rooms, change.roomId, affectedAreas)) {
                    changed++;
                }
                continue;
            }

            let room = rooms[change.roomId];
            if (!room && op === "upsert") {
                room = this.createRoomLive(rooms, change) as MapData.Room;
                if (room) {
                    changed++;
                    affectedAreas.add(room.area);
                }
            }
            if (!room) {
                continue;
            }
            let touched = false;

            if (change.name !== undefined && change.name !== room.name) {
                room.name = change.name;
                touched = true;
            }
            if (change.roomChar !== undefined && change.roomChar !== room.roomChar) {
                room.roomChar = change.roomChar;
                touched = true;
            }
            if (change.env !== undefined && change.env !== room.env) {
                room.env = change.env;
                touched = true;
            }
            if (change.weight !== undefined && change.weight !== room.weight) {
                room.weight = change.weight;
                touched = true;
            }
            // Coordinates feed the per-area geometry, so a move needs the area
            // rebuild below to actually shift on screen.
            if (change.x !== undefined && change.x !== room.x) {
                room.x = change.x;
                touched = true;
            }
            if (change.y !== undefined && change.y !== room.y) {
                room.y = change.y;
                touched = true;
            }
            if (change.z !== undefined && change.z !== room.z) {
                room.z = change.z;
                touched = true;
            }
            if (change.exits) {
                room.exits = {...change.exits} as Record<MapData.direction, number>;
                touched = true;
            }
            if (change.specialExits) {
                room.specialExits = {...change.specialExits};
                touched = true;
            }
            if (change.customLines) {
                room.customLines = {...change.customLines};
                touched = true;
            }
            if (change.userData) {
                room.userData ||= {};
                for (const [key, value] of Object.entries(change.userData)) {
                    const previous = room.userData[key];
                    if (value === null) {
                        delete room.userData[key];
                    } else {
                        room.userData[key] = value;
                    }
                    // internal_id feeds a lookup index built at load time, so it
                    // has to be kept in step or getRoomIdByInternalId resolves an
                    // id the room no longer advertises. Retire the old entry
                    // before adding the new one, and read the previous value
                    // *before* the mutation above overwrites it.
                    if (key === "internal_id") {
                        if (previous && this.internalIds[previous] === change.roomId) {
                            delete this.internalIds[previous];
                        }
                        if (value !== null) {
                            this.internalIds[value] = change.roomId;
                        }
                    }
                }
                touched = true;
            }

            if (touched) {
                changed++;
                affectedAreas.add(room.area);
            }
        }

        if (changed === 0) {
            return 0;
        }

        if (options?.rebuildAreas !== false) {
            const areas: Record<number, any> = (this.mapReader as any).areas;
            for (const areaId of affectedAreas) {
                const area = areas[areaId];
                if (!area) {
                    continue;
                }
                area.planes = area.createPlanes();
                area.exits = new Map();
                area.createExits();
                area.markDirty();
            }
        }
        if (options?.rebuildPaths !== false) {
            this.pathFinder = new PathFinder(this.mapReader as any);
        }
        if (options?.rerender !== false && this.currentRoom) {
            this.renderRoomById(this.currentRoom.id);
        }
        this.emitAreasChanged([...affectedAreas]);

        return changed;
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

    /**
     * What the map believes actually leads `direction` from the current room, without moving.
     *
     * The literal exit wins when it exists. Otherwise a special exit whose target sits that way is
     * preferred, then any exit whose target sits that way — so "w" still works in a room whose
     * only westward exit is recorded as "nw" or as a special-exit command. Returns `direction`
     * unchanged when nothing better is known.
     *
     * Split out of move() so callers that must not advance the mapper (driving a carriage, where
     * the ride is asynchronous and GMCP is the authority) can still resolve the direction.
     */
    resolveDirection(direction: string): string {
        if (!this.mapReader || this.paused || !this.currentRoom) return direction;
        const potentialExit = getLongDir(direction);
        if (this.currentRoom.exits?.[potentialExit]) return direction;

        const leadsThatWay = ([, id]: [string, number]) =>
            this.findRoomByExit(this.currentRoom, this.mapReader.getRoom(id), potentialExit);

        const specialExitMatch = Object.entries(this.currentRoom.specialExits ?? {})
            .filter(leadsThatWay)
            .map(([exit]) => exit);
        if (specialExitMatch.length > 0) return getShortDir(specialExitMatch[0]);

        const allExits = Object.assign({}, this.currentRoom.exits ?? {}, this.currentRoom.specialExits ?? {});
        const exits = Object.entries(allExits).filter(leadsThatWay).map(([exit]) => exit);
        return exits.length > 0 ? getShortDir(exits[0]) : direction;
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
            actualDirection = this.resolveDirection(direction);

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
        // When the authoritative GMCP room.info for this step already advanced
        // us (it is parsed inline and applied before the buffered prose line that
        // triggers this follow reaches us), a relative follow-step would overshoot.
        // During "idz marszem" every step both updates the GMCP position and
        // prints "Ruszasz marszem na <dir>"; without this guard the two stack and
        // walk us one room too far. We key off whether GMCP actually moved us this
        // step rather than position equality, because across frames the prose can
        // arrive before its room.info, in which case the stale GMCP position would
        // also "match" the current room yet the relative move is still required.
        if (this.gmcpJustMoved) {
            this.gmcpJustMoved = false;
            return undefined;
        }

        // The follow token comes from game prose, so only attempt a bare
        // directional move when it is a full Polish direction word. Otherwise a
        // preposition like "w" (in "w lesna gestwine") would be resolved to the
        // short code for "west". Configured exits in specialExits /
        // team_follow_link below are still resolved normally.
        if (isPolishDirection(direction)) {
            const result = this.move(direction, true);
            if (result.moved) {
                return result.direction;
            }
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
                if (!search || !exit) continue;
                // Either the follow token itself or the wider follow text may carry the keyword.
                // fullFollow is optional — the carriage and boat triggers pass only a direction —
                // so it has to be probed defensively.
                if (direction.includes(search) || fullFollow?.includes(search)) {
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

    /**
     * Lead to a room, by whatever combination of walking, driving and riding gets there.
     *
     * The plain pathfinder handles the ordinary case on its own; the shared planner takes over as
     * soon as a wagon or a transport is in play, including when walking cannot get there at all
     * and a ship or a coach is the only answer.
     */
    leadTo(id: number, options: LeadOptions = {}) {
        const currentId = this.currentRoom?.id;
        if (currentId === id) {
            this.client.sendEvent("notify", { text: 'Jestes juz na miejscu' });
            return;
        }
        if (this.leadTarget !== id) this.announcedTransfer = null;
        this.leadTarget = id;
        this.leadOptions = options;

        const blocked = this.carriageBlocks?.() ?? null;
        if (!blocked && !options.transport) {
            const path = this.pathFinder?.findPath(currentId, id);
            if (path && path.length > 1) {
                this.clearCarriageRouteStep();
                this._destinations = [id];
                this._transportRoute = null;
                this.emitDrawData();
                return;
            }
        }

        if (typeof currentId !== 'number' || !this.mapReader) {
            this.client.sendEvent("notify", { text: 'Brak sciezki do lokacji' });
            return;
        }

        const defs = this.transportDefs?.() ?? [];
        const plan = (withTransport: boolean) => planRoute(this.mapReader, currentId, id, {
            defs: withTransport ? defs : undefined,
            carriageBlocked: blocked,
            // Aggressive routing all but ignores the cost of changing vehicles, keeping the
            // walking down at the price of more transfers.
            boardingPenalty: options.aggressive ? 10 : undefined,
            timeToHopRatio: options.aggressive ? 0.1 : undefined,
        });

        const wantsTransport = options.transport === true;
        // With neither a wagon nor a transport in play the plain pathfinder has already had its
        // say, and a walking-only plan would only repeat it.
        let segments = wantsTransport || blocked ? plan(wantsTransport) : null;
        // Nowhere to walk or drive is exactly when a boat or a coach is the answer, so try one
        // rather than making the user ask again with /prowadzt.
        const viaFallback = !wantsTransport && (!segments || segments.length === 0);
        if (viaFallback) segments = plan(true);

        if (!segments || segments.length === 0) {
            this.client.sendEvent("notify", { text: 'Brak sciezki do lokacji' });
            return;
        }
        this.drawRoute(segments, currentId, id, { ...options, viaFallback }, blocked);
    }

    /**
     * Put a planned route on the map, and say whatever needs saying about it: which way to drive,
     * where to leave the wagon, which ship to board.
     */
    private drawRoute(
        segments: RouteSegment[],
        fromId: number,
        toId: number,
        options: LeadOptions & { viaFallback?: boolean },
        blocked: ReadonlySet<number> | null,
    ) {
        const walkSegments: Array<{ path: number[]; color: string }> = [];
        const hops: Array<{ fromRoomId: number; toRoomId: number; transportName: string; label?: string; color: string }> = [];
        let colorIndex = 0;
        for (const segment of segments) {
            const color = SEGMENT_COLORS[colorIndex++ % SEGMENT_COLORS.length];
            if (segment.kind === 'transport') {
                hops.push({
                    fromRoomId: segment.fromRoomId,
                    toRoomId: segment.toRoomId,
                    transportName: segment.transportName,
                    label: segment.label,
                    color,
                });
            } else {
                walkSegments.push({ path: segment.rooms, color });
            }
        }

        // A route with no wagon in it must take down any step the last one was offering.
        if (blocked) this.carriageLead = true;
        else this.clearCarriageRouteStep();
        this.setTransportRoute({ walkSegments, hops, finalDestination: toId });

        if (blocked) this.announceCarriageLeg(segments, fromId, toId, blocked);
        // Riding somewhere is a set of instructions, not just a line on the map, so it has to be
        // spelled out - but only when it is news. A route is replanned on every step of the
        // journey, and repeating the whole itinerary each room would be noise.
        if (options.announce !== false && segments.some(segment => segment.kind === 'transport')) {
            this.client.sendEvent("routePlanned", {
                segments,
                viaFallback: options.viaFallback === true,
                aggressive: options.aggressive === true,
                driving: blocked !== null,
            });
        }
    }

    /** Offer the next step of the drive, and say where the wagon has to be left when it does. */
    private announceCarriageLeg(
        segments: RouteSegment[],
        fromId: number,
        toId: number,
        blocked: ReadonlySet<number>,
    ) {
        const route = describeCarriageRoute(segments, fromId, toId, blocked);
        this.client.sendEvent("carriageRouteStep", {
            nextCommand: route.drive.length > 1 ? this.exitCommandTo(route.drive[1]) : null,
            atTransfer: route.leftToTravel && route.transfer === fromId,
        });
        // Only worth saying when the wagon has to be left somewhere, and only when that somewhere
        // is news - the route is redrawn on every step, and repeating it each room would be noise.
        if (route.leftToTravel && route.transfer !== this.announcedTransfer) {
            this.announcedTransfer = route.transfer;
            this.client.sendEvent("carriageRoute", {
                transfer: route.transfer,
                driveRooms: route.driveRooms,
                walkRooms: route.walkRooms,
                destinationBlocked: route.destinationBlocked,
                boarding: route.boarding,
            });
        }
    }

    setMultiDestinations(ids: number[]) {
        this._destinations = ids;
        this._transportRoute = null;
        this.emitDrawData();
    }

    clearLeadTo() {
        this.leadTarget = null;
        this.leadOptions = {};
        this.clearCarriageRouteStep();
        this.announcedTransfer = null;
        this._destinations = [];
        this._transportRoute = null;
        this.emitDrawData();
    }

    /** Stop offering a step: leading has ended, or is no longer a carriage matter. */
    private clearCarriageRouteStep() {
        if (this.carriageLead) {
            this.client.sendEvent("carriageRouteStep", {nextCommand: null, atTransfer: false});
        }
        this.carriageLead = false;
    }

    /** The command that leaves the current room for `targetId`, or null when there is no such exit. */
    private exitCommandTo(targetId: number): string | null {
        const room = this.currentRoom;
        if (!room) return null;
        for (const [direction, id] of Object.entries(room.exits ?? {})) {
            if (id === targetId) return getShortDir(direction);
        }
        for (const [exit, id] of Object.entries(room.specialExits ?? {})) {
            if (id === targetId) return exit;
        }
        return null;
    }

    /**
     * Redraw the route we are leading along, because what counts as passable has changed.
     *
     * Getting on or off a carriage changes the rules mid-journey: a route worked out on foot may
     * run through rooms a wagon cannot enter, and one worked out for a wagon takes detours that are
     * pointless once you are walking.
     */
    private releadForChangedRules() {
        const target = this.leadTarget;
        if (target === null) return;
        if (target === this.currentRoom?.id) {
            // Arrived. An ordinary lead is taken down by removeReachedDestination, but a planned
            // route lives in the transport segments as well, so without this the finished route
            // would stay drawn.
            if (this.carriageLead || this._transportRoute) this.clearLeadTo();
            return;
        }
        this.leadTo(target, { ...this.leadOptions, announce: false });
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
        // Arriving ends the journey, so stop remembering where it was going. Otherwise the next
        // thing that redraws a route - mounting a carriage, marking a room barred - would lead us
        // back to a destination we have already stood in.
        if (roomId === this.leadTarget) this.leadTarget = null;
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
