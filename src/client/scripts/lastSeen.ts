import Client from "../Client";
import { colorString, createColorFormat } from "@modules/core/Colors";
import { AnsiAwareBuffer, FormatStateSnapshot } from "@client/ansi/FormatState.ts";
import { subscribeMerged, refresh as refreshPeopleStore } from "@modules/data/peopleLoader";
import type { PersonListEntry } from "@client/types/people";

const TRIGGER_TAG = "last-seen-hp";
const TIME_TO_FORGET_MS = 15 * 60 * 1000;

const RED = createColorFormat("#ff5555");
const GREEN = createColorFormat("#55ff55");
const HEADER = createColorFormat("#7cfc00");
const BAR_DANGER = createColorFormat("#ff6347"); // tomato
const BAR_WARNING = createColorFormat("#ffff00"); // yellow
const BAR_SUCCESS = createColorFormat("#00ff7f"); // springgreen
const RESET: FormatStateSnapshot = {};

const BAR_WIDTH = 7;

interface SeenEntry {
    hp: number;
    time: number;
}

export default function initLastSeen(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const list = aliases ?? client.aliases;
    const seen: Map<string, SeenEntry> = new Map();
    const idCache: Map<number, { desc?: string; hp?: number }> = new Map();
    let people: PersonListEntry[] = [];

    subscribeMerged(snapshot => {
        people = snapshot ?? [];
    });
    refreshPeopleStore().catch(() => undefined);

    client.on("gmcp.objects.data", (data: any) => {
        if (!data || typeof data !== "object") return;
        const now = Date.now();
        Object.keys(data).forEach(numStr => {
            const num = Number(numStr);
            const obj = data[numStr];
            if (!obj || typeof obj !== "object") return;
            const cache = idCache.get(num) ?? {};
            if (typeof obj.desc === "string") cache.desc = obj.desc;
            if (typeof obj.hp === "number") cache.hp = obj.hp;
            idCache.set(num, cache);
            if (cache.desc && typeof cache.hp === "number") {
                seen.set(cache.desc, { hp: cache.hp, time: now });
            }
        });
    });

    client.on("gmcp.objects.nums", (nums: number[]) => {
        if (!Array.isArray(nums)) return;
        const allowed = new Set(nums.map(n => Number(n)));
        for (const id of Array.from(idCache.keys())) {
            if (!allowed.has(id)) idCache.delete(id);
        }
    });

    client.Triggers.registerTrigger(/^(.+) umarla?\.$/, (line, matches) => {
        const desc = matches[1].trim().toLowerCase();
        for (const key of Array.from(seen.keys())) {
            if (key.toLowerCase() === desc) seen.delete(key);
        }
        return line;
    }, TRIGGER_TAG);

    function pruneOld() {
        const cutoff = Date.now() - TIME_TO_FORGET_MS;
        for (const [key, entry] of Array.from(seen.entries())) {
            if (entry.time < cutoff) seen.delete(key);
        }
    }

    function isEnemy(desc: string): boolean {
        const lower = desc.toLowerCase();
        return people.some(p => {
            if (!p.isEnemy) return false;
            return p.description.toLowerCase() === lower || p.name.toLowerCase() === lower;
        });
    }

    function isTeamMember(desc: string): boolean {
        const lower = desc.toLowerCase();
        return client.TeamManager.getTeamMembers().some(name => name.toLowerCase() === lower);
    }

    function colorForDesc(desc: string): FormatStateSnapshot | null {
        if (isEnemy(desc)) return RED;
        if (isTeamMember(desc)) return GREEN;
        return null;
    }

    function findPeopleByDescription(desc: string): PersonListEntry[] {
        const lower = desc.toLowerCase();
        return people.filter(p => p.description.toLowerCase() === lower);
    }

    function prettySeconds(ms: number): string {
        const totalSeconds = Math.floor(ms / 1000);
        if (totalSeconds < 60) return `${totalSeconds}s`;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}m ${seconds}s`;
    }

    function buildHpBar(hp: number): AnsiAwareBuffer {
        // Match ObjectList.ts: clamp 0..6, +1 → 1..7 filled segments, total width 7.
        const filled = Math.max(0, Math.min(BAR_WIDTH - 1, Math.floor(hp))) + 1;
        const empty = BAR_WIDTH - filled;
        let color = BAR_SUCCESS;
        if (filled <= 3) color = BAR_DANGER;
        else if (filled <= 5) color = BAR_WARNING;
        const bar = new AnsiAwareBuffer();
        bar.append("[", RESET);
        bar.appendBuffer(colorString("#".repeat(filled) + "-".repeat(empty), color));
        bar.append("]", RESET);
        return bar;
    }

    function pruneByQuery(query: string) {
        const desc = query.trim().toLowerCase();
        if (!desc) {
            seen.clear();
            return;
        }
        for (const key of Array.from(seen.keys())) {
            if (key.toLowerCase().includes(desc)) seen.delete(key);
        }
    }

    function selectEntries(query: string): Map<string, SeenEntry> | null {
        const trimmed = query.trim();
        if (trimmed === "") {
            client.println("Czyja kondycje chcesz poznac? wroga|imiona|<kogo>|wszystkich|-");
            return null;
        }
        const result: Map<string, SeenEntry> = new Map();
        if (trimmed === "wroga" || trimmed === "przeciwnika") {
            for (const [key, entry] of seen) {
                if (isEnemy(key)) result.set(key, entry);
            }
        } else if (trimmed === "imiona") {
            for (const [key, entry] of seen) {
                if (!key.includes(" ")) result.set(key, entry);
            }
        } else if (trimmed === "wszystkich") {
            for (const [key, entry] of seen) result.set(key, entry);
        } else {
            const lower = trimmed.toLowerCase();
            for (const [key, entry] of seen) {
                if (key.toLowerCase().includes(lower)) result.set(key, entry);
            }
        }
        return result;
    }

    function printReport(entries: Map<string, SeenEntry>, query: string) {
        if (entries.size === 0) {
            client.println(`Nie znaleziono kondycji ${query}`.trimEnd());
            return;
        }
        const sorted = Array.from(entries.entries())
            .map(([desc, value]) => ({ desc, hp: value.hp, time: value.time }))
            .sort((a, b) => b.time - a.time);

        const output = new AnsiAwareBuffer();
        output.appendBuffer(colorString("Ostatnio widziane kondycje:", HEADER));
        const now = Date.now();

        for (const entry of sorted) {
            output.append("\n", RESET);
            output.appendBuffer(buildHpBar(entry.hp));
            output.append(" ", RESET);

            const descColor = colorForDesc(entry.desc);
            if (descColor) {
                output.appendBuffer(colorString(entry.desc, descColor));
            } else {
                output.append(entry.desc, RESET);
            }

            if (entry.desc.includes(" ")) {
                const matches = findPeopleByDescription(entry.desc);
                for (const person of matches) {
                    output.append(" (", RESET);
                    const nameColor = colorForDesc(person.name);
                    if (nameColor) {
                        output.appendBuffer(colorString(person.name, nameColor));
                    } else {
                        output.append(person.name, RESET);
                    }
                    if (person.guild && person.guild !== "NPC") {
                        output.append(" " + person.guild, RESET);
                    }
                    output.append(")", RESET);
                }
            }

            output.append(" " + prettySeconds(now - entry.time), RESET);
        }
        client.println(output);
    }

    list.push({
        pattern: /^\/hp(?:\s+(.*))?$/,
        callback: (matches: RegExpMatchArray) => {
            pruneOld();
            const arg = (matches[1] ?? "").trim();
            if (arg.startsWith("-")) {
                pruneByQuery(arg.substring(1));
                return;
            }
            const entries = selectEntries(arg);
            if (entries) printReport(entries, arg);
        },
    });
}
