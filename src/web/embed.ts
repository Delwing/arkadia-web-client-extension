import {
    MapReader,
    createSettings,
    type Settings,
    RoomContextMenuEventDetail,
    type RoomClickEventDetail,
    type AreaExitClickEventDetail,
    type PanEventDetail,
    LabelRenderMode, MapRenderer,
    ExplorationLens,
    ALL_VISIBLE,
    WaypointOverlay,
    type PathFinder
} from "mudlet-map-renderer";
import {characterStorage, globalStorage} from "@modules/core/storage";
import {getMapSettings, getDeviceViewSettings, setDeviceViewSettings, getBehaviorSettings} from "@modules/core/settings";
import eventBus from "@modules/core/eventBus";
import {getBuiltInPanelSetting, loadLayoutState} from "./layout/utils/layoutStorage";
import { showMapNoteTooltipForRoom, hideMapNoteTooltip } from "./mapNoteTooltip";
import { openMapContextMenu } from "@modules/core/contextMenus";
import { PulseOverlay } from "./pulseOverlay";
import { TransportHopsOverlay, type TransportHopMarker } from "./transportHopsOverlay";
import { ParkedCarriagesOverlay, type ParkedCarriageMarker } from "./parkedCarriagesOverlay";
import { buildTransportWaypoints } from "./transportWaypoints";

const LOST_ROOMS_OVERLAY_ID = "lost-rooms";
const TRANSPORT_HOPS_OVERLAY_ID = "transport-hops";
const PARKED_CARRIAGES_OVERLAY_ID = "parked-carriages";
const TRANSPORT_STOPS_OVERLAY_ID = "transport-stops";

const MIN_ZOOM = 0.01;

const VISITED_DB_NAME = 'ArkadiaVisitedRoomsDB';
const VISITED_STORE_NAME = 'visitedRooms';

function getVisitedKey() {
    const char = characterStorage.getCharacter();
    return char ? `${char}:${VISITED_STORE_NAME}` : VISITED_STORE_NAME;
}

let visitedDbPromise: Promise<IDBDatabase> | null = null;

function openVisitedDB(): Promise<IDBDatabase> {
    if (!visitedDbPromise) {
        visitedDbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(VISITED_DB_NAME, 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(VISITED_STORE_NAME)) {
                    db.createObjectStore(VISITED_STORE_NAME, {keyPath: 'id'});
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => {
                visitedDbPromise = null;
                reject(new Error('Failed to open IndexedDB'));
            };
        });
    }
    return visitedDbPromise;
}

async function loadVisitedRooms(): Promise<number[]> {
    try {
        const db = await openVisitedDB();
        return await new Promise<number[]>((resolve) => {
            const tx = db.transaction([VISITED_STORE_NAME], 'readonly');
            const store = tx.objectStore(VISITED_STORE_NAME);
            const req = store.get(getVisitedKey());
            req.onsuccess = () => {
                const rooms = req.result?.rooms;
                resolve(Array.isArray(rooms) ? rooms : []);
            };
            req.onerror = () => resolve([]);
        });
    } catch {
        return [];
    }
}

async function saveVisitedRooms(rooms: number[]): Promise<void> {
    try {
        const db = await openVisitedDB();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction([VISITED_STORE_NAME], 'readwrite');
            const store = tx.objectStore(VISITED_STORE_NAME);
            const req = store.put({id: getVisitedKey(), rooms});
            req.onsuccess = () => resolve();
            req.onerror = () => reject(new Error('Failed to store visited rooms'));
        });
    } catch {
    }
}

export class EmbeddedMap {
    private readonly map: HTMLDivElement;
    public reader: MapReader;
    public renderer: MapRenderer;
    public readonly settings: Settings;
    /**
     * Path finder for the currently loaded map. Produced alongside the reader by
     * `client.Map.initialize()` and assigned by whoever constructs the map (each
     * UI). Kept as a first-class field so consumers read `embedded.pathFinder`
     * directly instead of casting a bag-of-any onto the instance. Null until the
     * owner assigns it and re-assigned on every map-data reload.
     */
    public pathFinder: PathFinder | null = null;
    public currentRoom: any;
    private zoom: number;
    private explorationMode = false;
    private visited = new Set<number>();
    public explorationLens = new ExplorationLens();
    private totalRooms: number;
    private currentPath: { segments: Array<{ path: number[]; color: string }> } | null = null;
    private currentHighlights: { roomId: number; color: string }[] = [];
    private lostRoomsOverlay: PulseOverlay | null = null;
    private transportHopsOverlay: TransportHopsOverlay | null = null;
    private parkedCarriagesOverlay: ParkedCarriagesOverlay | null = null;
    private transportStopsOverlay: WaypointOverlay | null = null;
    private waypointHover = false;
    private pointerDownPos: { x: number; y: number } | null = null;
    private _isViewingPlayerPosition = true;
    private _viewedAreaId: number | null = null;
    private _viewedZ: number | null = null;
    private _saveVisitedTimer: ReturnType<typeof setTimeout> | undefined;
    private viewChangeListeners: Set<(isViewing: boolean, areaName?: string) => void> = new Set();

    constructor(reader: MapReader, startId?: number) {
        this.map = document.querySelector<HTMLDivElement>("#map")!;
        this.map.style.touchAction = 'none';
        this.map.addEventListener('zoom', () => this.onZoom());
        this.map.addEventListener('roomcontextmenu', (ev: CustomEvent<RoomContextMenuEventDetail>) => this.onContextMenu(ev));
        this.map.addEventListener('roomclick', (ev: CustomEvent<RoomClickEventDetail>) => this.onRoomClick(ev));
        this.map.addEventListener('areaexitclick', (ev: CustomEvent<AreaExitClickEventDetail>) => this.onAreaExitClick(ev));
        this.map.addEventListener('pan', (ev: CustomEvent<PanEventDetail>) => this.onPan(ev));
        this.map.addEventListener('pointerdown', (ev: PointerEvent) => { this.pointerDownPos = { x: ev.clientX, y: ev.clientY }; });
        this.map.addEventListener('click', (ev: MouseEvent) => this.onWaypointClick(ev));
        this.map.addEventListener('pointermove', (ev: PointerEvent) => this.onWaypointHover(ev));
        this.reader = reader;
        this.totalRooms = this.reader.getRooms().length;

        let zoom = 0.30;
        let explorationMode = false;
        let instantMove = true;
        let highlightCurrentRoom = true;
        let labelRenderMode: LabelRenderMode = 'data';
        let transparentLabels = true;
        let initialRoom = startId ?? 1;
        let mapPosition = 'top-overlay';
        try {
            const mapS = getMapSettings();
            const behaviorS = getBehaviorSettings();
            const mapScale = getDeviceViewSettings().mapScale;
            if (typeof mapScale === 'number' && mapScale > 0) {
                zoom = mapScale;
            }
            explorationMode = behaviorS.explorationMode;
            instantMove = behaviorS.instantMove;
            highlightCurrentRoom = mapS.highlightCurrentRoom;
            labelRenderMode = mapS.labelRenderMode;
            transparentLabels = mapS.transparentLabels;
            // mapPosition is stock chrome and stays in the uiSettings blob.
            const chrome = globalStorage.get('uiSettings') as any;
            if (chrome && typeof chrome.mapPosition === 'string') {
                mapPosition = chrome.mapPosition;
            }
        } catch {
            // ignore malformed data
        }
        try {
            const savedId = characterStorage.get('mapperRoomId');
            if (savedId !== undefined && !isNaN(Number(savedId))) {
                initialRoom = Number(savedId);
            }
        } catch {
        }
        this.zoom = this.clampZoom(zoom);
        if (transparentLabels) {
            labelRenderMode = 'data';
        }
        const settings = createSettings();
        settings.transparentLabels = transparentLabels;
        settings.labelRenderMode = labelRenderMode;
        settings.playerMarker.dash = [0.05, 0.05]
        settings.gridColor = 'rgba(255, 255, 255, 0.1)';
        settings.gridEnabled = getBuiltInPanelSetting('map', 'showGrid', false);
        settings.areaExitLabels = getBuiltInPanelSetting('map', 'showAreaExitLabels', true);
        settings.areaName = false
        const isLayoutManagerEnabled = loadLayoutState().enabled;
        if (mapPosition.includes('overlay') && !isLayoutManagerEnabled) {
            settings.backgroundColor = 'transparent';
        } else {
            try {
                const mapS = getMapSettings();
                if (typeof mapS.mapBackgroundColor === 'string') {
                    settings.backgroundColor = mapS.mapBackgroundColor;
                }
            } catch {
                // ignore
            }
        }

        // Initialize map rendering settings from storage
        try {
            const parsed = getMapSettings() as any;
            if (parsed) {
                if (typeof parsed.mapRoomSize === 'number' && parsed.mapRoomSize > 0) {
                    settings.roomSize = parsed.mapRoomSize;
                }
                if (typeof parsed.mapLineWidth === 'number' && parsed.mapLineWidth > 0) {
                    settings.lineWidth = parsed.mapLineWidth;
                }
                if (typeof parsed.mapPlayerMarkerStrokeColor === 'string') {
                    settings.playerMarker.strokeColor = parsed.mapPlayerMarkerStrokeColor;
                }
                if (typeof parsed.mapPlayerMarkerStrokeAlpha === 'number') {
                    settings.playerMarker.strokeAlpha = parsed.mapPlayerMarkerStrokeAlpha;
                }
                if (typeof parsed.mapPlayerMarkerFillColor === 'string') {
                    settings.playerMarker.fillColor = parsed.mapPlayerMarkerFillColor;
                }
                if (typeof parsed.mapPlayerMarkerFillAlpha === 'number') {
                    settings.playerMarker.fillAlpha = parsed.mapPlayerMarkerFillAlpha;
                }
                if (typeof parsed.mapPlayerMarkerStrokeWidth === 'number') {
                    settings.playerMarker.strokeWidth = parsed.mapPlayerMarkerStrokeWidth;
                }
                if (typeof parsed.mapPlayerMarkerSizeFactor === 'number') {
                    settings.playerMarker.sizeFactor = parsed.mapPlayerMarkerSizeFactor;
                }
                if (typeof parsed.mapPlayerMarkerDashEnabled === 'boolean') {
                    settings.playerMarker.dashEnabled = parsed.mapPlayerMarkerDashEnabled;
                }
                if (parsed.mapRoomShape === 'rectangle' || parsed.mapRoomShape === 'circle' || parsed.mapRoomShape === 'roundedRectangle') {
                    settings.roomShape = parsed.mapRoomShape;
                }
                if (typeof parsed.mapLineColor === 'string') {
                    settings.lineColor = parsed.mapLineColor;
                }
            }
        } catch {
            // ignore malformed data
        }

        this.settings = settings;
        this.renderer = new MapRenderer(this.reader, settings, this.map);
        this.setExplorationMode(explorationMode);
        this.setInstantMove(instantMove);
        this.setHighlightCurrentRoom(highlightCurrentRoom);

        eventBus.on('enterLocation', async (ev) => {
            const id = ev.id;
            this.visited.add(id);
            const added = this.explorationLens.addVisited(id);
            characterStorage.set('mapperRoomId', id);
            this.scheduleSaveVisitedRooms();
            this.renderRoomById(id);
            if (added && this.explorationMode) {
                this.renderer.refresh();
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.flushVisitedRooms();
            }
        });

        eventBus.on('mapPath', (data: { segments: Array<{ path: number[]; color: string }> } | null) => {
            this.currentPath = data;
            this.schedulePathHighlightRender();
        });

        eventBus.on('mapHighlights', (data: { roomId: number; color: string }[]) => {
            this.currentHighlights = data;
            this.schedulePathHighlightRender();
        });

        eventBus.on('mapLostRooms', (roomIds: number[]) => {
            this.updateLostRoomsOverlay(roomIds);
        });

        eventBus.on('mapParkedCarriages', (markers: ParkedCarriageMarker[]) => {
            this.updateParkedCarriagesOverlay(markers ?? []);
        });

        eventBus.on('mapTransportHops', (hops: TransportHopMarker[] | null) => {
            this.updateTransportHopsOverlay(hops ?? []);
        });

        eventBus.on('mapShowTransportStops', (show: boolean) => {
            this.setTransportStopsVisible(show);
        });
        // Apply the persisted setting on load (the menu also emits on mount).
        if (getBuiltInPanelSetting('map', 'showTransportStops', false)) {
            this.setTransportStopsVisible(true);
        }

        // Request current highlights and path in case they were created before map loaded
        eventBus.emit('requestMapHighlights');
        eventBus.emit('requestMapLostRooms');
        eventBus.emit('requestMapParkedCarriages');
        eventBus.emit('requestMapPath');

        eventBus.on('map.centerOn', (data: { roomId: number }) => {
            const targetRoom = this.reader.getRoom(data.roomId);
            const playerRoom = this.reader.getRoom(this.currentRoom);

            if (targetRoom && playerRoom) {
                const isPlayerArea = targetRoom.area === playerRoom.area && targetRoom.z === playerRoom.z;
                if (isPlayerArea) {
                    this.setViewingPlayerPosition(true);
                } else {
                    this.setViewingPlayerPosition(false, targetRoom.area, targetRoom.z);
                }
            }
            this.renderer.centerOn(data.roomId);
            this.updatePlayerMarker();
        });

        eventBus.on('mapShowGrid', (value: boolean) => {
            this.settings.gridEnabled = value;
            this.refreshRender();
        });

        eventBus.on('mapShowAreaExitLabels', (value: boolean) => {
            this.settings.areaExitLabels = value;
            this.refreshRender();
        });

        this.initVisitedRooms(initialRoom);
    }

    private async initVisitedRooms(initialRoom: number) {
        const visited = await loadVisitedRooms();
        visited.forEach(id => this.visited.add(id));
        this.explorationLens.addVisitedAll(visited);
        this.renderRoomById(initialRoom);
        if (this.explorationMode) {
            this.renderer.refresh();
        }
    }

    private saveZoom() {
        try {
            setDeviceViewSettings({ mapScale: this.zoom });
        } catch {
        }
    }

    private onZoom() {
        const rendererZoom = this.renderer.getZoom();
        const clampedZoom = this.clampZoom(rendererZoom);
        const shouldSave = clampedZoom !== this.zoom;
        if (rendererZoom !== clampedZoom) {
            this.renderer.setZoom(clampedZoom);
        }
        this.zoom = clampedZoom;
        if (shouldSave) {
            this.saveZoom();
        }
    }

    private onPan(ev: CustomEvent<PanEventDetail>) {
        if (!this._isViewingPlayerPosition) return;

        const room = this.reader.getRoom(this.currentRoom);
        if (!room) return;

        const bounds = ev.detail;
        const isVisible = room.x >= bounds.minX && room.x <= bounds.maxX
            && room.y >= bounds.minY && room.y <= bounds.maxY;

        if (!isVisible) {
            // Panning within the player's own area — leave area/z unset so the
            // map panel title keeps showing the current location label instead
            // of switching to "(AreaName)".
            this.setViewingPlayerPosition(false);
        }
    }

    private onContextMenu(ev: CustomEvent<RoomContextMenuEventDetail>) {
        ev.preventDefault();

        const room = ev.detail.roomId
        if (room) {
            // Transform canvas-relative coordinates to viewport coordinates
            const mapRect = this.map.getBoundingClientRect();
            const viewportX = ev.detail.position.x + mapRect.left;
            const viewportY = ev.detail.position.y + mapRect.top;
            openMapContextMenu(room, viewportX, viewportY);
        }
    }

    private onRoomClick(ev: CustomEvent<RoomClickEventDetail>) {
        const roomId = ev.detail.roomId;
        if (!roomId) {
            hideMapNoteTooltip();
            return;
        }
        const mapRect = this.map.getBoundingClientRect();
        const viewportX = ev.detail.position.x + mapRect.left;
        const viewportY = ev.detail.position.y + mapRect.top;
        const mapNote = this.reader.getRoom(roomId)?.userData?.note;
        showMapNoteTooltipForRoom(roomId, viewportX, viewportY, mapNote);
    }

    private onAreaExitClick(ev: CustomEvent<AreaExitClickEventDetail>) {
        const targetRoomId = ev.detail.targetRoomId;
        if (typeof targetRoomId !== 'number') return;
        eventBus.emit('map.centerOn', { roomId: targetRoomId });
    }

    private scheduleSaveVisitedRooms() {
        clearTimeout(this._saveVisitedTimer);
        this._saveVisitedTimer = setTimeout(() => {
            saveVisitedRooms(Array.from(this.visited));
        }, 10_000);
    }

    private flushVisitedRooms() {
        clearTimeout(this._saveVisitedTimer);
        saveVisitedRooms(Array.from(this.visited));
    }

    renderRoomById(id: number) {
        this.renderRoom(id);
        if (!this._isViewingPlayerPosition) {
            this.setViewingPlayerPosition(true);
        }
    }

    renderRoom(roomId: number) {
        // Assign first so pan events emitted synchronously by the renderer below
        // see the new room when checking visibility in onPan.
        this.currentRoom = roomId;
        this.renderer.setPosition(roomId)
        this.renderer.updatePositionMarker(roomId);
        // zoomToCenter (not setZoom) keeps the just-centered room at the visual
        // centre when the zoom changes — otherwise position is left at the old
        // zoom's pixel coords and the room slides off-screen, causing the
        // subsequent pan event to report the room as out of bounds.
        this.renderer.zoomToCenter(this.zoom);

        this.schedulePathHighlightRender();
    }

    private _pathHighlightRenderPending = false;

    private schedulePathHighlightRender() {
        if (this._pathHighlightRenderPending) return;
        this._pathHighlightRenderPending = true;
        queueMicrotask(() => {
            this._pathHighlightRenderPending = false;
            this.renderCurrentPathAndHighlights();
        });
    }

    private renderCurrentPathAndHighlights() {
        this.renderer.clearPaths()
        if (this.currentPath) {
            for (const segment of this.currentPath.segments) {
                this.renderer.renderPath(segment.path, segment.color);
            }
        }

        this.renderer.clearHighlights()
        this.currentHighlights.forEach(({roomId: highlightId, color}) => {
            this.renderer.renderHighlight(highlightId, color);
        });
    }

    refresh() {
        this.renderRoom(this.currentRoom);
    }

    /**
     * Redraw after map data changed underneath us — a live edit pushed from the
     * map editor, say.
     *
     * `renderRoom` only moves the position marker; the renderer caches each
     * area's geometry, so changed rooms, symbols, exits or labels stay invisible
     * until that area is drawn again. Only the area actually on screen needs it,
     * which is why this takes the list of areas that changed.
     */
    refreshAreas(areaIds: number[]) {
        const viewedAreaId = this._isViewingPlayerPosition
            ? this.reader.getRoom(this.currentRoom)?.area
            : this._viewedAreaId;

        if (viewedAreaId === undefined || viewedAreaId === null) {
            return;
        }
        if (!areaIds.includes(viewedAreaId)) {
            return;
        }

        if (this._isViewingPlayerPosition) {
            this.refreshLabels();
        } else if (this._viewedZ !== null) {
            this.viewAreaLevel(viewedAreaId, this._viewedZ);
        }
    }

    refreshRender() {
        this.renderer.refresh()
    }

    getVisitedCount() {
        return this.visited.size;
    }

    getRoomCount() {
        return this.totalRooms;
    }

    setExplorationMode(on: boolean) {
        this.explorationMode = on;
        if (this.explorationMode) {
            this.renderer.setLens(this.explorationLens);
        } else {
            this.renderer.setLens(ALL_VISIBLE);
        }
        this.refresh();
    }

    isExplorationMode(): boolean {
        return this.explorationMode;
    }

    setZoom(zoom: number) {
        const clampedZoom = this.clampZoom(zoom);
        this.zoom = clampedZoom;
        this.renderer.setZoom(clampedZoom);
    }

    /**
     * Zooms relative to the center of the viewport.
     * Use this for UI controls (buttons, menus) where there's no mouse position.
     */
    zoomToCenter(zoom: number) {
        const clampedZoom = this.clampZoom(zoom);
        this.zoom = clampedZoom;
        this.renderer.zoomToCenter(clampedZoom);
    }

    private clampZoom(zoom: number): number {
        if (!Number.isFinite(zoom)) {
            return MIN_ZOOM;
        }
        return zoom >= MIN_ZOOM ? zoom : MIN_ZOOM;
    }

    setInstantMove(on: boolean) {
        this.settings.instantMapMove = on;
    }

    setHighlightCurrentRoom(on: boolean) {
        this.settings.highlightCurrentRoom = on;
        this.renderer.setPosition(this.currentRoom);

    }

    setLabelRenderMode(mode: LabelRenderMode) {
        this.settings.labelRenderMode = this.settings.transparentLabels ? 'data' : mode;
        this.refreshLabels();
    }

    setTransparentLabels(on: boolean) {
        this.settings.transparentLabels = on;
        if (on) {
            this.settings.labelRenderMode = 'data';
        }
        this.refreshLabels();
    }

    private refreshLabels() {
        if (typeof this.currentRoom !== 'number') {
            return;
        }
        const room = this.reader.getRoom(this.currentRoom);
        if (!room) {
            return;
        }
        this.renderer.drawArea(room.area, room.z);
        this.renderRoom(this.currentRoom);
    }

    /**
     * View a specific area at a specific z level.
     * If the player is not in this area/level, centers on the middle of visible rooms
     * and hides the player marker.
     */
    viewAreaLevel(areaId: number, z: number) {
        const playerRoom = this.reader.getRoom(this.currentRoom);
        const isPlayerVisible = playerRoom && playerRoom.area === areaId && playerRoom.z === z;

        if (isPlayerVisible) {
            // Player is in this area/level, render normally
            this.renderer.drawArea(areaId, z);
            this.renderRoom(this.currentRoom);
            this.setViewingPlayerPosition(true);
        } else {
            // Draw the area at the specified level
            this.renderer.drawArea(areaId, z);

            // Hide the player marker since the player is not on this area/level
            this.renderer.clearPosition();

            // Find center of rooms at this level
            const area = this.reader.getArea?.(areaId);
            const rooms = area?.getRooms?.() ?? [];
            const roomsAtLevel = rooms.filter((r: any) => r.z === z);

            if (roomsAtLevel.length > 0) {
                // Calculate average position
                let sumX = 0, sumY = 0;
                for (const room of roomsAtLevel) {
                    sumX += room.x;
                    sumY += room.y;
                }
                const avgX = sumX / roomsAtLevel.length;
                const avgY = sumY / roomsAtLevel.length;

                // Find room closest to center
                let closestRoom = roomsAtLevel[0];
                let minDist = Infinity;
                for (const room of roomsAtLevel) {
                    const dist = Math.abs(room.x - avgX) + Math.abs(room.y - avgY);
                    if (dist < minDist) {
                        minDist = dist;
                        closestRoom = room;
                    }
                }

                this.renderer.setZoom(this.zoom);
                this.renderer.centerOn(closestRoom.id);
            }
            this.setViewingPlayerPosition(false, areaId, z);
        }

        this.renderCurrentPathAndHighlights()
    }

    /**
     * Update the player position marker if the player is in the currently viewed area/level.
     * Call this after changing the viewed area/level to check if player marker should be shown.
     */
    updatePlayerMarker() {
        if (this._viewedAreaId === null || this._viewedZ === null) {
            // Currently viewing player position, marker is already shown
            return;
        }

        const playerRoom = this.reader.getRoom(this.currentRoom);
        if (!playerRoom) {
            this.renderer.clearPosition();
            return;
        }

        const isPlayerVisible = playerRoom.area === this._viewedAreaId && playerRoom.z === this._viewedZ;

        if (isPlayerVisible) {
            this.renderer.setPosition(this.currentRoom);
        } else {
            // The renderer re-applies positionRoomId at the room's raw coords on area
            // change (ignoring area match), so an explicit clear is needed to hide it.
            this.renderer.clearPosition();
        }
    }

    /**
     * Check if currently viewing the player's position
     */
    get isViewingPlayerPosition(): boolean {
        return this._isViewingPlayerPosition;
    }

    private setViewingPlayerPosition(value: boolean, areaId?: number, z?: number) {
        const viewingChanged = this._isViewingPlayerPosition !== value;
        const newAreaId = value ? null : (areaId ?? null);
        const newZ = value ? null : (z ?? null);
        const areaChanged = this._viewedAreaId !== newAreaId;

        this._isViewingPlayerPosition = value;
        this._viewedAreaId = newAreaId;
        this._viewedZ = newZ;

        if (viewingChanged || areaChanged) {
            const areaName = this.getViewedAreaName();
            this.viewChangeListeners.forEach(listener => listener(value, areaName));
        }
    }

    /**
     * Get the name of the currently viewed area (when viewing a different area)
     */
    getViewedAreaName(): string | undefined {
        if (this._isViewingPlayerPosition || this._viewedAreaId === null) {
            return undefined;
        }
        const area = this.reader.getArea?.(this._viewedAreaId);
        return area?.getAreaName() ?? area?.getAreaId().toString()
    }

    /**
     * Subscribe to view position changes
     * @param listener - Called with (isViewingPlayer, areaName) when view changes
     */
    onViewChange(listener: (isViewingPlayer: boolean, areaName?: string) => void): () => void {
        this.viewChangeListeners.add(listener);
        return () => this.viewChangeListeners.delete(listener);
    }

    /**
     * Return to the player's current position
     */
    returnToPlayer() {
        if (typeof this.currentRoom !== 'number') return;
        const room = this.reader.getRoom(this.currentRoom);
        if (!room) return;

        this.renderer.drawArea(room.area, room.z);
        this.renderRoom(this.currentRoom);
        this.setViewingPlayerPosition(true);
    }

    reload(reader: MapReader) {
        this.reader = reader;
        this.totalRooms = reader.getRooms().length;

        if (typeof (this.renderer as any).destroy === 'function') {
            (this.renderer as any).destroy();
        }

        this.lostRoomsOverlay = null;

        this.renderer = new MapRenderer(this.reader, this.settings, this.map);

        if (this.explorationMode) {
            this.renderer.setLens(this.explorationLens);
        }

        if (typeof this.currentRoom === 'number') {
            this.renderRoom(this.currentRoom);
        }
    }

    private updateLostRoomsOverlay(roomIds: number[]) {
        if (!roomIds || roomIds.length === 0) {
            if (this.lostRoomsOverlay) {
                this.renderer.removeSceneOverlay(LOST_ROOMS_OVERLAY_ID);
                this.lostRoomsOverlay = null;
            }
            return;
        }
        if (!this.lostRoomsOverlay) {
            this.lostRoomsOverlay = new PulseOverlay({ roomIds });
            this.renderer.addSceneOverlay(LOST_ROOMS_OVERLAY_ID, this.lostRoomsOverlay);
        } else {
            this.lostRoomsOverlay.setRoomIds(roomIds);
        }
    }

    private updateParkedCarriagesOverlay(markers: ParkedCarriageMarker[]) {
        if (markers.length === 0) {
            if (this.parkedCarriagesOverlay) {
                this.renderer.removeSceneOverlay(PARKED_CARRIAGES_OVERLAY_ID);
                this.parkedCarriagesOverlay = null;
            }
            return;
        }
        if (!this.parkedCarriagesOverlay) {
            this.parkedCarriagesOverlay = new ParkedCarriagesOverlay(markers);
            this.renderer.addSceneOverlay(PARKED_CARRIAGES_OVERLAY_ID, this.parkedCarriagesOverlay);
        } else {
            this.parkedCarriagesOverlay.setMarkers(markers);
        }
    }

    private updateTransportHopsOverlay(hops: TransportHopMarker[]) {
        if (hops.length === 0) {
            if (this.transportHopsOverlay) {
                this.renderer.removeSceneOverlay(TRANSPORT_HOPS_OVERLAY_ID);
                this.transportHopsOverlay = null;
            }
            return;
        }
        if (!this.transportHopsOverlay) {
            this.transportHopsOverlay = new TransportHopsOverlay(hops);
            this.renderer.addSceneOverlay(TRANSPORT_HOPS_OVERLAY_ID, this.transportHopsOverlay);
        } else {
            this.transportHopsOverlay.setHops(hops);
        }
    }

    private setTransportStopsVisible(show: boolean) {
        if (!show) {
            if (this.transportStopsOverlay) {
                this.renderer.removeSceneOverlay(TRANSPORT_STOPS_OVERLAY_ID);
                this.transportStopsOverlay = null;
            }
            return;
        }
        if (!this.transportStopsOverlay) {
            // Stops come from the static transport definitions; build once and let
            // the renderer's WaypointOverlay handle placement/drawing. Each
            // waypoint carries its own onClick (opens the route popup).
            const overlay = new WaypointOverlay();
            overlay.set(buildTransportWaypoints());
            this.transportStopsOverlay = overlay;
            this.renderer.addSceneOverlay(TRANSPORT_STOPS_OVERLAY_ID, overlay);
        }
    }

    // Transport-stop bubbles live on the overlay layer, so they aren't part of
    // the renderer's room hit-testing. Resolve clicks against the overlay's own
    // bubble rects (world space) and fire the waypoint's handler.
    private onWaypointClick(ev: MouseEvent) {
        const overlay = this.transportStopsOverlay;
        if (!overlay) return;
        // Ignore clicks that were actually drags (pan started over a bubble): if
        // the pointer moved past a small threshold between down and up, bail.
        const down = this.pointerDownPos;
        this.pointerDownPos = null;
        if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5) return;
        const rect = this.map.getBoundingClientRect();
        const p = this.renderer.camera.clientToMapPoint(ev.clientX, ev.clientY, { left: rect.left, top: rect.top });
        if (!p) return;
        const wp = overlay.hitTest(p.x, p.y);
        wp?.onClick?.(wp);
    }

    // Show a pointer cursor while hovering a clickable transport-stop bubble.
    // The renderer drives the cursor only via room/area hover events, so we just
    // toggle on enter/leave of a waypoint and otherwise leave its value alone.
    private onWaypointHover(ev: PointerEvent) {
        const overlay = this.transportStopsOverlay;
        if (!overlay) {
            if (this.waypointHover) { this.map.style.cursor = ''; this.waypointHover = false; }
            return;
        }
        const rect = this.map.getBoundingClientRect();
        const p = this.renderer.camera.clientToMapPoint(ev.clientX, ev.clientY, { left: rect.left, top: rect.top });
        const over = !!(p && overlay.hitTest(p.x, p.y));
        if (over && !this.waypointHover) {
            this.map.style.cursor = 'pointer';
            this.waypointHover = true;
        } else if (!over && this.waypointHover) {
            this.map.style.cursor = '';
            this.waypointHover = false;
        }
    }
}
