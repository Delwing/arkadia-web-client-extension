import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";
import {AnsiAwareBuffer} from "../ansi/FormatState";

const YELLOW = createColorFormat("#ffff00");

const LOST_TIMEOUT_MS = 120_000;

interface LostEntry {
    roomId: number;
    timer: ReturnType<typeof setTimeout>;
    candidateIds: Set<number>;
}

function parseLostNames(list: string): string[] {
    return list
        .split(/,\s*| i /)
        .map(s => s.trim())
        .filter(Boolean);
}

export default function initLostTeamMates(client: Client) {
    const tag = "lostTeamMates";

    let currentRoomId: number | null = null;
    let previousRoomId: number | null = null;
    const lostMembers = new Map<string, LostEntry>();
    let visibleNums = new Set<number>();

    const emitLostRooms = () => {
        const ids = Array.from(new Set(Array.from(lostMembers.values()).map(e => e.roomId)));
        client.sendEvent("mapLostRooms", ids);
    };

    const clearLost = (name: string) => {
        const entry = lostMembers.get(name);
        if (!entry) return;
        clearTimeout(entry.timer);
        lostMembers.delete(name);
        emitLostRooms();
    };

    const markLost = (name: string, roomId: number, candidateIds: Set<number>) => {
        const existing = lostMembers.get(name);
        if (existing) {
            clearTimeout(existing.timer);
        }
        const timer = setTimeout(() => clearLost(name), LOST_TIMEOUT_MS);
        lostMembers.set(name, {roomId, timer, candidateIds});
        emitLostRooms();
    };

    const missingTeamIds = (): Set<number> => {
        const missing = new Set<number>();
        const data = client.TeamManager?.getAccumulatedObjectsData?.();
        if (!data) return missing;
        for (const [id, obj] of data.entries()) {
            if (obj?.team && !visibleNums.has(id)) {
                missing.add(id);
            }
        }
        return missing;
    };

    currentRoomId = client.Map.currentRoom?.id ?? null;

    client.on("enterLocation", payload => {
        const id = (payload as { id?: number })?.id;
        if (typeof id !== "number") return;
        if (currentRoomId !== id) {
            previousRoomId = currentRoomId;
            currentRoomId = id;
        }
        for (const name of Array.from(lostMembers.keys())) {
            if (lostMembers.get(name)!.roomId === id) {
                clearLost(name);
            }
        }
    });

    client.on("gmcp.objects.nums", detail => {
        const nums = Array.isArray(detail) ? detail : (detail as { nums?: unknown })?.nums;
        if (!Array.isArray(nums)) return;
        visibleNums = new Set(nums.map(Number));
        for (const [name, entry] of Array.from(lostMembers.entries())) {
            if (entry.candidateIds.size === 0) continue;
            for (const id of entry.candidateIds) {
                if (visibleNums.has(id)) {
                    clearLost(name);
                    break;
                }
            }
        }
    });

    client.on("requestMapLostRooms", () => emitLostRooms());

    client.Triggers.registerTrigger(/^Gubisz gdzies za soba (.+)\.$/, (line, matches) => {
        const result = new AnsiAwareBuffer();
        result.append("\n");
        result.append("==> ", YELLOW);
        result.appendBuffer(line.color([0, line.length], YELLOW));
        result.append("\n\n");

        if (matches && previousRoomId != null) {
            const names = parseLostNames(matches[1]);
            const candidates = missingTeamIds();
            for (const name of names) {
                markLost(name, previousRoomId, new Set(candidates));
            }
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
                if (!stayed && currentRoomId != null && client.TeamManager?.isInTeam?.(name)) {
                    const id = client.TeamManager.getTeamMemberObjectId(name);
                    const candidates = id !== undefined ? new Set([id]) : new Set<number>();
                    markLost(name, currentRoomId, candidates);
                }
            }
            return line;
        },
        tag,
    );

    client.Triggers.registerTrigger(
        /^([A-Z][a-z]+) odzyskuje kontakt z rzeczywistoscia\.$/,
        (line, matches) => {
            if (matches) {
                clearLost(matches[1]);
            }
            return line;
        },
        tag,
    );
}
