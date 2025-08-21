import Client from "../Client";
import { colorString, findClosestColor, RESET } from "../Colors";
import { stripAnsiCodes } from "../Triggers";
import { getCurrentCharacter } from "../storage";

const HEADER_COLOR = findClosestColor("#90ee90");
const SECTION_COLOR = findClosestColor("#ffa500");
const LABEL_COLOR = HEADER_COLOR;
const COUNT_COLOR = SECTION_COLOR;
const POSTEP_COLOR = findClosestColor("#6a5acd");
const TIME_COLOR = findClosestColor("#ffff00");
const NAME_COLOR = findClosestColor("#ffff00");
const DATE_COLOR = findClosestColor("#ffd700");
const TOTAL_LABEL_COLOR = findClosestColor("#ffb6c1");

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

function titleCase(str: string): string {
    return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCount(count: number): string {
    if (count <= 0) return String(count);
    const whole = Math.floor(count / 15);
    const rem = count % 15;
    const parts: string[] = [];
    if (whole > 0) {
        parts.push(`${whole} niebotycznych`);
    }
    if (rem > 0) {
        parts.push(STATES[rem] ?? String(rem));
    } else if (!parts.length) {
        parts.push(STATES[0]);
    }
    return parts.join(" + ");
}

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
    return (content = "") => {
        if (visibleLength(content) > contentWidth) {
            const plain = stripAnsiCodes(content);
            const prefix = content.match(/^\x1b\[[0-9;]*m/)?.[0] || "";
            const suffix = prefix ? RESET : "";
            content = prefix + plain.slice(0, contentWidth) + suffix;
        }
        return `|${" ".repeat(left)}${content}${" ".repeat(
            Math.max(0, contentWidth - visibleLength(content))
        )}${" ".repeat(right)}|`;
    };
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
    private lifetime: { date: string; count: number }[] = [];
    private lifetimeEnabled = true;
    private lifetimeLoaded = false;
    private pendingLifetime: { count: number; time: number }[] = [];
    private lastTime: number = 0;
    private lastKills = { my: 0, team: 0 };
    private level: number = -1;
    private lastObjNum?: number;
    private loaded = false;
    private pendingLevel?: { level: number; objNum?: number };
    private initialized = false;
    private static readonly STORAGE_KEY = "improve_counter";
    private static readonly LIFETIME_KEY = "improve_counter_lifetime";

    constructor(client: Client, killCounter: any) {
        this.client = client;
        this.killCounter = killCounter;

        this.client.addEventListener("storage", (event: CustomEvent) => {
            if (event.detail.key === ImproveCounter.STORAGE_KEY) {
                this.load(event.detail.value ?? {});
                this.loaded = true;
                if (this.pendingLevel) {
                    const { level, objNum } = this.pendingLevel;
                    this.pendingLevel = undefined;
                    this.handleLevel(level, objNum);
                }
            }
            if (event.detail.key === ImproveCounter.LIFETIME_KEY) {
                this.loadLifetime(event.detail.value ?? {});
                this.lifetimeLoaded = true;
                if (this.pendingLifetime.length) {
                    for (const p of this.pendingLifetime) {
                        this.addToLifetime(p.count, p.time);
                    }
                    this.pendingLifetime = [];
                }
            }
        });

        this.client.addEventListener("reset", () => this.reset());

        window.addEventListener("beforeunload", this.persist);

        this.client.port?.postMessage({
            type: "GET_STORAGE",
            key: ImproveCounter.STORAGE_KEY,
        });
        this.client.port?.postMessage({
            type: "GET_STORAGE",
            key: ImproveCounter.LIFETIME_KEY,
        });

        this.client.addEventListener("gmcp.char.state", (ev: CustomEvent) => {
            const level = ev.detail?.improve;
            const obj = ev.detail?.object_num;
            if (typeof level === "number") {
                this.handleLevel(level, typeof obj === "number" ? obj : undefined);
            }
        });
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
        this.persist();
    }

    private handleLevel(level: number, objNum?: number) {
        if (!this.loaded) {
            this.pendingLevel = { level, objNum };
            return;
        }
        const newObj =
            objNum !== undefined &&
            this.lastObjNum !== undefined &&
            objNum !== this.lastObjNum;

        if (!this.initialized || newObj) {
            if (newObj) {
                for (let l = 1; l <= level; l++) {
                    const s = STATES[l] ?? String(l);
                    this.recordInitial(s);
                }
            } else if (this.level < 0) {
                for (let l = 1; l < level; l++) {
                    const s = STATES[l] ?? String(l);
                    this.recordInitial(s);
                }
                if (level > 0) {
                    const state = STATES[level] ?? String(level);
                    this.record(state);
                }
            } else if (level > this.level) {
                for (let l = this.level + 1; l <= level; l++) {
                    const state = STATES[l] ?? String(l);
                    this.recordInitial(state);
                }
            }
            this.level = level;
            this.lastObjNum = objNum;
            this.persist();
            this.initialized = true;
            return;
        }
        if (level > this.level) {
            for (let l = this.level + 1; l <= level; l++) {
                const state = STATES[l] ?? String(l);
                this.record(state);
            }
            this.level = level;
            this.persist();
        } else if (level < this.level) {
            this.level = level;
            this.persist();
        }
        this.lastObjNum = objNum;
    }

    private addToLifetime(count: number, time: number) {
        if (!this.lifetimeEnabled) return;
        if (!this.lifetimeLoaded) {
            this.pendingLifetime.push({ count, time });
            return;
        }
        const d = new Date(time);
        const date = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
        let day = this.lifetime[this.lifetime.length - 1];
        if (!day || day.date !== date) {
            day = { date, count: 0 };
            this.lifetime.push(day);
        }
        day.count += count;
        this.persistLifetime();
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
        this.addToLifetime(1, now);
        this.lastTime = now;
        this.lastKills = kills;
        this.persist();
        const msg = colorString(
            `\tWlasnie wbiles postepy: ${state} (czas: ${formatDuration(
                entry.delta,
            )})`,
            SECTION_COLOR,
        );
        this.client.println(msg);
    }

    private recordInitial(_state: string) {
        const now = Date.now();
        this.addToLifetime(1, now);
        this.lastTime = now;
        this.lastKills = this.getKills();
        this.persist();
    }

    private load(data: any = {}) {
        this.entries = Array.isArray(data.entries) ? data.entries : [];
        this.lastTime = typeof data.lastTime === "number" && data.lastTime > 0 ? data.lastTime : Date.now();
        this.lastKills = data.lastKills || this.getKills();
        this.level = typeof data.level === "number" ? data.level : -1;
        this.lastObjNum = typeof data.lastObjNum === "number" ? data.lastObjNum : undefined;
    }

    private loadLifetime(data: any = {}) {
        const convertLegacy = (arr: any[]) => {
            const result: { date: string; count: number }[] = [];
            arr.forEach((e) => {
                const d = new Date(e.time);
                const date = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
                let day = result.find((x) => x.date === date);
                if (!day) {
                    day = { date, count: 0 };
                    result.push(day);
                }
                day.count += 1;
            });
            return result;
        };
        const convertStates = (arr: any[]) =>
            arr.map((e) => ({ date: e.date, count: Array.isArray(e.states) ? e.states.length : 0 }));
        if (Array.isArray(data)) {
            this.lifetime = convertLegacy(data);
            this.lifetimeEnabled = true;
        } else {
            const entries = Array.isArray(data.entries) ? data.entries : [];
            if (entries.length && entries[0] && (entries[0] as any).state !== undefined) {
                this.lifetime = convertLegacy(entries);
            } else if (entries.length && (entries[0] as any).states !== undefined) {
                this.lifetime = convertStates(entries);
            } else {
                this.lifetime = entries as { date: string; count: number }[];
            }
            this.lifetimeEnabled = data.enabled !== false;
        }
    }

    private persist = () => {
        this.client.port?.postMessage({
            type: "SET_STORAGE",
            key: ImproveCounter.STORAGE_KEY,
            value: {
                entries: this.entries,
                lastTime: this.lastTime,
                lastKills: this.lastKills,
                level: this.level,
                lastObjNum: this.lastObjNum,
            },
        });
    };
    
    private persistLifetime = () => {
        this.client.port?.postMessage({
            type: "SET_STORAGE",
            key: ImproveCounter.LIFETIME_KEY,
            value: { entries: this.lifetime, enabled: this.lifetimeEnabled },
        });
    };

    addLifetime(count: number, id?: number) {
        const toAdd = Math.min(Math.max(0, count), 15);
        if (toAdd <= 0) return;
        if (typeof id === "number") {
            const idx = id - 1;
            if (idx < 0 || idx >= this.lifetime.length) return;
            this.lifetime[idx].count += toAdd;
        } else {
            const d = new Date();
            const date = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
            let day = this.lifetime[this.lifetime.length - 1];
            if (!day || day.date !== date) {
                day = { date, count: 0 };
                this.lifetime.push(day);
            }
            day.count += toAdd;
        }
        this.persistLifetime();
    }

    removeLifetime(id: number, count?: number) {
        const idx = id - 1;
        if (idx < 0 || idx >= this.lifetime.length) return;
        if (typeof count === "number") {
            const day = this.lifetime[idx];
            const n = Math.min(Math.max(1, count), day.count);
            day.count -= n;
            if (day.count === 0) {
                this.lifetime.splice(idx, 1);
            }
        } else {
            this.lifetime.splice(idx, 1);
        }
        this.persistLifetime();
    }

    resetLifetime() {
        this.lifetime = [];
        this.persistLifetime();
    }

    setLifetimeEnabled(on: boolean) {
        this.lifetimeEnabled = on;
        this.persistLifetime();
    }

    private formatTable(): string {
        const WIDTH = 74;
        const INNER = WIDTH - 2;
        const pad = createPad(INNER, 1, 1);
        const header = createHeader(INNER, 2, HEADER_COLOR);

        const now = new Date();
        const avg = this.entries.length
            ? this.entries.reduce((s, e) => s + e.delta, 0) / this.entries.length
            : 0;
        const lines: string[] = [];
        lines.push(header("Postepy"));
        lines.push(pad());
        const current = colorString(
            `Aktualny czas   : ${formatDate(now)}`,
            TIME_COLOR
        );
        lines.push(
            pad(
                `${current}    : sred ${formatDuration(avg)}       Dzisiaj: ${this.entries.length}`
            )
        );
        lines.push(pad());
        this.entries.forEach((e, idx) => {
            lines.push(
                pad(
                    `${(idx + 1)
                        .toString()
                        .padStart(2, " ")}. ${e.state.padEnd(15)} : ${formatDate(
                        new Date(e.time)
                    )} : czas ${formatDuration(e.delta)} : zabici ${e.killsMy}/${
                        e.killsMy + e.killsTeam
                    }`
                )
            );
        });
        lines.push(pad());
        lines.push(pad(colorString("ZABITYCH", SECTION_COLOR)));
        const totals = this.getKills();
        lines.push(
            pad(
                `${colorString("JA ... :", LABEL_COLOR)} ${colorString(String(totals.my), COUNT_COLOR)}`
            )
        );
        lines.push(
            pad(
                `${colorString("WSZYSCY:", LABEL_COLOR)} ${colorString(String(totals.my + totals.team), COUNT_COLOR)}`
            )
        );
        lines.push(pad());
        const since = Date.now() - this.lastTime;
        const myDelta = totals.my - this.lastKills.my;
        const teamDelta = totals.team - this.lastKills.team;
        lines.push(
            pad(
                colorString(
                    `Od ostatniego postepu: ${formatDuration(since)} : zabici: ${myDelta}/${
                        myDelta + teamDelta
                    }`,
                    POSTEP_COLOR
                )
            )
        );
        lines.push(pad());
        lines.push(`+${"-".repeat(INNER)}+`);
        return lines.join("\n");
    }

    show() {
        this.client.print("\n\n" + this.formatTable() + "\n\n");
    }

    private formatLifetimeTable(): string {
        const WIDTH = 57;
        const INNER = WIDTH - 2;
        const pad = createPad(INNER, 1, 1);
        const lines: string[] = [];
        lines.push(`+${"-".repeat(INNER)}+`);
        lines.push(pad());
        const name = titleCase(getCurrentCharacter() || "");
        lines.push(pad(`POSTAC: ${colorString(name, NAME_COLOR)}`));
        lines.push(pad());
        this.lifetime.forEach((e, idx) => {
            const date = colorString(e.date, DATE_COLOR);
            const cnt = formatCount(e.count);
            const line = `[${String(idx + 1).padStart(4, " ")}] ${date}    - ${cnt}`;
            lines.push(pad(line));
        });
        lines.push(pad());
        lines.push(pad("      ------------------------------------"));
        lines.push(pad());
        const total = this.lifetime.reduce((sum, e) => sum + e.count, 0);
        const approx = (total / 15).toFixed(2);
        const label = colorString("WSZYSTKICH DO TEJ PORY:", TOTAL_LABEL_COLOR);
        const totalStr = colorString(`${total} postepow`, HEADER_COLOR);
        const approxStr = colorString(`~${approx} niebotycznych`, HEADER_COLOR);
        lines.push(pad(`${label} ${totalStr}`));
        lines.push(pad(`                         ${approxStr}`));
        lines.push(pad());
        lines.push(`+${"-".repeat(INNER)}+`);
        return lines.join("\n");
    }

    showLifetime() {
        this.client.print("\n" + this.formatLifetimeTable() + "\n");
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
        aliases.push({ pattern: /\/postepy_reset$/, callback: () => counter.reset() });
        aliases.push({ pattern: /\/postepy2$/, callback: () => counter.showLifetime() });
        aliases.push({ pattern: /\/postepy2_reset$/, callback: () => counter.resetLifetime() });
        aliases.push({ pattern: /\/postepy2_off$/, callback: () => counter.setLifetimeEnabled(false) });
        aliases.push({ pattern: /\/postepy2_on$/, callback: () => counter.setLifetimeEnabled(true) });
        aliases.push({ pattern: /\/postepy2\+$/, callback: () => counter.addLifetime(1) });
        aliases.push({ pattern: /\/postepy2\+ ([0-9]+)$/, callback: (m: RegExpMatchArray) => counter.addLifetime(parseInt(m[1], 10)) });
        aliases.push({ pattern: /\/postepy2\+ ([0-9]+) ([0-9]+)$/, callback: (m: RegExpMatchArray) => counter.addLifetime(parseInt(m[2], 10), parseInt(m[1], 10)) });
        aliases.push({ pattern: /\/postepy2- ([0-9]+)$/, callback: (m: RegExpMatchArray) => counter.removeLifetime(parseInt(m[1], 10)) });
        aliases.push({ pattern: /\/postepy2- ([0-9]+) ([0-9]+)$/, callback: (m: RegExpMatchArray) => counter.removeLifetime(parseInt(m[1], 10), parseInt(m[2], 10)) });
    }
    return counter;
}
