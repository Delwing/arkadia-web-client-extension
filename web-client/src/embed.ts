import {MapReader, Renderer, PathFinder, Settings, RoomContextMenuEventDetail, LabelRenderMode} from "mudlet-map-renderer";
import {getCurrentCharacter, getItemSync, setItemSync} from "@client/src/storage";
import appEventBus from "@client/src/events/app-event-bus.ts";

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
    private map: HTMLDivElement;
    private reader: MapReader;
    private pathFinder: PathFinder;
    private renderer: Renderer;
    private currentRoom: any;
    private destinations: number[] = [];
    private highlights: number[] = [];
    private zoom: number;
    private explorationMode = false;
    private highlightCurrentRoom = true;
    private visited = new Set<number>();
    private totalRooms: number;
    private eventUnsubscribes: Array<() => void> = [];

    constructor(reader: MapReader, pathFinder: PathFinder, startId?: number) {
        this.map = document.querySelector<HTMLDivElement>("#map")!;
        this.map.style.touchAction = 'none';
        this.map.addEventListener('zoom', () => this.onZoom());
        this.map.addEventListener('roomcontextmenu', (ev: CustomEvent<RoomContextMenuEventDetail>) => this.onContextMenu(ev));
        this.reader = reader
        this.pathFinder = pathFinder;
        this.totalRooms = this.reader.getRooms().length;


        appEventBus.on("pauserStart", () => {
            const icon = document.getElementById('pause-icon');
            if (icon) {
                icon.hidden = false;
            }
        })

        appEventBus.on("pauserEnd", () => {
            const icon = document.getElementById('pause-icon');
            if (icon) {
                icon.hidden = true;
            }
        })

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
        this.zoom = zoom;
        if (transparentLabels) {
            labelRenderMode = 'data';
        }
        Settings.transparentLabels = transparentLabels;
        Settings.labelRenderMode = labelRenderMode;
        this.renderer = new Renderer(this.map, this.reader);
        this.setExplorationMode(explorationMode);
        this.setInstantMove(instantMove);
        this.setHighlightCurrentRoom(highlightCurrentRoom);

        appEventBus.on('enterLocation', ({id}) => {
            this.visited.add(id);
            this.reader.addVisitedRoom(id);
            setItemSync(STORAGE_KEY, id.toString());
            saveVisitedRooms(Array.from(this.visited));
            this.renderRoomById(id);
        });

        appEventBus.on("leadTo", (id) => {
            if (!id) return
            this.leadTo(id);
        });

        appEventBus.on("highlights", (highlights) => {
            this.highlights = highlights ?? [];
            this.refresh();
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
        let shouldSave = this.renderer.getZoom() !== this.zoom;
        this.zoom = this.renderer.getZoom();
        if (shouldSave) {
            this.saveZoom();
        }
    }

    private onContextMenu(ev: CustomEvent<RoomContextMenuEventDetail>) {
        ev.preventDefault();

        const room = ev.detail.roomId
        if (room) {
            const client: any = (window as any).clientExtension;
            client?.openMapContextMenu?.(room, ev.detail.position.x, ev.detail.position.y);
        }
    }

    renderRoomById(id: number) {
        this.renderRoom(id);
    }

    renderRoom(roomId: number) {
        this.renderer.setPosition(roomId)
        this.renderer.setZoom(this.zoom);
        const area = this.renderer.getCurrentArea()
        this.currentRoom = roomId;
        const label = document.getElementById('location-text');

        if (this.destinations.indexOf(roomId) > -1) {
            this.destinations.splice(this.destinations.indexOf(roomId), 1);
        }

        this.renderer.clearPaths()

        if (label && area) {
            let text = `#${roomId} ${area.getAreaName()}`;
            if (this.destinations.length > 0) {
                const destId = this.destinations[0];
                const path = this.getPath(roomId, destId);
                const distance = path ? path.length - 1 : 0;
                const room = this.reader.getRoom(roomId)
                const destArea = this.reader.getArea(room.area);
                const destName = destArea ? destArea.getAreaName() : destId;
                text += ` → #${destId} ${destName} (${distance})`;
                if (path) {
                    this.renderer.renderPath(path, '#66E64D');
                }
            }
            label.textContent = text;
        }

        this.renderer.clearHighlights()
        this.highlights.forEach((highlight) => {
            this.renderer.renderHighlight(highlight, 'green');
        });
    }

    private getPath(from: number, to: number): number[] | null {
        return this.pathFinder?.findPath(from, to) ?? null;
    }

    refresh() {
        this.renderRoom(this.currentRoom);
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
        this.zoom = zoom;
        this.renderer.setZoom(zoom);
    }

    setInstantMove(on: boolean) {
        Settings.instantMapMove = on;
    }

    setHighlightCurrentRoom(on: boolean) {
        this.highlightCurrentRoom = on;
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

    destroy() {
        this.eventUnsubscribes.forEach(unsubscribe => unsubscribe());
        this.eventUnsubscribes = [];
    }

    leadTo(id?: number | string) {
        if (typeof id !== 'undefined' && id !== null) {
            const destId = typeof id === 'number' ? id : parseInt(id);
            if (!isNaN(destId)) {
                this.destinations = [destId];
            } else {
                this.destinations = [];
            }
        } else {
            this.destinations = [];
        }
        this.refresh();
    }
}
