import Client from "../Client";
import { colorString, findClosestColor } from "../Colors";
import { stripAnsiCodes } from "../Triggers";

const STATES = [
    "minimalne",
    "nieznaczne",
    "bardzo male",
    "male",
    "nieduze",
    "zadowalajace",
    "spore",
    "dosc duze",
    "znaczne",
    "duze",
    "bardzo duze",
    "ogromne",
    "imponujace",
    "wspaniale",
    "gigantyczne",
    "niebotyczne",
];

function formatDate(date: Date): string {
    const d = String(date.getDate()).padStart(2, "0");
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const h = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    const s = String(date.getSeconds()).padStart(2, "0");
    return `${d}/${m} ${h}:${mi}:${s}`;
}

function formatDuration(ms: number): string {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function visibleLength(str: string): number {
    return stripAnsiCodes(str).length;
}

function createPad(width: number, left: number, right: number) {
    const contentWidth = width - left - right;
    return (content = "") =>
        `|${" ".repeat(left)}${content}${" ".repeat(
            Math.max(0, contentWidth - visibleLength(content))
        )}${" ".repeat(right)}|`;
}

function createHeader(width: number, offset: number, color: number) {
    return (title: string) => {
        const colored = colorString(title, color);
        const dashes = width - visibleLength(title) - offset;
        const left = Math.floor(dashes / 2);
        const right = dashes - left;
        return `+${"-".repeat(left)} ${colored} ${"-".repeat(right)}+`;
    };
}

type Entry = {
    state: string;
    time: number;
    delta: number;
    killsMy: number;
    killsTeam: number;
};

export default class ImproveCounter {
    private client: Client;
    private killCounter: any;
    private entries: Entry[] = [];
    private lastTime: number = 0;
    private lastKills = { my: 0, team: 0 };

    constructor(client: Client, killCounter: any) {
        this.client = client;
        this.killCounter = killCounter;

        this.client.addEventListener("gmcp.char.info", () => this.reset());

        const states = STATES.join("|");
        const regex = new RegExp(`^(?:.*? )?(?<state>${states}) postepy`, "i");
        this.client.Triggers.registerTrigger(
            regex,
            (_raw, _line, matches) => {
                const state = (matches.groups?.state || "").toLowerCase();
                this.record(state);
                return undefined;
            },
            "improveCounter"
        );
    }

    private getKills() {
        if (this.killCounter && typeof this.killCounter.getSessionTotals === "function") {
            return this.killCounter.getSessionTotals();
        }
        return { my: 0, team: 0 };
    }

    reset() {
        this.entries = [];
        this.lastTime = Date.now();
        this.lastKills = this.getKills();
    }

    private record(state: string) {
        const now = Date.now();
        const kills = this.getKills();
        const entry: Entry = {
            state,
            time: now,
            delta: now - this.lastTime,
            killsMy: kills.my - this.lastKills.my,
            killsTeam: kills.team - this.lastKills.team,
        };
        this.entries.push(entry);
        this.lastTime = now;
        this.lastKills = kills;
    }

    private formatTable(): string {
        const WIDTH = 74;
        const INNER = WIDTH - 2;
        const pad = createPad(INNER, 1, 1);
        const header = createHeader(WIDTH, 2, findClosestColor("#87cefa"));

        const now = new Date();
        const avg = this.entries.length
            ? this.entries.reduce((s, e) => s + e.delta, 0) / this.entries.length
            : 0;
        const lines: string[] = [];
        lines.push(header("Postepy"));
        lines.push(pad());
        lines.push(
            pad(
                `Aktualny czas   : ${formatDate(now)}    : sred ${formatDuration(avg)}       Dzisiaj: ${this.entries.length}`
            )
        );
        lines.push(pad());
        this.entries.forEach((e, idx) => {
            lines.push(
                pad(
                    `${(idx + 1).toString().padStart(2, " ")}. ${e.state.padEnd(15)} : ${formatDate(
                        new Date(e.time)
                    )}    : czas ${formatDuration(e.delta)}    :  zabici ${e.killsMy}/${
                        e.killsMy + e.killsTeam
                    }`
                )
            );
        });
        lines.push(pad());
        lines.push(pad("ZABITYCH"));
        const totals = this.getKills();
        lines.push(pad(`JA ... : ${totals.my}`));
        lines.push(pad(`WSZYSCY: ${totals.my + totals.team}`));
        lines.push(pad());
        const since = Date.now() - this.lastTime;
        const myDelta = totals.my - this.lastKills.my;
        const teamDelta = totals.team - this.lastKills.team;
        lines.push(
            pad(
                `Od ostatniego postepu: ${formatDuration(since)} : zabici: ${myDelta}/${
                    myDelta + teamDelta
                }`
            )
        );
        lines.push(pad());
        lines.push(`+${"-".repeat(INNER)}+`);
        return lines.join("\n");
    }

    show() {
        this.client.print("\n" + this.formatTable() + "\n");
    }
}

export function initImproveCounter(
    client: Client,
    killCounter: any,
    aliases?: { pattern: RegExp; callback: Function }[]
): ImproveCounter {
    const counter = new ImproveCounter(client, killCounter);
    if (aliases) {
        aliases.push({ pattern: /\/postepy$/, callback: () => counter.show() });
    }
    return counter;
}
