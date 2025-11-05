import Client from "../Client";
import { findClosestColor } from "@modules/core/Colors";
import { gmcp } from "../gmcp";
import { getShortDir, longToShort } from "@shared/map";
import { AnsiAwareBuffer } from "../ansi/FormatState";

const SPRING_GREEN = findClosestColor("#00ff7f");
const DIM_GRAY = findClosestColor("#696969");

const VALID_SHORT_DIRS = new Set(Object.values(longToShort));

export default function initInlineCompassRose(client: Client) {
    let exits = new Set<string>();
    let enabled = false;
    let unsubscribeExits: (() => void) | undefined;

    const listener = () => {
        const data = gmcp?.room?.info;
        exits = new Set(parseExits(data));
        showCompassRose();
    };

    client.on("settings", (payload) => {
        const detail = (payload ?? {}) as { inlineCompassRose?: boolean };
        const shouldEnable = !!detail.inlineCompassRose;
        if (shouldEnable) {
            enable();
        } else {
            disable();
        }
    });

    function enable() {
        if (enabled) return;
        enabled = true;
        unsubscribeExits = client.on("gmcp_msg.room.exits", () => listener());
    }

    function disable() {
        if (!enabled) return;
        enabled = false;
        unsubscribeExits?.();
        unsubscribeExits = undefined;
    }

    function parseExits(detail: any): string[] {
        let list: string[] = [];
        if (!detail) return list;
        if (Array.isArray(detail)) {
            list = detail;
        } else if (Array.isArray(detail.exits)) {
            list = detail.exits;
        } else if (detail.exits && typeof detail.exits === "object") {
            list = Object.keys(detail.exits);
        } else if (detail.room && detail.room.exits) {
            const e = detail.room.exits;
            list = Array.isArray(e) ? e : Object.keys(e);
        }
        return list
            .map((e) => getShortDir(e))
            .filter((dir) => VALID_SHORT_DIRS.has(dir));
    }

    function hasExit(short: string): boolean {
        return exits.has(short);
    }

    function printExit(short: string): AnsiAwareBuffer {
        if (!hasExit(short)) {
            return new AnsiAwareBuffer(" ".repeat(short.length));
        }
        const buffer = new AnsiAwareBuffer(short.toUpperCase());
        buffer.color([0, buffer.length], SPRING_GREEN);
        return buffer;
    }

    function buildLine(...parts: Array<string | AnsiAwareBuffer>): AnsiAwareBuffer {
        const line = new AnsiAwareBuffer();
        for (const part of parts) {
            if (typeof part === "string") {
                line.append(part);
            } else {
                line.appendBuffer(part);
            }
        }
        return line;
    }

    function showCompassRose() {
        const lines: AnsiAwareBuffer[] = [
            buildLine("       ", printExit("nw"), "  ", printExit("n"), "  ", printExit("ne"), "    ", printExit("u")),
            buildLine("         ", hasExit("nw") ? "\\" : " ", " ", hasExit("n") ? "|" : " ", " ", hasExit("ne") ? "/" : " ", "      ", hasExit("u") ? "|" : ""),
            buildLine("       ", printExit("w"), hasExit("w") ? "---" : "   "),
            buildLine(hasExit("e") ? "---" : "   ", printExit("e"), "    ", hasExit("d") || hasExit("u") ? "o" : ""),
            buildLine("         ", hasExit("sw") ? "/" : " ", " ", hasExit("s") ? "|" : " ", " ", hasExit("se") ? "\\" : " ", "      ", hasExit("d") ? "|" : ""),
            buildLine("       ", printExit("sw"), "  ", printExit("s"), "  ", printExit("se"), "    ", printExit("d")),
        ];

        // Add colored "X" in the center line
        const centerX = new AnsiAwareBuffer("X");
        centerX.color([0, 1], DIM_GRAY);
        lines[2].appendBuffer(centerX);
        lines[2].appendBuffer(lines[3]);

        const output = new AnsiAwareBuffer();
        for (let i = 0; i < lines.length; i++) {
            if (i === 3) continue; // Skip line 3 as it was merged into line 2
            const line = lines[i];
            if (line.text.trim().length > 0) {
                if (output.length > 0) {
                    output.append("\n");
                }
                output.appendBuffer(line);
            }
        }

        client.println(output);
    }
}
