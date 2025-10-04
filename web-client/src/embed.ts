import { MapReader, Renderer } from "mudlet-map-renderer";
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

class EmbeddedMap {
    private map: HTMLDivElement;
    private reader: MapReader;
    private renderer: Renderer;
    private currentRoom: any;
    private destinations: number[] = [];
    private highlights: number[] = []
    private _touchStartDistance: number | null = null;
    private _touchStartX: number | null = null;
    private _touchStartY: number | null = null;
    private _longPressTimer: number | null = null;
    private zoom: number;
    private limit: number;
    private explorationMode = false;
    private visited = new Set<number>();
    private totalRooms: number;

    constructor(mapData: any, colors: any, startId?: number) {
        this.map = document.querySelector<HTMLDivElement>("#map")!;
        // this.map.style.touchAction = 'none';
        // this._pinchZoom = this._pinchZoom.bind(this);
        // this._onTouchStart = this._onTouchStart.bind(this);
        // this._onTouchEnd = this._onTouchEnd.bind(this);
        // this._onZoom = this._onZoom.bind(this);
        // this.map.addEventListener('touchstart', this._onTouchStart, { passive: false });
        // this.map.addEventListener('touchmove', this._pinchZoom, { passive: false });
        // this.map.addEventListener('touchend', this._onTouchEnd);
        // this.map.addEventListener('touchcancel', this._onTouchEnd);
        // this.map.addEventListener('zoom', this._onZoom);
        this.reader = new MapReader(mapData, colors);
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
        } catch {}
        this.zoom = zoom;
        this.explorationMode = explorationMode;
        this.renderer = new Renderer(this.map, this.reader);

        window.addEventListener('enterLocation', async (ev: any) => {
            const id = ev.detail.id;
            this.visited.add(id);
            setItemSync(STORAGE_KEY, id.toString());
            await saveVisitedRooms(Array.from(this.visited));
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
        this.renderRoomById(initialRoom);
    }

    private _onTouchStart(ev: TouchEvent) {
        if (this._longPressTimer !== null) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = null;
        }
        if (ev.touches.length === 2) {
            const [t1, t2] = ev.touches;
            this._touchStartDistance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        }
    }

    private _onTouchEnd(ev: TouchEvent) {
        if (ev.touches.length < 2) {
            this._touchStartDistance = null;
        }
        if (ev.touches.length === 0) {
            this._touchStartX = null;
            this._touchStartY = null;
        }
    }

    private _pinchZoom(ev: TouchEvent) {
        if (ev.touches.length === 2 && this._touchStartDistance !== null) {
            if (this._longPressTimer !== null) {
                clearTimeout(this._longPressTimer);
                this._longPressTimer = null;
            }
            ev.preventDefault();
            const [t1, t2] = ev.touches;
            const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            const delta = dist / this._touchStartDistance;
            this._touchStartDistance = dist;
            this.setZoom(this.zoom * delta);
        } else if (
            ev.touches.length === 1 &&
            this._longPressTimer !== null &&
            this._touchStartX !== null &&
            this._touchStartY !== null
        ) {
            const touch = ev.touches[0];
            const dx = touch.clientX - this._touchStartX;
            const dy = touch.clientY - this._touchStartY;
            if (Math.hypot(dx, dy) > 10) {
                clearTimeout(this._longPressTimer);
                this._longPressTimer = null;
            }
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
        let shouldSave = this.renderer.getZoom() !== this.zoom;
        this.zoom = this.renderer.getZoom();
        if (shouldSave) {
            this._saveZoom();
        }
    }

    // private _onContextMenu(ev: MouseEvent | { clientX: number; clientY: number; pageX: number; pageY: number; preventDefault: () => void }) {
    //     ev.preventDefault();
    //     const point = this.renderer.paper.view.getEventPoint(ev as any);
    //     const hit = this.renderer.roomLayer.hitTest(point, { fill: true, tolerance: 0 });
    //     const room = hit ? this.renderer.area?.rooms?.find((r: any) => r?.render === hit.item) : undefined;
    //     console.log('Context menu', { x: point.x, y: point.y, roomId: room?.id });
    //     if (room) {
    //         const handler: any = (window as any).clientExtension?.OutputHandler;
    //         handler?.showContextMenu([
    //             {
    //                 label: 'Ustaw lokację',
    //                 action: () => (window as any).clientExtension?.Map.setMapRoomById(room.id)
    //             },
    //             {
    //                 label: 'Prowadź do lokacji',
    //                 action: () => (window as any).clientExtension?.sendEvent('leadTo', room.id)
    //             },
    //             {
    //                 label: 'Idź do lokacji',
    //                 action: () => (window as any).clientExtension?.sendCommand(`/idz ${room.id}`)
    //             }
    //         ], (ev as any).pageX, (ev as any).pageY);
    //     }
    // }

    private _saveLimit() {
        try {
            const data = getItemSync('uiSettings');
            const parsed: any = data?.uiSettings ? { ...data.uiSettings } : {};
            parsed.mapLimit = this.limit;
            setItemSync('uiSettings', parsed);
        } catch {}
    }

    renderRoomById(id: number) {
        this.renderRoom(id);
    }

    renderRoom(roomId: number) {
            this.renderer.setPosition(roomId)
            this.renderer.setZoom(0.5)
            const area = this.renderer.getCurrentArea()
            this.currentRoom = roomId;
            const label = document.getElementById('location-text');
            if (label && area) {
                let text = `#${roomId} ${area.getAreaName()}`;
                // if (this.destinations.length > 0) {
                //     const destId = this.destinations[0];
                //     const path = this.reader.getPath(roomId.id, destId);
                //     const distance = path ? path.length - 1 : 0;
                //     const destArea = this.reader.getAreaByRoomId(destId);
                //     const destName = destArea ? destArea.areaName : destId;
                //     text += ` → #${destId} ${destName} (${distance})`;
                // }
                label.textContent = text;
            }

            // if (this.destinations.indexOf(roomId.id) > -1) {
            //     this.destinations.splice(this.destinations.indexOf(roomId.id), 1);
            // }
            //
            // this.destinations.forEach(destination => {
            //     this.renderer.renderPath(roomId.id, destination);
            // });
            //
            // this.highlights.forEach((highlight) => {
            //     const room = this.reader.getRoomById(highlight);
            //     if (
            //         room.z === this.currentRoom.z &&
            //         this.renderer.area.getRoomById(highlight) !== undefined
            //     ) {
            //         this.renderer.renderHighlight(highlight);
            //     }
            // });
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
