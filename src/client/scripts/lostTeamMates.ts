import Client from "../Client";
import {scheduleFromEvent} from "@shared/eventClock";
import {createColorFormat} from "@modules/core/Colors";
import {AnsiAwareBuffer} from "../ansi/FormatState";
import {objectListFilters} from "@modules/core/objectListFilters.ts";

const YELLOW = createColorFormat("#ffff00");

const LOST_TIMEOUT_MS = 120_000;

interface LostEntry {
    roomId: number;
    timer: ReturnType<typeof setTimeout>;
}

export default function initLostTeamMates(client: Client) {
    const tag = "lostTeamMates";

    let currentRoomId: number | null = null;
    let previousRoomId: number | null = null;
    const lostMembers = new Map<number, LostEntry>();
    let visibleNums = new Set<number>();
    // Set by the Gubisz trigger; the next objects.nums consumes it and marks any
    // team members that disappeared in that update as lost in this room.
    let pendingGubiszRoom: number | null = null;
    // Players who lost contact but stayed in the world ("Mimo to, nie opuszcza
    // swiata Arkadii"). Marked with * in the object list until they regain
    // contact or drop out of sight - once gone we can't tell if we missed it.
    const linkdead = new Set<number>();

    const emitLostRooms = () => {
        const ids = Array.from(new Set(Array.from(lostMembers.values()).map(e => e.roomId)));
        client.sendEvent("mapLostRooms", ids);
    };

    const clearLost = (id: number) => {
        const entry = lostMembers.get(id);
        if (!entry) return;
        clearTimeout(entry.timer);
        lostMembers.delete(id);
        emitLostRooms();
    };

    const markLost = (id: number, roomId: number) => {
        const existing = lostMembers.get(id);
        if (existing) {
            clearTimeout(existing.timer);
        }
        const timer = scheduleFromEvent(LOST_TIMEOUT_MS, () => clearLost(id));
        lostMembers.set(id, {roomId, timer});
        emitLostRooms();
    };

    const setLinkdead = (id: number, value: boolean) => {
        if (linkdead.has(id) === value) return;
        if (value) linkdead.add(id); else linkdead.delete(id);
        client.sendEvent("objects.linkdead", Array.from(linkdead));
    };

    const findVisibleObjectId = (name: string): number | undefined => {
        const lowerName = name.toLowerCase();
        const data = client.TeamManager?.getAccumulatedObjectsData?.();
        if (data) {
            for (const id of visibleNums) {
                if (data.get(id)?.desc?.toLowerCase() === lowerName) return id;
            }
        }
        return client.TeamManager?.getTeamMemberObjectId?.(name);
    };

    // register() doesn't replace a same-named filter, it would run twice.
    objectListFilters.unregister(tag);
    objectListFilters.register(tag, (context, result) => {
        if (linkdead.has(context.object.num)) {
            result.style.suffix = `${result.style.suffix ?? ""}<span class="object-linkdead" style="color:#ffff00" title="Stracił kontakt z rzeczywistością">*</span>`;
        }
    });

    currentRoomId = client.Map.currentRoom?.id ?? null;

    client.on("enterLocation", payload => {
        const id = (payload as { id?: number })?.id;
        if (typeof id !== "number") return;
        if (currentRoomId !== id) {
            previousRoomId = currentRoomId;
            currentRoomId = id;
        }
    });

    client.on("gmcp.objects.nums", detail => {
        const nums = Array.isArray(detail) ? detail : (detail as { nums?: unknown })?.nums;
        if (!Array.isArray(nums)) return;
        const previousVisible = visibleNums;
        const newVisible = new Set(nums.map(Number));

        if (pendingGubiszRoom != null) {
            const data = client.TeamManager?.getAccumulatedObjectsData?.();
            const lostRoomId = pendingGubiszRoom;
            pendingGubiszRoom = null;
            if (data) {
                for (const id of previousVisible) {
                    if (!newVisible.has(id) && data.get(id)?.team) {
                        markLost(id, lostRoomId);
                    }
                }
            }
        }

        visibleNums = newVisible;

        for (const id of Array.from(linkdead)) {
            if (!visibleNums.has(id)) setLinkdead(id, false);
        }

        for (const id of Array.from(lostMembers.keys())) {
            if (visibleNums.has(id)) clearLost(id);
        }
    });

    client.on("requestMapLostRooms", () => emitLostRooms());

    client.Triggers.registerTrigger(/^Gubisz gdzies za soba .+\.$/, line => {
        const result = new AnsiAwareBuffer();
        result.append("\n");
        result.append("==> ", YELLOW);
        result.appendBuffer(line.color([0, line.length], YELLOW));
        result.append("\n\n");
        if (previousRoomId != null) {
            pendingGubiszRoom = previousRoomId;
        }
        return result;
    }, tag);

    client.Triggers.registerTrigger(
        /^([A-Z][a-z]+) traci kontakt z rzeczywistoscia\.(?:\s+Mimo to, nie opuszcza swiata Arkadii\.)?$/,
        (line, matches) => {
            line.color([0, line.length], YELLOW);
            if (matches) {
                const name = matches[1];
                const stayed = /Mimo to/.test(matches[0]);
                if (stayed) {
                    const id = findVisibleObjectId(name);
                    if (id !== undefined) setLinkdead(id, true);
                }
                if (!stayed && currentRoomId != null && client.TeamManager?.isInTeam?.(name)) {
                    const id = client.TeamManager.getTeamMemberObjectId(name);
                    if (id !== undefined) markLost(id, currentRoomId);
                }
            }
            return line;
        },
        tag,
    );

    client.Triggers.registerTrigger(
        /^([A-Z][a-z]+) (?:odzyskuje|odnawia) kontakt z rzeczywistoscia\.$/,
        (line, matches) => {
            if (matches) {
                const id = client.TeamManager?.getTeamMemberObjectId?.(matches[1]);
                if (id !== undefined) clearLost(id);
                const visibleId = findVisibleObjectId(matches[1]);
                if (visibleId !== undefined) setLinkdead(visibleId, false);
            }
            return line;
        },
        tag,
    );
}
