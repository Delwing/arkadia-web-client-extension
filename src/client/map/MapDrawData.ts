import type {LeadPlanner} from "./LeadPlanner";
import type {MapDataStore} from "./MapDataStore";
import {SEGMENT_COLORS} from "./segmentColors";
import type {MapHelperClient} from "./types";

/** A highlighter handed out by {@link MapDrawData.createHighlighter} (`api.map.createHighlighter`). */
export interface MapHighlighter {
    id: string;
    add: (roomIds: number | number[]) => void;
    remove: (roomIds: number | number[]) => void;
    clear: () => void;
    enable: () => void;
    disable: () => void;
    isEnabled: () => boolean;
    setColor: (color: string) => void;
    getColor: () => string;
    getRoomIds: () => number[];
    destroy: () => void;
}

/**
 * What a map view draws on top of the map, published as events for whichever
 * UI renders it: the route (`mapPath`, `mapTransportHops`), the highlighted
 * rooms (`mapHighlights`) and the location label (`mapLocationLabel`).
 * Nothing here touches the DOM.
 */
export class MapDrawData {
    private highlights: number[] = [];
    private highlighterIdCounter = 0;
    private highlighters: Map<string, { roomIds: Set<number>; color: string; enabled: boolean }> = new Map();

    constructor(
        private readonly client: Pick<MapHelperClient, "sendEvent">,
        private readonly data: MapDataStore,
        private readonly position: { readonly currentRoom: MapData.Room },
        private readonly lead: Pick<LeadPlanner, "destinations" | "transportRoute">,
    ) {
    }

    setHighlights(highlights: number[]) {
        this.highlights = highlights;
        this.emitDrawData();
    }

    createHighlighter(options?: { color?: string; enabled?: boolean }): MapHighlighter {
        const id = `highlighter_${++this.highlighterIdCounter}`;
        const state = {
            roomIds: new Set<number>(),
            color: options?.color ?? "yellow",
            enabled: options?.enabled ?? true
        };
        this.highlighters.set(id, state);

        const emitIfNeeded = () => {
            if (state.enabled) {
                this.emitHighlights();
            }
        };

        return {
            id,
            add: (roomIds: number | number[]) => {
                const ids = Array.isArray(roomIds) ? roomIds : [roomIds];
                ids.forEach(roomId => state.roomIds.add(roomId));
                emitIfNeeded();
            },
            remove: (roomIds: number | number[]) => {
                const ids = Array.isArray(roomIds) ? roomIds : [roomIds];
                ids.forEach(roomId => state.roomIds.delete(roomId));
                emitIfNeeded();
            },
            clear: () => {
                state.roomIds.clear();
                emitIfNeeded();
            },
            enable: () => {
                if (!state.enabled) {
                    state.enabled = true;
                    this.emitHighlights();
                }
            },
            disable: () => {
                if (state.enabled) {
                    state.enabled = false;
                    this.emitHighlights();
                }
            },
            isEnabled: () => state.enabled,
            setColor: (color: string) => {
                state.color = color;
                emitIfNeeded();
            },
            getColor: () => state.color,
            getRoomIds: () => Array.from(state.roomIds),
            destroy: () => {
                this.highlighters.delete(id);
                this.emitHighlights();
            }
        };
    }

    removeHighlighter(id: string) {
        if (this.highlighters.delete(id)) {
            this.emitHighlights();
        }
    }

    emitDrawData() {
        this.emitPath();
        this.emitHighlights();
        this.emitLocationLabel();
    }

    emitPath() {
        const transportRoute = this.lead.transportRoute;
        if (transportRoute) {
            this.client.sendEvent("mapPath", { segments: transportRoute.walkSegments });
            this.client.sendEvent("mapTransportHops", transportRoute.hops);
            return;
        }
        this.client.sendEvent("mapTransportHops", null);
        const currentId = this.position.currentRoom?.id;
        const destinations = this.lead.destinations;
        if (destinations.length > 0 && currentId) {
            // Build path segments through all destinations, each with a different color
            const segments: Array<{ path: number[]; color: string }> = [];
            let fromId = currentId;
            let colorIndex = 0;
            for (const destId of destinations) {
                const segment = this.data.pathFinder?.findPath(fromId, destId);
                if (segment && segment.length > 0) {
                    segments.push({
                        path: segment,
                        color: SEGMENT_COLORS[colorIndex % SEGMENT_COLORS.length]
                    });
                    colorIndex++;
                    fromId = destId;
                }
            }
            if (segments.length > 0) {
                this.client.sendEvent("mapPath", { segments });
                return;
            }
        }
        this.client.sendEvent("mapPath", null);
    }

    emitHighlights() {
        const allHighlights: { roomId: number; color: string }[] = [];

        // Add legacy highlights (from setHighlights/zaznaczaj)
        for (const roomId of this.highlights) {
            allHighlights.push({ roomId, color: "yellow" });
        }

        // Add highlights from all enabled highlighters
        for (const state of this.highlighters.values()) {
            if (state.enabled) {
                for (const roomId of state.roomIds) {
                    allHighlights.push({ roomId, color: state.color });
                }
            }
        }

        this.client.sendEvent("mapHighlights", allHighlights);
    }

    emitLocationLabel() {
        this.client.sendEvent("mapLocationLabel", this.buildLocationLabel());
    }

    private buildLocationLabel(): string {
        const room = this.position.currentRoom;
        const currentId = room?.id;
        const reader = this.data.reader;
        if (!currentId || !reader) {
            return "";
        }

        const area = reader.getArea(room?.area);
        if (!area) {
            return "";
        }

        const roomName = room?.name || "";
        const areaName = area.getAreaName();
        const showRoomName = roomName && roomName !== String(currentId);
        let text = showRoomName ? `#${currentId} ${roomName} (${areaName})` : `#${currentId} ${areaName}`;

        const destinations = this.lead.destinations;
        if (destinations.length > 0) {
            // Calculate total distance through all destinations
            let totalDistance = 0;
            let fromId = currentId;
            let hasValidPath = false;
            for (const destId of destinations) {
                const segment = this.data.pathFinder?.findPath(fromId, destId);
                if (segment && segment.length > 0) {
                    totalDistance += segment.length - 1;
                    fromId = destId;
                    hasValidPath = true;
                }
            }

            if (hasValidPath) {
                const finalDestId = destinations[destinations.length - 1];
                const destRoom = reader.getRoom(finalDestId);
                const destArea = destRoom ? reader.getArea(destRoom.area) : null;
                const destName = destArea ? destArea.getAreaName() : String(finalDestId);

                if (destinations.length > 1) {
                    text += ` → #${finalDestId} ${destName} (${totalDistance}, ${destinations.length} przystanków)`;
                } else {
                    text += ` → #${finalDestId} ${destName} (${totalDistance})`;
                }
            }
        }

        return text;
    }
}
