import {
    MapReader,
    Renderer,
    Settings,
    RoomContextMenuEventDetail,
    LabelRenderMode
} from "mudlet-map-renderer";
import {getCurrentCharacter, getItemSync, setItemSync} from "@modules/core/storage";
import eventBus from "@modules/core/eventBus";
import { getClientInstance } from "@shared/runtime";

const MIN_ZOOM = 0.01;

const STORAGE_KEY = 'mapperRoomId';
const VISITED_DB_NAME = 'ArkadiaVisitedRoomsDB';
const VISITED_STORE_NAME = 'visitedRooms';

function getVisitedKey() {
    const char = getCurrentCharacter();
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
    public readonly reader: MapReader;
    public renderer: Renderer;
    public currentRoom: any;
    private zoom: number;
    private explorationMode = false;
    private visited = new Set<number>();
    private readonly totalRooms: number;
    private currentPath: { path: number[]; color: string } | null = null;
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
        this.reader = reader;
        this.totalRooms = this.reader.getRooms().length;

        let zoom = 0.30;
        let explorationMode = false;
        let instantMove = true;
        let highlightCurrentRoom = true;
        let labelRenderMode: LabelRenderMode = 'data';
        let transparentLabels = true;
        let initialRoom = startId ?? 1;
        try {
            const data = getItemSync('uiSettings');
            const parsed = data?.uiSettings as any;
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
            }
        } catch {
            // ignore malformed data
        }
        try {
            const saved = getItemSync(STORAGE_KEY);
            const savedId = saved ? parseInt(saved[STORAGE_KEY]) : NaN;
            if (!isNaN(savedId)) {
                initialRoom = savedId;
            }
        } catch {
        }
        this.zoom = this.clampZoom(zoom);
        if (transparentLabels) {
            labelRenderMode = 'data';
        }
        Settings.transparentLabels = transparentLabels;
        Settings.labelRenderMode = labelRenderMode;
        Settings.playerMarker.dash = [0.05, 0.05]

        // Initialize map rendering settings from storage
        try {
            const data = getItemSync('uiSettings');
            const parsed = data?.uiSettings as any;
            if (parsed) {
                if (typeof parsed.mapRoomSize === 'number' && parsed.mapRoomSize > 0) {
                    Settings.roomSize = parsed.mapRoomSize;
                }
                if (typeof parsed.mapLineWidth === 'number' && parsed.mapLineWidth > 0) {
                    Settings.lineWidth = parsed.mapLineWidth;
                }
                if (typeof parsed.mapPlayerMarkerStrokeColor === 'string') {
                    Settings.playerMarker.strokeColor = parsed.mapPlayerMarkerStrokeColor;
                }
                if (typeof parsed.mapPlayerMarkerStrokeAlpha === 'number') {
                    Settings.playerMarker.strokeAlpha = parsed.mapPlayerMarkerStrokeAlpha;
                }
                if (typeof parsed.mapPlayerMarkerFillColor === 'string') {
                    Settings.playerMarker.fillColor = parsed.mapPlayerMarkerFillColor;
                }
                if (typeof parsed.mapPlayerMarkerFillAlpha === 'number') {
                    Settings.playerMarker.fillAlpha = parsed.mapPlayerMarkerFillAlpha;
                }
                if (typeof parsed.mapPlayerMarkerStrokeWidth === 'number') {
                    Settings.playerMarker.strokeWidth = parsed.mapPlayerMarkerStrokeWidth;
                }
                if (typeof parsed.mapPlayerMarkerSizeFactor === 'number') {
                    Settings.playerMarker.sizeFactor = parsed.mapPlayerMarkerSizeFactor;
                }
                if (typeof parsed.mapPlayerMarkerDashEnabled === 'boolean') {
                    Settings.playerMarker.dashEnabled = parsed.mapPlayerMarkerDashEnabled;
                }
            }
        } catch {
            // ignore malformed data
        }

        this.renderer = new Renderer(this.map, this.reader);
        this.setExplorationMode(explorationMode);
        this.setInstantMove(instantMove);
        this.setHighlightCurrentRoom(highlightCurrentRoom);

        eventBus.on('enterLocation', async (ev) => {
            const id = ev.id;
            this.visited.add(id);
            this.reader.addVisitedRoom(id);
            setItemSync(STORAGE_KEY, id.toString());
            saveVisitedRooms(Array.from(this.visited));
            getClientInstance()?.Map?.checkDestinationReached(id);
            this.renderRoomById(id);
        });

        eventBus.on('mapPath', (data: { path: number[]; color: string } | null) => {
            this.currentPath = data;
            this.refresh();
        });

        eventBus.on('mapHighlights', (data: { roomId: number; color: string }[]) => {
            this.currentHighlights = data;
            this.refresh();
        });

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

        eventBus.on('map.setLocation', (data: { roomId: number }) => {
            getClientInstance()?.Map?.setMapRoomById(data.roomId);
        });

        eventBus.on('map.showPath', (data: { toRoomId: number }) => {
            const currentRoom = this.currentRoom;
            const pathFinder = (this as any).pathFinder ?? (globalThis as any).embedded?.pathFinder;
            if (currentRoom && pathFinder) {
                const path = pathFinder.findPath(currentRoom, data.toRoomId);
                if (path) {
                    this.currentPath = { path, color: '#66E64D' };
                    this.refresh();
                } else {
                    eventBus.emit('notify', { text: 'Brak sciezki do lokacji' });
                }
            } else {
                eventBus.emit('notify', { text: 'Brak sciezki do lokacji' });
            }
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
            const data = getItemSync('uiSettings');
            const parsed: any = data?.uiSettings ? {...data.uiSettings} : {};
            parsed.mapScale = this.zoom;
            setItemSync('uiSettings', parsed);
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

    private onContextMenu(ev: CustomEvent<RoomContextMenuEventDetail>) {
        ev.preventDefault();

        const room = ev.detail.roomId
        if (room) {
            const client = getClientInstance();
            // Transform canvas-relative coordinates to viewport coordinates
            const mapRect = this.map.getBoundingClientRect();
            const viewportX = ev.detail.position.x + mapRect.left;
            const viewportY = ev.detail.position.y + mapRect.top;
            client?.openMapContextMenu?.(room, viewportX, viewportY);
        }
    }

    renderRoomById(id: number) {
        this.renderRoom(id);
    }

    renderRoom(roomId: number) {
        this.renderer.setPosition(roomId)
        this.renderer.setZoom(this.zoom);
        this.currentRoom = roomId;

        this.renderCurrentPathAndHighlights();
    }

    private renderCurrentPathAndHighlights() {
        this.renderer.clearPaths()
        if (this.currentPath) {
            this.renderer.renderPath(this.currentPath.path, this.currentPath.color);
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

    private clampZoom(zoom: number): number {
        if (!Number.isFinite(zoom)) {
            return MIN_ZOOM;
        }
        return zoom >= MIN_ZOOM ? zoom : MIN_ZOOM;
    }

    setInstantMove(on: boolean) {
        Settings.instantMapMove = on;
    }

    setHighlightCurrentRoom(on: boolean) {
        Settings.highlightCurrentRoom = on;
        this.renderer.setPosition(this.currentRoom);

    }

    setLabelRenderMode(mode: LabelRenderMode) {
        Settings.labelRenderMode = Settings.transparentLabels ? 'data' : mode;
        this.refreshLabels();
    }

    setTransparentLabels(on: boolean) {
        Settings.transparentLabels = on;
        if (on) {
            Settings.labelRenderMode = 'data';
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

        this.renderer.clearPosition()

        if (isPlayerVisible) {
            // Player is in this area/level, render normally
            this.renderer.drawArea(areaId, z);
            this.renderRoom(this.currentRoom);
            this.setViewingPlayerPosition(true);
        } else {
            // Draw the area at the specified level
            this.renderer.drawArea(areaId, z);

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
        } else {
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

        this.renderer.clearPosition();
        this.renderer.drawArea(room.area, room.z);
        this.renderRoom(this.currentRoom);
        this.setViewingPlayerPosition(true);
    }
}
