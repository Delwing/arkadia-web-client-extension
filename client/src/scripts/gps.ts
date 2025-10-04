import Client from "../Client";


interface GpsEntry {
    gps_string_lines: string[];
    line_delta?: number;
    area_name?: string;
    room_id: number;
    within_room_ids?: number[];
}

export default function initGps(client: Client) {

    function register(mapData: MapData.Map) {
        mapData.forEach(area => {
            area.rooms.forEach(room => {
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
                    const lines = entry.gps_string_lines;
                    if (!lines || lines.length === 0) {
                        return;
                    }
                    const delta = entry.line_delta ? Number(entry.line_delta) - 1 : lines.length - 1;
                    const gpsId = `${room.id}_${idx}`;
                    let current = 1;
                    const checkContext = () => {
                        if (entry.area_name && client.Map.getAreaName(client.Map.currentRoom?.areaId) !== entry.area_name) {
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
                                    client.sendEvent('notify', { text: `Map Sync: gps ${gpsId}` });
                                }
                            } else {
                                current = 0;
                            }
                            return undefined;
                        },
                        "gps",
                        { stayOpenLines: delta }
                    );
                    if (lines.length > 1) {
                        parent.registerChild((_, line) => {
                            if (!checkContext()) {
                                return undefined;
                            }
                            if (line === lines[current]) {
                                current++;
                                if (current === lines.length) {
                                    if (client.Map.currentRoom?.id !== room.id) {
                                        client.Map.setMapRoomById(room.id);
                                        client.sendEvent('notify', { text: `Map Sync: gps ${gpsId}` });
                                    }
                                    current = 1;
                                }
                                return [line];
                            }
                            return undefined;
                        });
                    }
                });
            });
        });
    }

    client.Map.onReady(({ mapData }) => {
        register(mapData);
    });
}
