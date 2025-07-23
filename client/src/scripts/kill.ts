import Client from "../Client";
import { colorString, findClosestColor } from "../Colors";
import { stripAnsiCodes } from "../Triggers";

type KillEntry = {
    mySession: number;
    myTotal: number;
    teamSession: number;
};

type KillCounts = Record<string, KillEntry>;

const STORAGE_KEY = "kill_counter";

const KILL_HEADER_COLOR = findClosestColor("#7cfc00");
const KILL_MY_COLOR = findClosestColor("#ffff00");
const KILL_TOTAL_COLOR = findClosestColor("#778899");
const KILL_UPPER_COLOR = findClosestColor("#ffa500");
const KILL_LOWER_COLOR = findClosestColor("#7cfc00");
const KILL_PINK_COLOR = findClosestColor("#ffc0cb");
const KILL_PREFIX_COLOR = findClosestColor("#ff6347");

const twoWordNames = [
    "czarnego orka",
    "dzikiego orka",
    "elfiego egzekutora",
    "kamiennego trolla",
    "konia bojowego",
    "krasnoluda chaosu",
    "lodowego trolla",
    "pajaka sieciarza",
    "pomiot chaosu",
    "rumaka bojowego",
    "rycerza chaosu",
    "smoczego ogra",
    "smoka chaosu",
    "straznika wiezy",
    "szkielet goblina",
    "szkielet krasnoluda",
    "szkielet orka",
    "tancerza wojny",
    "trolla gorskiego",
    "trolla jaskiniowego",
    "zjawe kobiety",
    "zjawe straznika",
    "zywiolaka ognia",
    "zywiolaka powietrza",
    "zywiolaka wody",
    "zywiolaka ziemi",
];

const width = 50

function parseName(full: string): string {
    const originalWords = full.trim().split(/\s+/);
    const words = originalWords.map((w) => w.toLowerCase());
    if (
        words.length === 1 &&
        /^[A-Z]/.test(
            originalWords[0]
        )
    ) {
        return originalWords[0];
    }
    const lastTwo = words.slice(-2).join(" ");
    if (twoWordNames.includes(lastTwo)) {
        return lastTwo;
    }
    return words[words.length - 1];
}

function visibleLength(str: string): number {
    return stripAnsiCodes(str).length;
}

function createPad(
    width: number,
    left: number,
    right: number
): (content?: string) => string {
    const contentWidth = width - left - right;
    return (content = "") =>
        `|${" ".repeat(left)}${content}${" ".repeat(
            Math.max(0, contentWidth - visibleLength(content))
        )}${" ".repeat(right)}|`;
}

function createHeader(
    width: number,
    offset: number,
    color: number
): (title: string) => string {
    return (title: string) => {
        const colored = colorString(title, color);
        const dashes = width - visibleLength(title) - offset;
        const left = Math.floor(dashes / 2);
        const right = dashes - left;
        return `+${"-".repeat(left)} ${colored} ${"-".repeat(right)}+`;
    };
}

function formatSessionTable(counts: KillCounts): string {
    const WIDTH = width - 2;
    const LEFT_PADDING = 2;
    const RIGHT_PADDING = 5;
    const CONTENT_WIDTH = WIDTH - LEFT_PADDING - RIGHT_PADDING;

    const HEADER_COLOR = KILL_HEADER_COLOR;
    const MY_COLOR = KILL_MY_COLOR;
    const TOTAL_COLOR = KILL_TOTAL_COLOR;

    const pad = createPad(WIDTH, LEFT_PADDING, RIGHT_PADDING);
    const header = createHeader(WIDTH, 2, HEADER_COLOR);

    const entries = Object.entries(counts)
        .filter(([_, v]) => v.mySession > 0)
        .sort(([a], [b]) => a.localeCompare(b));

    const totalMy = Object.values(counts).reduce((s, v) => s + v.mySession, 0);
    const totalCombined = totalMy +
        Object.values(counts).reduce((s, v) => s + v.teamSession, 0);

    const mobLine = (name: string, my: number) => {
        const numbers = `${my}`;
        let text = `${name} `;
        const dots = CONTENT_WIDTH - text.length - numbers.length - 1;
        text += ".".repeat(Math.max(0, dots));
        text += ` ${numbers}`;
        return pad(text);
    };

    const summaryLine = (label: string, value: number, color?: number) => {
        const visibleLabel = label;
        if (color !== undefined) {
            label = colorString(label, color);
        }
        let text = `${label} `;
        const num = String(value);
        const dots = CONTENT_WIDTH - visibleLength(visibleLabel + " ") - num.length;
        text += ".".repeat(Math.max(0, dots));
        text += num;
        return pad(text);
    };

    const lines: string[] = [];
    lines.push(header("Licznik zabitych"));
    lines.push(pad());
    lines.push(pad(colorString("JA", MY_COLOR)));
    entries.forEach(([name, { mySession }]) => {
        lines.push(mobLine(name, mySession));
    });
    lines.push(pad());
    lines.push(summaryLine("LACZNIE:", totalMy, TOTAL_COLOR));
    lines.push(pad());
    lines.push(pad());
    lines.push(summaryLine("DRUZYNA LACZNIE:", totalCombined, TOTAL_COLOR));
    lines.push(pad());
    lines.push(`+${"-".repeat(WIDTH)}+`);
    return lines.join("\n");
}

function formatLifetimeTable(counts: KillCounts): string {
    const WIDTH = width;
    const LEFT_PADDING = 2;
    const RIGHT_PADDING = 5;
    const INNER = WIDTH - 2;
    const CONTENT_WIDTH = INNER - LEFT_PADDING - RIGHT_PADDING;

    const HEADER_COLOR = KILL_HEADER_COLOR;
    const UPPER_COLOR = KILL_UPPER_COLOR;
    const LOWER_COLOR = KILL_LOWER_COLOR;
    const PINK_COLOR = KILL_PINK_COLOR;

    const pad = createPad(INNER, LEFT_PADDING, RIGHT_PADDING);
    const header = createHeader(WIDTH, 4, HEADER_COLOR);

    const entries = Object.entries(counts)
        .filter(([_, v]) => v.myTotal > 0)
        .sort(([a], [b]) => {
            const aUpper = /^[A-Z]/.test(a);
            const bUpper = /^[A-Z]/.test(b);
            if (aUpper !== bUpper) {
                return aUpper ? -1 : 1;
            }
            return a.localeCompare(b);
        });

    const total = Object.values(counts).reduce((s, v) => s + v.myTotal, 0);

    const mobLine = (name: string, count: number) => {
        const color = /^[A-Z]/.test(name)
            ? UPPER_COLOR
            : LOWER_COLOR;
        const colored = colorString(name, color);
        const start = `  ${colored} `;
        const dots = CONTENT_WIDTH - visibleLength(start) - String(count).length;
        const text = `${start}${".".repeat(Math.max(0, dots))}${count}`;
        return pad(text);
    };

    const lines: string[] = [];
    lines.push(header("Licznik zabitych"));
    lines.push(pad());
    entries.forEach(([name, entry]) => {
        lines.push(mobLine(name, entry.myTotal));
    });
    lines.push(pad());
    lines.push(pad("    ----------------------------------- "));
    lines.push(pad());
    const summary =
        "  " +
        colorString("WSZYSTKICH DO TEJ PORY: ", PINK_COLOR) +
        colorString(String(total), LOWER_COLOR) +
        colorString(" zabitych", LOWER_COLOR);
    lines.push(pad(summary));
    lines.push(pad());
    lines.push(`+${"-".repeat(INNER)}+`);
    return lines.join("\n");
}

export { parseName, formatSessionTable, formatLifetimeTable };

class KillCounter {
    private client: Client;
    private kills: KillCounts = {};

    constructor(client: Client) {
        this.client = client;

        this.client.addEventListener("storage", (event: CustomEvent) => {
            if (event.detail.key === STORAGE_KEY) {
                this.loadTotals(event.detail.value ?? {});
            }
        });

        window.addEventListener("beforeunload", this.persistTotals);

        const myKillRegex = /^[ >]*(Zabil(?:es|as) (?<name>[A-Za-z ()!,]+))\.$/;
        const teamKillRegex = /^[ >]*(?<player>[a-zA-Z (),!]+) zabil(?:a)? (?<name>[a-zA-Z (),!]+)\.$/;

        this.client.Triggers.registerTrigger(
            myKillRegex,
            (rawLine, _line, matches): string => {
                const mob = parseName(matches.groups?.name ?? "");
                const entry = this.recordKill(mob, true);
                (this.client as any).ItemCollector?.killedAction();
                return this.formatPrefix(rawLine, entry, "[  ZABILES  ] ");
            }
        );

        this.client.Triggers.registerTrigger(
            teamKillRegex,
            (rawLine, _line, matches): string => {
                const player = stripAnsiCodes(matches.groups?.player ?? "").trim();
                const mob = parseName(matches.groups?.name ?? "");
                const entry = this.client.TeamManager.isInTeam(player)
                    ? this.recordKill(mob, false)
                    : null;
                if (entry) {
                    (this.client as any).ItemCollector?.teamKilledAction(mob);
                }
                return this.formatPrefix(rawLine, entry, "[   ZABIL   ] ");
            }
        );

        this.client.port?.postMessage({ type: "GET_STORAGE", key: STORAGE_KEY });
    }

    private loadTotals(totals: Record<string, number> = {}): void {
        Object.entries(totals).forEach(([name, total]) => {
            const entry = this.kills[name] ?? {
                mySession: 0,
                myTotal: 0,
                teamSession: 0,
            };
            entry.myTotal = total as number;
            this.kills[name] = entry;
        });
    }

    private persistTotals = () => {
        const totals: Record<string, number> = {};
        Object.entries(this.kills).forEach(([name, entry]) => {
            totals[name] = entry.myTotal;
        });
        this.client.port?.postMessage({
            type: "SET_STORAGE",
            key: STORAGE_KEY,
            value: totals,
        });
    };

    private ensureEntry(name: string): KillEntry {
        if (!this.kills[name]) {
            this.kills[name] = { mySession: 0, myTotal: 0, teamSession: 0 };
        }
        return this.kills[name];
    }

    private recordKill(mob: string, self: boolean): KillEntry {
        const entry = this.ensureEntry(mob);
        if (self) {
            entry.mySession += 1;
            entry.myTotal += 1;
            this.persistTotals();
        } else {
            entry.teamSession += 1;
        }
        return entry;
    }

    private formatPrefix(line: string, entry: KillEntry | null, label: string) {
        const color = KILL_PREFIX_COLOR;
        const counts = entry
            ? colorString(
                  ` (${entry.mySession} / ${entry.mySession + entry.teamSession})`,
                  color
              )
            : "";
        const modified = line + counts;
        return (
            "  \n" +
            this.client.prefix(modified, colorString(label, color)) +
            "\n  "
        );
    }

    showSession() {
        this.client.print("\n" + formatSessionTable(this.kills) + "\n");
    }

    showLifetime() {
        this.client.print("\n" + formatLifetimeTable(this.kills) + "\n");
    }
}

export function initKillCounter(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
): KillCounter {
    const counter = new KillCounter(client);
    if (aliases) {
        aliases.push({ pattern: /\/zabici$/, callback: () => counter.showSession() });
        aliases.push({ pattern: /\/zabici2$/, callback: () => counter.showLifetime() });
    }
    return counter;
}

export default KillCounter;
