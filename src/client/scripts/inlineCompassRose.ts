import Client from "../Client";
import { color, findClosestColor } from "@modules/core/Colors";
import { gmcp } from "../gmcp";
import { getShortDir, longToShort } from "@shared/map";

const SPRING_GREEN = findClosestColor("#00ff7f");
const DIM_GRAY = findClosestColor("#696969");
const RESET = "\x1B[0m";

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

    function printExit(short: string): string {
        if (!hasExit(short)) return " ".repeat(short.length);
        return color(SPRING_GREEN) + short.toUpperCase() + RESET;
    }

    function showCompassRose() {
        client.println(
            [
                `       ${printExit("nw")}  ${printExit("n")}  ${printExit("ne")}    ${printExit("u")}`,
                `         ${hasExit("nw") ? "\\" : " "} ${hasExit("n") ? "|" : " "} ${hasExit("ne") ? "/" : " "}      ${hasExit("u") ? "|" : ""}`,
                `       ${printExit("w")}${hasExit("w") ? "---" : "   "}${color(DIM_GRAY)}X${RESET}${hasExit("e") ? "---" : "   "}${printExit("e")}    ${hasExit("d") || hasExit("u") ? "o" : ""}`,
                `         ${hasExit("sw") ? "/" : " "} ${hasExit("s") ? "|" : " "} ${hasExit("se") ? "\\" : " "}      ${hasExit("d") ? "|" : ""}`,
                `       ${printExit("sw")}  ${printExit("s")}  ${printExit("se")}    ${printExit("d")}`,
            ].filter(item => item.trim().length != 0).join("\n")
        );
    }
}
