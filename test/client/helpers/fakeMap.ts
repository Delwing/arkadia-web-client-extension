/**
 * Stand-in for the slice of MapHelper the passage linker drives.
 *
 * applyRoomChanges mirrors the real contract exactly where it matters here: exits and
 * specialExits are replaced wholesale, userData is merged and a null value removes the
 * key. `refreshedAreas` records what the view would have been told to redraw.
 */
export class FakeMap {
    rooms: Record<number, any> = {};
    currentRoom: any = undefined;
    refreshedAreas: number[][] = [];
    silentRenders: number[] = [];

    constructor(rooms: Record<number, any>) {
        this.rooms = rooms;
    }

    tryGetMapReader = () => ({rooms: this.rooms, areas: {}});

    renderRoomByIdSilently = (id: number) => {
        this.silentRenders.push(id);
    };

    applyRoomChanges = (changes: any[], options?: { rerender?: boolean }) => {
        const affected = new Set<number>();
        let changed = 0;
        for (const change of changes) {
            const room = this.rooms[change.roomId];
            if (!room) continue;
            if (change.exits) room.exits = {...change.exits};
            if (change.specialExits) room.specialExits = {...change.specialExits};
            if (change.userData) {
                room.userData ||= {};
                for (const [key, value] of Object.entries(change.userData)) {
                    if (value === null) delete room.userData[key];
                    else room.userData[key] = value;
                }
            }
            changed++;
            affected.add(room.area);
        }
        if (changed > 0) {
            this.refreshedAreas.push([...affected]);
            if (options?.rerender !== false && this.currentRoom) {
                this.silentRenders.push(this.currentRoom.id);
            }
        }
        return changed;
    };

    enter(id: number) {
        this.currentRoom = this.rooms[id];
    }
}

export function buildRooms(ids: number[], area = 1): Record<number, any> {
    const rooms: Record<number, any> = {};
    for (const id of ids) {
        rooms[id] = {id, area, exits: {}, specialExits: {}, userData: {}};
    }
    return rooms;
}
