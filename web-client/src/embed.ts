import {MapReader, Renderer, PathFinder, RoomContextMenuEventDetail} from "mudlet-map-renderer";
import {getCurrentCharacter, getItemSync, setItemSync} from "@client/src/storage";

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

class EmbeddedMap {
    private map: HTMLDivElement;
    private reader: MapReader;
    private renderer: Renderer;
    private pathFinder: PathFinder;
    private currentRoom: any;
    private destinations: number[] = [];
    private highlights: number[] = []
    private zoom: number;
    private explorationMode = false;
    private visited = new Set<number>();
    private totalRooms: number;

    constructor(mapData: any, colors: any, startId?: number) {
        this.map = document.querySelector<HTMLDivElement>("#map")!;
        this.map.style.touchAction = 'none';
        this.map.addEventListener('zoom', () => this.onZoom());
        this.map.addEventListener('roomcontextmenu', (ev: CustomEvent<RoomContextMenuEventDetail>) => this.onContextMenu(ev));
        this.reader = new MapReader(mapData, colors);
        this.pathFinder = new PathFinder(this.reader)
        this.totalRooms = this.reader.getRooms().length;

        window.addEventListener('pauserStart', () => {
            const icon = document.getElementById('pause-icon');
            if (icon) {
                icon.hidden = false;
            }
        });
        window.addEventListener('pauserEnd', () => {
            const icon = document.getElementById('pause-icon');
            if (icon) {
                icon.hidden = true;
            }
        });
        let zoom = 0.30;
        let explorationMode = false;
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
        this.renderer = new Renderer(this.map, this.reader);
        this.setExplorationMode(explorationMode);

        window.addEventListener('enterLocation', async (ev: any) => {
            const id = ev.detail.id;
            this.visited.add(id);
            this.reader.addVisitedRoom(id);
            setItemSync(STORAGE_KEY, id.toString());
            saveVisitedRooms(Array.from(this.visited));
            this.renderRoomById(parseInt(id));
        });

        window.addEventListener('leadTo', (ev: any) => {
            this.leadTo(ev.detail);
        });

        window.addEventListener('highlights', (ev: any) => {
            this.highlights = ev.detail;
            this.refresh();
        })

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
            const handler: any = (window as any).clientExtension?.OutputHandler;
            handler?.showContextMenu([
                {
                    label: 'Ustaw lokację',
                    action: () => (window as any).clientExtension?.Map.setMapRoomById(room)
                },
                {
                    label: 'Prowadź do lokacji',
                    action: () => (window as any).clientExtension?.sendEvent('leadTo', room)
                },
                {
                    label: 'Idź do lokacji',
                    action: () => (window as any).clientExtension?.sendCommand(`/idz ${room}`)
                }
            ], ev.detail.position.x, ev.detail.position.y);
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
                const path = this.pathFinder.findPath(roomId, destId);
                console.log('path', path);
                const distance = path ? path.length - 1 : 0;
                const room = this.reader.getRoom(roomId)
                const destArea = this.reader.getArea(room.area);
                const destName = destArea ? destArea.getAreaName() : destId;
                text += ` → #${destId} ${destName} (${distance})`;
                this.renderer.renderPath(path);
            }
            label.textContent = text;
        }

        this.renderer.clearHighlights()
        this.highlights.forEach((highlight) => {
            this.renderer.renderHighlight(highlight, 'green');
        });
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

    leadTo(id?: string) {
        if (id) {
            this.destinations.push(parseInt(id));
        } else {
            this.destinations = [];
        }
        this.refresh();
    }
}

export const createMap = (data: { mapData: any; colors: any; startId?: number }) => {
    (window as any).embedded = new EmbeddedMap(data.mapData, data.colors, data.startId);
};

window.addEventListener('map-ready-with-data', (e: Event) =>
    createMap((e as CustomEvent).detail)
);
