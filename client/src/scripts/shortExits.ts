import Client from "../Client";
import { colorString, findClosestColor } from "../Colors";

export const ORANGE = findClosestColor('#ffa500');

const shortToLong: Record<string, string> = {
    n: "north",
    s: "south",
    e: "east",
    w: "west",
    ne: "northeast",
    nw: "northwest",
    se: "southeast",
    sw: "southwest",
    u: "up",
    d: "down",
};

const polishToShort: Record<string, string> = {
    polnoc: "n",
    poludnie: "s",
    wschod: "e",
    zachod: "w",
    "polnocny-wschod": "ne",
    "polnocny-zachod": "nw",
    "poludniowy-wschod": "se",
    "poludniowy-zachod": "sw",
    dol: "d",
    gora: "u",
    gore: "u",
};

export function toShort(exit: string): string {
    if (polishToShort[exit]) return polishToShort[exit];
    if (shortToLong[exit]) return exit;
    const long = exit.toLowerCase();
    const short = Object.entries(shortToLong).find(([_, l]) => l === long);
    if (short) return short[0];
    return exit;
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
    return list.map(toShort);
}

export default function initShortExits(client: Client) {
    client.addEventListener("gmcp_msg.room.exits", (event: CustomEvent) => {
        const exits = parseExits(event.detail).join(" ");
        const str = colorString(exits, ORANGE);
        client.println(str);
    });
}
