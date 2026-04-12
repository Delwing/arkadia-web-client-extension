import {
    MapReader,
    Renderer,
    createSettings,
    type Settings,
    RoomContextMenuEventDetail,
    type RoomClickEventDetail,
    type PanEventDetail,
    LabelRenderMode
} from "mudlet-map-renderer";
import {characterStorage, globalStorage} from "@modules/core/storage";
import eventBus from "@modules/core/eventBus";
import {getBuiltInPanelSetting, loadLayoutState} from "./layout/utils/layoutStorage";
import { showMapNoteTooltipForRoom, hideMapNoteTooltip } from "./mapNoteTooltip";
import { openMapContextMenu } from "@modules/core/contextMenus";

const MIN_ZOOM = 0.01;

const VISITED_DB_NAME = 'ArkadiaVisitedRoomsDB';
const VISITED_STORE_NAME = 'visitedRooms';

function getVisitedKey() {
    const char = characterStorage.getCharacter();
    return char ? `${char}:${VISITED_STORE_NAME}` : VISITED_STORE_NAME;
}

async function openVisitedDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(VISITED_DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(VISITED_STORE_NAME)) {
                db.createObjectStore(VISITED_STORE_NAME, {keyPath: 'id'});
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Failed to open IndexedDB'));
    });
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
    public renderer: Renderer;
    public readonly settings: Settings;
    public currentRoom: any;
    private zoom: number;
    private explorationMode = false;
    private visited = new Set<number>();
    private totalRooms: number;
    private currentPath: { segments: Array<{ path: number[]; color: string }> } | null = null;
    private currentHighlights: { roomId: number; color: string }[] = [];
    private _isViewingPlayerPosition = true;
    private _viewedAreaId: number | null = null;
    private _viewedZ: number | null = null;
    private viewChangeListeners: Set<(isViewing: boolean, areaName?: string) => void> = new Set();

    constructor(reader: MapReader, startId?: number) {
        this.map = document.querySelector<HTMLDivElement>("#map")!;
        this.map.style.touchAction = 'none';
        this.map.addEventListener('zoom', () => this.onZoom());
        this.map.addEventListener('roomcontextmenu', (ev: CustomEvent<RoomContextMenuEventDetail>) => this.onContextMenu(ev));
        this.map.addEventListener('roomclick', (ev: CustomEvent<RoomClickEventDetail>) => this.onRoomClick(ev));
        this.map.addEventListener('pan', (ev: CustomEvent<PanEventDetail>) => this.onPan(ev));
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
            const parsed = globalStorage.get('uiSettings') as any;
            if (parsed) {
                if (typeof parsed.mapScale === 'number' && parsed.mapScale > 0) {
                    zoom = parsed.mapScale;
                }
                if (typeof parsed.explorationMode === 'boolean') {
                    explorationMode = parsed.explorationMode;
                }
                if (typeof parsed.instantMove === 'boolean') {
                    instantMove = parsed.instantMove;
                }
                if (typeof parsed.highlightCurrentRoom === 'boolean') {
                    highlightCurrentRoom = parsed.highlightCurrentRoom;
                }
                if (parsed.labelRenderMode === 'image' || parsed.labelRenderMode === 'data') {
                    labelRenderMode = parsed.labelRenderMode;
                }
                if (typeof parsed.transparentLabels === 'boolean') {
                    transparentLabels = parsed.transparentLabels;
                }
                if (typeof parsed.mapPosition === 'string') {
                    mapPosition = parsed.mapPosition;
                }
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
        settings.areaName = false
        const isLayoutManagerEnabled = loadLayoutState().enabled;
        if (mapPosition.includes('overlay') && !isLayoutManagerEnabled) {
            settings.backgroundColor = 'transparent';
        } else {
            try {
                const parsed = globalStorage.get('uiSettings') as any;
                if (parsed && typeof parsed.mapBackgroundColor === 'string') {
                    settings.backgroundColor = parsed.mapBackgroundColor;
                }
            } catch {
                // ignore
            }
        }

        // Initialize map rendering settings from storage
        try {
            const parsed = globalStorage.get('uiSettings') as any;
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
        this.renderer = new Renderer(this.map, this.reader, settings);
        this.setExplorationMode(explorationMode);
        this.setInstantMove(instantMove);
        this.setHighlightCurrentRoom(highlightCurrentRoom);

        eventBus.on('enterLocation', async (ev) => {
            const id = ev.id;
            this.visited.add(id);
            this.reader.addVisitedRoom(id);
            characterStorage.set('mapperRoomId', id);
            saveVisitedRooms(Array.from(this.visited));
            this.renderRoomById(id);
        });

        eventBus.on('mapPath', (data: { segments: Array<{ path: number[]; color: string }> } | null) => {
            this.currentPath = data;
            this.renderCurrentPathAndHighlights();
        });

        eventBus.on('mapHighlights', (data: { roomId: number; color: string }[]) => {
            this.currentHighlights = data;
            this.renderCurrentPathAndHighlights();
        });
        // Request current highlights and path in case they were created before map loaded
        eventBus.emit('requestMapHighlights');
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

        this.initVisitedRooms(initialRoom);
    }

    private async initVisitedRooms(initialRoom: number) {
        const visited = await loadVisitedRooms();
        visited.forEach(id => this.visited.add(id));
        this.reader.addVisitedRooms(visited);
        this.renderRoomById(initialRoom);
    }

    private saveZoom() {
        try {
            const parsed: any = globalStorage.get('uiSettings') ?? {};
            parsed.mapScale = this.zoom;
            globalStorage.set('uiSettings', parsed);
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

    renderRoomById(id: number) {
        this.renderRoom(id);
        if (!this._isViewingPlayerPosition) {
            this.setViewingPlayerPosition(true);
        }
    }

    renderRoom(roomId: number) {
        this.renderer.setPosition(roomId)
        this.renderer.updatePositionMarker(roomId);
        this.renderer.setZoom(this.zoom);
        this.currentRoom = roomId;

        this.renderCurrentPathAndHighlights();
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
            this.reader.decorateWithExploration()
        } else {
            this.reader.clearExplorationDecoration()
        }
        this.refresh();
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

            // Update player marker - will hide since player is not on this area/level
            this.renderer.updatePositionMarker(this.currentRoom);

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
        if (!playerRoom) return;

        const isPlayerVisible = playerRoom.area === this._viewedAreaId && playerRoom.z === this._viewedZ;

        if (isPlayerVisible) {
            this.renderer.setPosition(this.currentRoom);
        }
        // When player is not visible, the position marker is simply not rendered
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

        this.renderer = new Renderer(this.map, this.reader, this.settings);

        this.reader.addVisitedRooms(Array.from(this.visited));

        if (this.explorationMode) {
            this.reader.decorateWithExploration();
        }

        if (typeof this.currentRoom === 'number') {
            this.renderRoom(this.currentRoom);
        }
    }
}
