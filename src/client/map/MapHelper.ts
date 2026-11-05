import type {MapReader, PathFinder} from "mudlet-map-renderer";
import {characterStorage} from "@modules/core/storage";
import {findRoomByExit} from "./exitResolution";
import {LeadPlanner} from "./LeadPlanner";
import {applyRoomChanges, syncAreas} from "./liveEdits";
import {MapDataStore} from "./MapDataStore";
import {type MapHighlighter, MapDrawData} from "./MapDrawData";
import {bindMapEvents} from "./mapEvents";
import {PositionTracker} from "./PositionTracker";
import {getBindPrintable, parseBind, RoomBinds} from "./RoomBinds";
import type {
    ApplyChangesOptions,
    GmcpPosition,
    LeadOptions,
    MapAreaData,
    MapHelperClient,
    MapHelperOptions,
    MapStorage,
    RoomChange,
    TransportRoute,
} from "./types";

const defaultStorage: MapStorage = {
    getItem: () => characterStorage.get('mapperRoomId'),
    setItem: (_key: string, value: any) => characterStorage.set('mapperRoomId', value),
};

/**
 * The mapper, as the rest of the client sees it: one object over the parts that
 * do the work, which it builds and wires together.
 *
 * - {@link MapDataStore} - the loaded map, its pathfinder and lookups; {@link syncAreas} /
 *   {@link applyRoomChanges} in `liveEdits` edit it in place
 * - {@link PositionTracker} - where we stand, with its {@link PositionLoss} and {@link MoveJournal}
 * - {@link LeadPlanner} - /prowadz, /prowadzt and the trip planner's route
 * - {@link MapDrawData} - the route, highlights and label published for a map view
 * - {@link RoomBinds} - what a room's `userData` binds on entry
 * - `mapEvents` - the client events that drive all of the above
 */
export default class MapHelper {
    /** @internal */
    readonly data: MapDataStore;
    /** @internal */
    readonly position: PositionTracker;
    /** @internal */
    readonly binds: RoomBinds;
    /** @internal */
    readonly lead: LeadPlanner;
    /** @internal */
    readonly drawData: MapDrawData;

    constructor(client: MapHelperClient, options: MapHelperOptions = {}) {
        this.data = new MapDataStore(client);
        this.position = new PositionTracker(client, this.data, options.storage ?? defaultStorage, id => {
            this.lead.removeReachedDestination(id);
            this.drawData.emitDrawData();
        });
        this.binds = new RoomBinds(client, this.position);
        this.lead = new LeadPlanner(
            client,
            this.data,
            this.position,
            options.carriageBlocks,
            options.transportDefs,
            () => this.drawData.emitDrawData(),
        );
        this.drawData = new MapDrawData(client, this.data, this.position, this.lead);
        bindMapEvents(client, {position: this.position, binds: this.binds, lead: this.lead, drawData: this.drawData});
    }

    // --- Position ---------------------------------------------------------

    get currentRoom(): MapData.Room {
        return this.position.currentRoom;
    }

    set currentRoom(room: MapData.Room) {
        this.position.currentRoom = room;
    }

    get locationHistory(): number[] {
        return this.position.locationHistory;
    }

    get refreshPosition(): boolean {
        return this.position.refreshPosition;
    }

    set refreshPosition(value: boolean) {
        this.position.refreshPosition = value;
    }

    get paused(): boolean {
        return this.position.paused;
    }

    set paused(value: boolean) {
        this.position.paused = value;
    }

    get isBlockable(): boolean {
        return this.position.isBlockable;
    }

    set isBlockable(value: boolean) {
        this.position.isBlockable = value;
    }

    setBlockable(isBlockable: boolean) {
        this.position.setBlockable(isBlockable);
    }

    setPaused(paused: boolean) {
        this.position.paused = paused;
    }

    /** True when the mapper knows the room it draws is not the room we are in. */
    get isLost(): boolean {
        return this.position.loss.isLost;
    }

    emitPositionLost() {
        this.position.loss.emit();
    }

    /** The room id GMCP is pointing at, or undefined when the map has no such room. */
    resolveGmcpRoom(data?: Partial<Pick<GmcpPosition, 'x' | 'y' | 'name'>>): number | undefined {
        return this.data.resolveGmcpRoom(data);
    }

    parseCommand(command: string): string | null {
        return this.position.parseCommand(command);
    }

    /** See {@link PositionTracker.resolveDirection}. */
    resolveDirection(direction: string, room?: MapData.Room): string {
        return this.position.resolveDirection(direction, room);
    }

    /** Start writing down every step the mapper takes - see {@link replayJournal}. */
    startJournal(): void {
        this.position.journal.start();
    }

    stopJournal(): void {
        this.position.journal.stop();
    }

    /** Whether the map has been placed - not stepped - since the journal started. */
    get placedSinceJournal(): boolean {
        return this.position.journal.placed;
    }

    /** See {@link PositionTracker.replayJournal}. */
    replayJournal(roomId: number, uncertain: boolean): boolean {
        return this.position.replayJournal(roomId, uncertain);
    }

    /** @param record - false for followMove's own step, which it journals as a follow. */
    move(direction: string, isTeamFollow: boolean = false, record = true): { direction: string; moved: boolean; suppress?: boolean } {
        return this.position.move(direction, isTeamFollow, record);
    }

    followMove(direction: string, fullFollow?: string) {
        return this.position.followMove(direction, fullFollow);
    }

    refresh() {
        return this.position.refresh();
    }

    setMapPosition(data: GmcpPosition) {
        return this.position.setMapPosition(data);
    }

    setMapRoomById(id: number, options?: { silent?: boolean; direction?: string | null }) {
        this.position.setMapRoomById(id, options);
    }

    setMapRoom(room: number, direction?: string | null) {
        this.position.setMapRoom(room, direction);
    }

    moveBack() {
        this.position.moveBack();
    }

    renderRoomByIdSilently(id: number) {
        this.position.renderRoomByIdSilently(id);
    }

    /** See {@link PositionTracker.renderRoomById}. */
    renderRoomById(id: number, sendEvent = true, options?: { relative?: boolean }) {
        this.position.renderRoomById(id, sendEvent, options);
    }

    findRoomByExit(room: MapData.Room, targetRoom: MapData.Room, targetDir: string) {
        return findRoomByExit(room, targetRoom, targetDir);
    }

    // --- Map data ---------------------------------------------------------

    initialize(mapData: MapData.Map, colors: any): { startId: number; reader: MapReader; pathFinder: PathFinder } {
        this.data.load(mapData, colors);
        const startId = this.position.savedRoomId ?? 1;
        this.position.renderRoomById(startId);
        this.data.indexAreaNames();
        this.data.markReady(mapData, colors);
        return {startId, reader: this.data.reader, pathFinder: this.data.pathFinder};
    }

    /** Every area id currently loaded. */
    getAreaIds(): number[] {
        return this.data.getAreaIds();
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
        return this.data.onAreasChanged(callback);
    }

    onMapReady(callback: (mapData: MapData.Map, colors: any) => void) {
        this.data.onMapReady(callback);
    }

    getMapReader(): MapReader {
        return this.data.getMapReader();
    }

    /**
     * The pathfinder built alongside the current reader. Replaced whenever the
     * map is rebuilt, so views holding their own reference must re-read it.
     */
    getPathFinder(): PathFinder {
        return this.data.pathFinder;
    }

    tryGetMapReader(): MapReader | null {
        return this.data.tryGetMapReader();
    }

    getRoomIdByInternalId(internalId: string): number | null {
        return this.data.getRoomIdByInternalId(internalId);
    }

    getRoomById(id: number): MapData.Room | null {
        return this.data.getRoomById(id);
    }

    getAreaName(id: string) {
        return this.data.getAreaName(id);
    }

    findPath(fromId: number, targetId: number) {
        return this.data.findPath(fromId, targetId);
    }

    /** Steps from `fromId` to each of `targetIds`, in one search (see roomDistances). */
    getRoomDistances(fromId: number, targetIds: Iterable<number>): Map<number, number | null> {
        return this.data.getRoomDistances(fromId, targetIds);
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
        this.position.savedRoomId = this.position.currentRoom?.id ?? this.position.savedRoomId;
        // initialize() announces every area, so no separate notification here.
        this.initialize(mapData, colors ?? this.data.colors);
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
        const syncedAreaIds = syncAreas(this.data, areas);
        if (syncedAreaIds.length === 0) {
            return 0;
        }
        const current = this.position.currentRoom;
        if (current) {
            // currentRoom may point at an object we just replaced; re-resolve it
            // so later reads do not see a detached room.
            const refreshed = (this.data.reader as any).rooms[current.id];
            if (refreshed) {
                this.position.currentRoom = refreshed;
            }
            this.position.renderRoomById(this.position.currentRoom.id);
        }
        this.data.emitAreasChanged(syncedAreaIds);
        return syncedAreaIds.length;
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
        const {changed, affectedAreas} = applyRoomChanges(this.data, changes, options);
        if (changed === 0) {
            return 0;
        }
        if (options?.rerender !== false && this.position.currentRoom) {
            this.position.renderRoomById(this.position.currentRoom.id);
        }
        this.data.emitAreasChanged(affectedAreas);
        return changed;
    }

    // --- Room binds -------------------------------------------------------

    static parseBind(bindStr: string): { command: string; delay: number | null }[] {
        return parseBind(bindStr);
    }

    static getBindPrintable(bindStr: string): string {
        return getBindPrintable(bindStr);
    }

    executeBind(bindStr: string) {
        this.binds.executeBind(bindStr);
    }

    handleNewLocation(detail: { room: MapData.Room }) {
        this.binds.handleNewLocation(detail);
    }

    // --- Leading ----------------------------------------------------------

    get destinations(): number[] {
        return this.lead.destinations;
    }

    /** See {@link LeadPlanner.leadTo}. */
    leadTo(id: number, options: LeadOptions = {}) {
        this.lead.leadTo(id, options);
    }

    switchLeadMode(transport: boolean, aggressive = false) {
        this.lead.switchLeadMode(transport, aggressive);
    }

    setMultiDestinations(ids: number[]) {
        this.lead.setMultiDestinations(ids);
    }

    clearLeadTo() {
        this.lead.clearLeadTo();
    }

    /** See {@link LeadPlanner.nextLeadCommand}. */
    nextLeadCommand(): string | null {
        return this.lead.nextLeadCommand();
    }

    setTransportRoute(route: TransportRoute & { finalDestination?: number }) {
        this.lead.setTransportRoute(route);
    }

    clearTransportRoute() {
        this.lead.clearTransportRoute();
    }

    removeReachedDestination(roomId: number) {
        this.lead.removeReachedDestination(roomId);
    }

    // --- Draw data --------------------------------------------------------

    setHighlights(highlights: number[]) {
        this.drawData.setHighlights(highlights);
    }

    createHighlighter(options?: { color?: string; enabled?: boolean }): MapHighlighter {
        return this.drawData.createHighlighter(options);
    }

    removeHighlighter(id: string) {
        this.drawData.removeHighlighter(id);
    }

    emitDrawData() {
        this.drawData.emitDrawData();
    }

    emitPath() {
        this.drawData.emitPath();
    }

    emitHighlights() {
        this.drawData.emitHighlights();
    }

    emitLocationLabel() {
        this.drawData.emitLocationLabel();
    }
}
