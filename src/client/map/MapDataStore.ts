import {MapReader, PathFinder} from "mudlet-map-renderer";
import {roomDistances} from "./roomDistances";
import type {GmcpPosition, MapHelperClient} from "./types";

/**
 * The loaded map and everything derived from it: the reader, the pathfinder
 * built over it, and the lookups that turn a GMCP hash, an `internal_id` or an
 * area id into what the map knows by it.
 *
 * Knows nothing about where we stand; {@link PositionTracker} does that.
 */
export class MapDataStore {
    reader!: MapReader;
    pathFinder!: PathFinder;
    /** GMCP room hash (`x:y:z:name`) → room id. */
    hashes: Record<string, number> = {};
    /** `userData.internal_id` → room id. */
    internalIds: Record<string, number> = {};
    /** Area id → area name. */
    areas: Record<string, string> = {};
    ready = false;
    private mapData?: MapData.Map;
    colors?: any;
    private areaChangeListeners = new Set<(areaIds: number[]) => void>();
    private mapReadyCallbacks: ((mapData: MapData.Map, colors: any) => void)[] = [];

    constructor(private readonly client: Pick<MapHelperClient, "sendEvent">) {
    }

    /** Build the reader, pathfinder and room indexes from scratch. */
    load(mapData: MapData.Map, colors: any): void {
        this.mapData = mapData;
        this.colors = colors;
        this.reader = new MapReader(mapData, colors);
        this.pathFinder = new PathFinder(this.reader);
        this.hashes = {};
        this.internalIds = {};
        this.areas = {};
        this.reader.getRooms().forEach(room => {
            this.hashes[room.hash] = room.id;
            const internalId = room.userData?.internal_id;
            if (internalId) {
                this.internalIds[internalId] = room.id;
            }
        });
    }

    /** Fill the area-name lookup from the reader. */
    indexAreaNames(): void {
        this.reader.getAreas().forEach(area => {
            this.areas[area.getAreaId()] = area.getAreaName();
        });
    }

    /** The map is up: run the waiting callbacks and announce every area. */
    markReady(mapData: MapData.Map, colors: any): void {
        this.ready = true;
        this.mapReadyCallbacks.forEach(cb => cb(mapData, colors));
        this.mapReadyCallbacks = [];
        this.client.sendEvent("mapReady");
        // Announce through the same channel as every later change, so consumers
        // have a single code path — and so a rebuilt map tells views holding
        // their own reader reference that theirs is now stale.
        this.emitAreasChanged(this.getAreaIds());
    }

    /** Every area id currently loaded. */
    getAreaIds(): number[] {
        if (!this.reader) {
            return [];
        }
        return this.reader.getAreas().map(area => area.getAreaId());
    }

    /** See {@link MapHelper.onAreasChanged}. */
    onAreasChanged(callback: (areaIds: number[]) => void): () => void {
        this.areaChangeListeners.add(callback);
        if (this.ready) {
            callback(this.getAreaIds());
        }
        return () => {
            this.areaChangeListeners.delete(callback);
        };
    }

    /** Tell area-scoped consumers which areas they need to rebuild. */
    emitAreasChanged(areaIds: number[]) {
        if (areaIds.length === 0) {
            return;
        }
        this.areaChangeListeners.forEach(listener => listener(areaIds));
        this.client.sendEvent("mapDataChanged");
    }

    onMapReady(callback: (mapData: MapData.Map, colors: any) => void) {
        if (this.ready && this.mapData && this.colors) {
            callback(this.mapData, this.colors);
            return;
        }
        this.mapReadyCallbacks.push(callback);
    }

    getMapReader(): MapReader {
        if (!this.reader) {
            throw new Error("Map reader not initialized");
        }
        return this.reader;
    }

    tryGetMapReader(): MapReader | null {
        return this.reader ?? null;
    }

    /** Rebuild the pathfinder after exits or weights changed. */
    rebuildPathFinder(): void {
        this.pathFinder = new PathFinder(this.reader as any);
    }

    getRoomIdByInternalId(internalId: string): number | null {
        return this.internalIds[internalId] ?? null;
    }

    /** The room id GMCP is pointing at, or undefined when the map has no such room. */
    resolveGmcpRoom(data?: Partial<Pick<GmcpPosition, 'x' | 'y' | 'name'>>): number | undefined {
        if (!data || data.x === undefined || data.y === undefined || !data.name) {
            return undefined;
        }
        return this.hashes[`${data.x}:${data.y}:0:${data.name}`];
    }

    getRoomById(id: number): MapData.Room | null {
        if (!this.reader) {
            return null;
        }
        const reader: any = this.reader as any;
        if (typeof reader.getRoomById === "function") {
            return reader.getRoomById(id) ?? null;
        }
        const room = this.reader.getRoom(id);
        return room ?? null;
    }

    getAreaName(id: string) {
        return this.areas[id];
    }

    findPath(fromId: number, targetId: number) {
        return this.pathFinder.findPath(fromId, targetId);
    }

    /** Steps from `fromId` to each of `targetIds`, in one search (see roomDistances). */
    getRoomDistances(fromId: number, targetIds: Iterable<number>): Map<number, number | null> {
        // The pathfinder's own graph, so the weights (locks, exit weights) match findPath.
        return roomDistances(this.pathFinder["mapGraph"].getAdj(), fromId, targetIds);
    }
}
