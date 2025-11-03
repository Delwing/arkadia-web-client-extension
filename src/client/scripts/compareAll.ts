import Client from "../Client";
import {SKIP_LINE} from "../ControlConstants";

export interface ComparisonStats {
    sil?: number;
    zre?: number;
    wyt?: number;
}

const level: Record<string, number> = {
    "rownie dobrze zbudowan": 0,
    "niewiele lepiej zbudowan": 1,
    "troche lepiej zbudowan": 2,
    "lepiej zbudowan": 3,
    "znacznie lepiej zbudowan": 4,
    "duzo lepiej zbudowan": 5,
    "rownie siln": 0,
    "niewiele silniejsz": 1,
    "troche silniejsz": 2,
    "silniejsz": 3,
    "znacznie silniejsz": 4,
    "duzo silniejsz": 5,
    "rownie zreczn": 0,
    "niewiele zreczniejsz": 1,
    "troche zreczniejsz": 2,
    "zreczniejsz": 3,
    "znacznie zreczniejsz": 4,
    "duzo zreczniejsz": 5,
};

let comparisonResults: Record<string, ComparisonStats> = {};
let queue: { target: string; stat: keyof ComparisonStats }[] = [];
let pending = 0;

function getTargets(client: Client): string[] {
    return client
        .ObjectManager
        .getObjectsOnLocation()
        .filter(o => o.shortcut !== "@")
        .map(o => String(o.num));
}

export function formatComparisonTable(results: Record<string, ComparisonStats>): string {
    const NAME_WIDTH = 30;
    const pad = (str: string, len: number) => str + " ".repeat(Math.max(0, len - str.length));
    const header = [
        pad("#", 3),
        pad("OSOBA", NAME_WIDTH),
        pad("SIL", 4),
        pad("ZRE", 4),
        pad("WYT", 4),
        pad("SUMA", 5)
    ].join(" ");
    const line = [
        pad("--", 3),
        "-".repeat(NAME_WIDTH),
        "----",
        "----",
        "----",
        "-----"
    ].join(" ");
    const lines: string[] = [header, line];
    let i = 1;
    const formatVal = (n: number | undefined) => {
        if (n === undefined) return "0";
        return n > 0 ? `+${n}` : String(n);
    };
    Object.entries(results).forEach(([name, stats]) => {
        const total = (stats.sil || 0) + (stats.zre || 0) + (stats.wyt || 0);
        lines.push(
            [
                pad(String(i), 3),
                pad(name, NAME_WIDTH),
                pad(formatVal(stats.sil), 4),
                pad(formatVal(stats.zre), 4),
                pad(formatVal(stats.wyt), 4),
                pad(formatVal(total), 5)
            ].join(" ")
        );
        i++;
    });
    return lines.join("\n");
}

export function displayComparisonResults(client: Client) {
    if (pending > 0) {
        client.print("Not all comparison data has been received. Please wait or try again.");
        return;
    }
    client.println(formatComparisonTable(comparisonResults));
}

export default function initCompareAll(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const triggerPattern = /^(?:Wydaje ci sie|Masz wrazenie), ze jest(?<mod>es)? (?<desc>.*?)[aey] (?:jak|niz) (?<osoba>.*)\.$/;

    client.Triggers.registerTrigger(triggerPattern, (_raw, _line, m) => {
        if (!queue.length) return undefined;
        const item = queue.shift()!;
        const osoba = m.groups?.osoba?.trim() || item.target;
        const desc = m.groups?.desc?.trim() || "";
        let val = level[desc] ?? 0;
        if (m.groups?.mod) {
            val = -val;
        }
        if (!comparisonResults[osoba]) {
            comparisonResults[osoba] = {};
        }
        comparisonResults[osoba][item.stat] = val;
        pending--;
        return SKIP_LINE;
    }, "compare-all");

    function send(statWord: string, stat: keyof ComparisonStats, id: string) {
        queue.push({ target: id, stat });
        client.sendCommand(`porownaj ${statWord} z ob_${id}`, false);
    }

    function findByShortcut(short: string): string | undefined {
        const lower = short.toLowerCase();
        const obj = client
            .ObjectManager
            .getObjectsOnLocation()
            .find(o => o.shortcut?.toLowerCase() === lower);
        return obj ? String(obj.num) : undefined;
    }

    function run(short?: string) {
        comparisonResults = {};
        queue = [];
        const id = short ? findByShortcut(short) : undefined;
        const targets = short ? (id ? [id] : []) : getTargets(client);
        pending = targets.length * 3;
        if (pending === 0) {
            client.print("No one else is here to compare with.");
            return;
        }
        targets.forEach(id => {
            send("sile", "sil", id);
            send("zrecznosc", "zre", id);
            send("wytrzymalosc", "wyt", id);
        });
        setTimeout(() => displayComparisonResults(client), 500);
    }

    if (aliases) {
        aliases.push({
            pattern: /^\/por(?: ([A-Za-z0-9]+))?$/,
            callback: (m: RegExpMatchArray) => run(m[1])
        });
    }
}

