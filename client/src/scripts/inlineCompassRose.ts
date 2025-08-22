import Client from "../Client";
import { color, findClosestColor } from "../Colors";
import { gmcp } from "../gmcp";
import { getShortDir, longToShort } from "../utils/directions";

const SPRING_GREEN = findClosestColor("#00ff7f");
const DIM_GRAY = findClosestColor("#696969");
const RESET = "\x1B[0m";

const VALID_SHORT_DIRS = new Set(Object.values(longToShort));

export default class InlineCompassRose {
    private client: Client;
    private exits = new Set<string>();
    private enabled = false;
    private listener = () => {
        const data = gmcp?.room?.info;
        this.exits = new Set(this.parseExits(data));
        this.showCompassRose();
    };

    constructor(client: Client) {
        this.client = client;
        this.client.addEventListener("settings", (event: CustomEvent) => {
            const enabled = !!event.detail.inlineCompassRose;
            if (enabled) {
                this.enable();
            } else {
                this.disable();
            }
        });
    }

    enable() {
        if (this.enabled) return;
        this.enabled = true;
        this.client.addEventListener("gmcp_msg.room.exits", this.listener);
    }

    disable() {
        if (!this.enabled) return;
        this.enabled = false;
        this.client.removeEventListener("gmcp_msg.room.exits", this.listener);
    }

    private parseExits(detail: any): string[] {
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

    private hasExit(short: string): boolean {
        return this.exits.has(short);
    }

    private printExit(short: string): string {
        if (!this.hasExit(short)) return " ".repeat(short.length);
        return color(SPRING_GREEN) + short.toUpperCase() + RESET;
    }

    private showCompassRose() {
        this.client.println(
            [
                `       ${this.printExit("nw")}  ${this.printExit("n")}  ${this.printExit("ne")}    ${this.printExit("u")}`,
                `         ${this.hasExit("nw") ? "\\" : " "} ${this.hasExit("n") ? "|" : " "} ${this.hasExit("ne") ? "/" : " "}      ${this.hasExit("u") ? "|" : ""}`,
                `       ${this.printExit("w")}${this.hasExit("w") ? "---" : "   "}${color(DIM_GRAY)}X${RESET}${this.hasExit("e") ? "---" : "   "}${this.printExit("e")}    ${this.hasExit("d") || this.hasExit("u") ? "o" : ""}`,
                `         ${this.hasExit("sw") ? "/" : " "} ${this.hasExit("s") ? "|" : " "} ${this.hasExit("se") ? "\\" : " "}      ${this.hasExit("d") ? "|" : ""}`,
                `       ${this.printExit("sw")}  ${this.printExit("s")}  ${this.printExit("se")}    ${this.printExit("d")}`,
            ].filter(item => item.trim().length != 0).join("\n")
        );
    }
}
