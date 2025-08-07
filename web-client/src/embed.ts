let limit = 35;

import { MapReader, Renderer, Settings } from "mudlet-map-renderer";
import { getCurrentCharacter, getItemSync, setItemSync } from "@client/src/storage";

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
                db.createObjectStore(VISITED_STORE_NAME, { keyPath: 'id' });
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
            const req = store.put({ id: getVisitedKey(), rooms });
            req.onsuccess = () => resolve();
            req.onerror = () => reject(new Error('Failed to store visited rooms'));
        });
    } catch {}
}

export default class EmbeddedMap {
    private map: HTMLElement;
    private reader: any;
    private renderer: any;
    private settings: any;
    private currentRoom: any;
    private destinations: number[] = [];
    private highlights: number[] = []
    private _touchStartDistance: number | null = null;
    private zoom: number;
    private limit: number;
    private explorationMode = false;
    private visited = new Set<number>();
    private totalRooms: number;

    constructor(mapData: any, colors: any, startId?: number) {
        this.map = document.querySelector<HTMLCanvasElement>("#map")!;
        this.map.style.touchAction = 'none';
        this._pinchZoom = this._pinchZoom.bind(this);
        this._onTouchStart = this._onTouchStart.bind(this);
        this._onTouchEnd = this._onTouchEnd.bind(this);
        this._onZoom = this._onZoom.bind(this);
        this.map.addEventListener('touchstart', this._onTouchStart, { passive: false });
        this.map.addEventListener('touchmove', this._pinchZoom, { passive: false });
        this.map.addEventListener('touchend', this._onTouchEnd);
        this.map.addEventListener('touchcancel', this._onTouchEnd);
        this.map.addEventListener('zoom', this._onZoom);
        this.reader = new MapReader(mapData, colors);
        this.totalRooms = this.reader.getAreas().reduce((sum: number, area: any) => sum + area.rooms.length, 0);
        this.settings = new Settings();
        this.settings.areaName = false;
        this.settings.scale = 90;
        this.settings.borders = true;
        this.settings.transparentLabels = true;
        this.settings
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
                if (typeof parsed.mapLimit === 'number' && parsed.mapLimit > 0) {
                    limit = parsed.mapLimit;
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
        } catch {}
        this.zoom = zoom;
        this.limit = limit;
        this.explorationMode = explorationMode;
        this.renderer = new Renderer(this.map, this.reader, this.settings);

        window.addEventListener('enterLocation', async (ev: any) => {
            const id = ev.detail.id;
            this.visited.add(id);
            setItemSync(STORAGE_KEY, id.toString());
            await saveVisitedRooms(Array.from(this.visited));
            this.renderRoomById(id);
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
        this.renderRoomById(initialRoom);
    }

    private _onTouchStart(ev: TouchEvent) {
        if (ev.touches.length === 2) {
            const [t1, t2] = ev.touches;
            this._touchStartDistance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        }
    }

    private _onTouchEnd(ev: TouchEvent) {
        if (ev.touches.length < 2) {
            this._touchStartDistance = null;
        }
    }

    private _pinchZoom(ev: TouchEvent) {
        if (ev.touches.length === 2 && this._touchStartDistance !== null) {
            ev.preventDefault();
            const [t1, t2] = ev.touches;
            const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            const delta = dist / this._touchStartDistance;
            this._touchStartDistance = dist;
            this.setZoom(this.zoom * delta);
        }
    }

    private _saveZoom() {
        try {
            const data = getItemSync('uiSettings');
            const parsed: any = data?.uiSettings ? { ...data.uiSettings } : {};
            parsed.mapScale = this.zoom;
            setItemSync('uiSettings', parsed);
        } catch {}
    }

    private _onZoom() {
        let shouldSave = this.renderer.paper.view.zoom !== this.zoom;
        this.zoom = this.renderer.paper.view.zoom;
        if (shouldSave) {
            this._saveZoom();
        }
    }

    private _saveLimit() {
        try {
            const data = getItemSync('uiSettings');
            const parsed: any = data?.uiSettings ? { ...data.uiSettings } : {};
            parsed.mapLimit = this.limit;
            setItemSync('uiSettings', parsed);
        } catch {}
    }

    renderRoomById(id: number) {
        this.renderRoom(this.reader.getRoomById(id));
    }

    renderRoom(room: any) {
        if (room) {
            const area = this.reader.getAreaByRoomId(room.id, {
                xMin: room.x - this.limit,
                xMax: room.x + this.limit,
                yMin: room.y - this.limit,
                yMax: room.y + this.limit
            });
            if (this.explorationMode) {
                const rooms: any[] = [];
                area.rooms.forEach((r: any) => {
                    if (r && this.visited.has(r.id)) {
                        rooms[r.id] = r;
                    }
                });
                area.rooms = rooms;
            }
            this.renderer?.clear();
            this.renderer.renderArea(area);
            this.renderer.controls.centerRoom(room.id);
            this.renderer.controls.setZoom(this.zoom);
            this.renderer.backgroundLayer.remove();
            
            this.currentRoom = room;
            const label = document.getElementById('location-label');
            if (label && area) {
                let text = `#${room.id} ${area.areaName}`;
                if (this.destinations.length > 0) {
                    const destId = this.destinations[0];
                    const path = this.reader.getPath(room.id, destId);
                    const distance = path ? path.length - 1 : 0;
                    const destArea = this.reader.getAreaByRoomId(destId);
                    const destName = destArea ? destArea.areaName : destId;
                    text += ` -> #${destId} ${destName} (${distance})`;
                }
                label.textContent = text;
            }

            if (this.destinations.indexOf(room.id) > -1) {
                this.destinations.splice(this.destinations.indexOf(room.id), 1);
            }

            this.destinations.forEach(destination => {
                this.renderer.controls.renderPath(room.id, destination);
            });

            this.highlights.forEach((highlight) => {
                const room = this.reader.getRoomById(highlight);
                if (
                    room.z === this.currentRoom.z &&
                    this.renderer.area.getRoomById(highlight) !== undefined
                ) {
                    this.renderer.renderHighlight(highlight);
                }
            });
        }
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
        this.refresh();
    }

    setZoom(zoom: number) {
        this.zoom = zoom;
        if (this.renderer?.controls) {
            this.renderer.controls.setZoom(this.zoom);
        }
    }

    setLimit(newLimit: number) {
        this.limit = newLimit;
        this.refresh();
        this._saveLimit();
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
