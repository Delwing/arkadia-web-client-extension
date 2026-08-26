import Client from "../Client";


interface GpsEntry {
    gps_string_lines: string[];
    line_delta?: number;
    area_name?: string;
    room_id: number;
    within_room_ids?: number[];
}

/**
 * Triggers for one area are tagged together, so an area can be torn down and
 * rebuilt on its own without disturbing the rest of the map.
 */
function tagFor(areaId: number) {
    return `gps:${areaId}`;
}

export default function initGps(client: Client) {

    function registerRoom(room: MapData.Room, tag: string) {
        const raw = room.userData?.gps;
        if (!raw) {
            return;
        }
        let entries: GpsEntry[];
        try {
            entries = JSON.parse(raw);
        } catch {
            return;
        }
        entries.forEach((entry, idx) => {
            // Ensure within_room_ids are numbers (JSON may have strings)
            if (entry.within_room_ids) {
                entry.within_room_ids = entry.within_room_ids.map(id => Number(id));
            }
            const lines = entry.gps_string_lines;
            if (!lines || lines.length === 0) {
                return;
            }
            const delta = entry.line_delta ? Number(entry.line_delta) - 1 : lines.length - 1;
            const gpsId = `${room.id}_${idx}`;
            let current = 1;
            const checkContext = () => {
                if (entry.area_name && client.Map.getAreaName(client.Map.currentRoom?.area.toString()) !== entry.area_name) {
                    return false;
                }
                if (entry.within_room_ids && entry.within_room_ids.length > 0) {
                    const id = client.Map.currentRoom?.id;
                    if (!id || !entry.within_room_ids.includes(id)) {
                        return false;
                    }
                }
                return true;
            };
            const parent = client.Triggers.registerTrigger(
                lines[0],
                () => {
                    if (!checkContext()) {
                        return;
                    }
                    if (lines.length === 1) {
                        if (client.Map.currentRoom?.id !== room.id) {
                            client.Map.setMapRoomById(room.id);
                            client.sendEvent('notify', {text: `Map Sync: gps ${gpsId}`});
                        }
                    } else {
                        current = 0;
                    }
                    return undefined;
                },
                tag,
                {stayOpenLines: delta}
            );
            if (lines.length > 1) {
                parent.registerChild(/.*/, (line, _matches, _type, originalLine) => {
                    if (!checkContext()) {
                        return line;
                    }
                    if (originalLine === lines[current]) {
                        current++;
                        if (current === lines.length) {
                            if (client.Map.currentRoom?.id !== room.id) {
                                client.Map.setMapRoomById(room.id);
                                client.sendEvent('notify', {text: `Map Sync: gps ${gpsId}`});
                            }
                            current = 1;
                        }
                        return line;
                    }
                    return line;
                });
            }
        });
    }

    /** Areas we currently hold triggers for, so they can be retired by tag. */
    const registered = new Set<number>();

    /**
     * Rebuild one area's GPS triggers from scratch.
     *
     * Always clears first: an area arriving again means its rooms may have
     * gained, lost or changed `gps` entries, and stale triggers would keep
     * syncing the player to rooms that no longer claim those lines.
     */
    function rebuildArea(areaId: number) {
        client.Triggers.removeByTag(tagFor(areaId));
        registered.delete(areaId);

        const area = client.Map.tryGetMapReader()?.getArea(areaId);
        if (!area) {
            return;
        }
        const tag = tagFor(areaId);
        area.getRooms().forEach(room => registerRoom(room, tag));
        registered.add(areaId);
    }

    /**
     * Drop triggers for areas the map no longer has.
     *
     * Replacing the whole map announces only the *new* area ids, so an area
     * that disappeared would otherwise keep its triggers — and keep syncing the
     * player to room ids that no longer exist. Tags are exact, so nothing else
     * would ever clear them.
     */
    function pruneMissingAreas() {
        const reader = client.Map.tryGetMapReader();
        for (const areaId of [...registered]) {
            if (!reader?.getArea(areaId)) {
                client.Triggers.removeByTag(tagFor(areaId));
                registered.delete(areaId);
            }
        }
    }

    // One entry point for every way map data arrives: the initial load, a whole
    // map pushed from the editor, or a single area synced from it. The
    // subscription fires immediately for the already-loaded areas, so there is
    // no separate "first build" path to keep in step.
    client.Map.onAreasChanged(areaIds => {
        areaIds.forEach(rebuildArea);
        pruneMissingAreas();
    });
}
