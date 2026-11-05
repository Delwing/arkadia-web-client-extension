import type {TransportDef} from "@client/scripts/transports/definitions";

/** Where GMCP says we stand: `gmcp.room.info`'s `map` block. */
export type GmcpPosition = {
    x: number;
    y: number;
    z: number;
    id: string;
    name: string;
};

export interface MapFunctionalBind {
    set(key: string, fn: () => void): void;
}

/**
 * A single room's worth of live map edits, as accepted by `api.map.applyChanges`.
 * Only the fields present are touched; everything else on the room is left alone.
 */
export interface RoomChange {
    /** Room to patch. Ignored if the map has no such room. */
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
    /** Room name. */
    name?: string;
    /** Symbol drawn in the room square (Mudlet's roomChar). */
    roomChar?: string;
    /** Environment/colour id. */
    env?: number;
    /** Pathfinding weight. */
    weight?: number;
    /** Map coordinates. Moving a room needs the area geometry rebuild. */
    x?: number;
    y?: number;
    z?: number;
    /** Replaces the room's exits wholesale. */
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
 * as Mudlet stores them); `api.map.syncAreas` flips y on the way in, exactly
 * as `MapReader` does when it first builds the map.
 */
export interface MapAreaData {
    areaId: string | number;
    areaName?: string;
    rooms: MapData.Room[];
    labels?: unknown[];
}

/**
 * Tuning for `api.map.applyChanges`. Every rebuild defaults to `true`, which
 * is always correct but heavier than a cosmetic edit needs.
 */
export interface ApplyChangesOptions {
    /**
     * Rebuild renderer geometry for affected areas. Required for anything that
     * changes what is drawn (symbols, colours, exits). Default `true`.
     */
    rebuildAreas?: boolean;
    /**
     * Rebuild the pathfinder. Only exits and weights affect routing, so a pure
     * name/symbol change can skip it. Default `true`.
     */
    rebuildPaths?: boolean;
    /** Redraw the current view when done. Default `true`. */
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

/**
 * Why the mapper believes its position is wrong. A closed set, so a UI can word
 * the warning without re-deriving anything.
 */
export type MapLostReason = 'follow' | 'gmcp' | 'handoff';

/** A route planned through transports or around a wagon's barred rooms, as drawn on the map. */
export interface TransportRoute {
    walkSegments: Array<{ path: number[]; color: string }>;
    hops: Array<{ fromRoomId: number; toRoomId: number; transportName: string; label?: string; color: string }>;
}
