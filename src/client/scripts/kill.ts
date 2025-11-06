import Client from "../Client";
import {findClosestColor} from "@modules/core/Colors";
import {AnsiAwareBuffer} from "../ansi/FormatState";

type KillEntry = {
    mySession: number;
    myTotal: number;
    teamSession: number;
};

type KillCounts = Record<string, KillEntry>;

const STORAGE_KEY = "kill_counter";
const SESSION_STORAGE_KEY = "kill_counter_session";

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

function createPad(
    width: number,
    left: number,
    right: number
): (content?: AnsiAwareBuffer) => AnsiAwareBuffer {
    const contentWidth = width - left - right;
    return (content = new AnsiAwareBuffer()) => {
        const buffer = new AnsiAwareBuffer();
        buffer.append("|", {});
        buffer.append(" ".repeat(left), {});
        buffer.appendBuffer(content);
        buffer.append(" ".repeat(Math.max(0, contentWidth - content.length)), {});
        buffer.append(" ".repeat(right), {});
        buffer.append("|", {});
        return buffer;
    };
}

function createHeader(
    width: number,
    offset: number,
    color: ReturnType<typeof findClosestColor>
): (title: string) => AnsiAwareBuffer {
    return (title: string) => {
        const dashes = width - title.length - offset;
        const left = Math.floor(dashes / 2);
        const right = dashes - left;
        const buffer = new AnsiAwareBuffer();
        buffer.append(`+${"-".repeat(left)} `, {});
        buffer.append(title, color);
        buffer.append(` ${"-".repeat(right)}+`, {});
        return buffer;
    };
}

function formatSessionTable(counts: KillCounts): AnsiAwareBuffer {
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
        const buffer = new AnsiAwareBuffer();
        const numbers = `${my}`;
        buffer.append(`${name} `, {});
        const dots = CONTENT_WIDTH - name.length - 1 - numbers.length - 1;
        buffer.append(".".repeat(Math.max(0, dots)), {});
        buffer.append(` ${numbers}`, {});
        return pad(buffer);
    };

    const summaryLine = (label: string, value: number, color?: ReturnType<typeof findClosestColor>) => {
        const buffer = new AnsiAwareBuffer();
        if (color !== undefined) {
            buffer.append(label, color);
        } else {
            buffer.append(label, {});
        }
        buffer.append(" ", {});
        const num = String(value);
        const dots = CONTENT_WIDTH - label.length - 1 - num.length;
        buffer.append(".".repeat(Math.max(0, dots)), {});
        buffer.append(num, {});
        return pad(buffer);
    };

    const output = new AnsiAwareBuffer();
    output.appendBuffer(header("Licznik zabitych"));
    output.append("\n", {});
    output.appendBuffer(pad());
    output.append("\n", {});

    const jaLine = new AnsiAwareBuffer();
    jaLine.append("JA", MY_COLOR);
    output.appendBuffer(pad(jaLine));
    output.append("\n", {});

    entries.forEach(([name, {mySession}]) => {
        output.appendBuffer(mobLine(name, mySession));
        output.append("\n", {});
    });
    output.appendBuffer(pad());
    output.append("\n", {});
    output.appendBuffer(summaryLine("LACZNIE:", totalMy, TOTAL_COLOR));
    output.append("\n", {});
    output.appendBuffer(pad());
    output.append("\n", {});
    output.appendBuffer(pad());
    output.append("\n", {});
    output.appendBuffer(summaryLine("DRUZYNA LACZNIE:", totalCombined, TOTAL_COLOR));
    output.append("\n", {});
    output.append(`+${"-".repeat(WIDTH)}+`, {});
    return output;
}

function formatLifetimeTable(counts: KillCounts): AnsiAwareBuffer {
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
        const buffer = new AnsiAwareBuffer();
        buffer.append("  ", {});
        buffer.append(name, color);
        buffer.append(" ", {});
        const dots = CONTENT_WIDTH - 3 - name.length - String(count).length;
        buffer.append(".".repeat(Math.max(0, dots)), {});
        buffer.append(String(count), {});
        return pad(buffer);
    };

    const output = new AnsiAwareBuffer();
    output.appendBuffer(header("Licznik zabitych"));
    output.append("\n", {});
    output.appendBuffer(pad());
    output.append("\n", {});
    entries.forEach(([name, entry]) => {
        output.appendBuffer(mobLine(name, entry.myTotal));
        output.append("\n", {});
    });
    output.appendBuffer(pad());
    output.append("\n", {});

    const separatorBuffer = new AnsiAwareBuffer();
    separatorBuffer.append("    ----------------------------------- ", {});
    output.appendBuffer(pad(separatorBuffer));
    output.append("\n", {});
    output.appendBuffer(pad());
    output.append("\n", {});

    const summaryBuffer = new AnsiAwareBuffer();
    summaryBuffer.append("  ", {});
    summaryBuffer.append("WSZYSTKICH DO TEJ PORY: ", PINK_COLOR);
    summaryBuffer.append(String(total), LOWER_COLOR);
    summaryBuffer.append(" zabitych", LOWER_COLOR);

    output.appendBuffer(pad(summaryBuffer));
    output.append("\n", {});
    output.appendBuffer(pad());
    output.append("\n", {});
    output.append(`+${"-".repeat(INNER)}+`, {});
    return output;
}

export {parseName, formatSessionTable, formatLifetimeTable};

function isNumberRecord(value: unknown): value is Record<string, number> {
    if (!value || typeof value !== "object") {
        return false;
    }
    return Object.values(value as Record<string, unknown>).every(entry => typeof entry === "number");
}

type SessionRecord = { mySession?: number; teamSession?: number };

function isSessionRecord(value: unknown): value is Record<string, SessionRecord> {
    if (!value || typeof value !== "object") {
        return false;
    }
    return Object.values(value as Record<string, unknown>).every(entry => {
        if (!entry || typeof entry !== "object") {
            return false;
        }
        const candidate = entry as SessionRecord;
        return (
            (candidate.mySession === undefined || typeof candidate.mySession === "number") &&
            (candidate.teamSession === undefined || typeof candidate.teamSession === "number")
        );
    });
}

class KillCounter {
    private client: Client;
    private kills: KillCounts = {};

    constructor(client: Client) {
        this.client = client;

        this.client.on("storage", ({ key, value }) => {
            if (key === STORAGE_KEY) {
                this.loadTotals(isNumberRecord(value) ? value : {});
            }
            if (key === SESSION_STORAGE_KEY) {
                this.loadSession(isSessionRecord(value) ? value : {});
            }
        });

        this.client.on("reset", () => this.resetSession());

        window.addEventListener("beforeunload", this.persistTotals);
        window.addEventListener("beforeunload", this.persistSessions);

        const myKillRegex = /^[ >]*(Zabil(?:es|as) (?<name>[A-Za-z ()!,]+))\.$/;
        const teamKillRegex = /^[ >]*(?<player>[a-zA-Z (),!]+) zabila? (?<name>[a-zA-Z (),!]+)\.$/;

        this.client.Triggers.registerTrigger(
            myKillRegex,
            (line, matches) => {
                if (!matches) return line;
                this.client.emit("kill", { killer: "ME" });
                const mob = parseName(matches.groups?.name ?? "");
                const entry = this.recordKill(mob, true);
                return this.formatPrefix(line, entry, "[  ZABILES  ]", true);
            }
        );

        this.client.Triggers.registerTrigger(
            teamKillRegex,
            (line, matches) => {
                if (!matches) return line;
                const player = (matches.groups?.player ?? "").trim();
                const mob = parseName(matches.groups?.name ?? "");
                if (this.client.TeamManager.isInTeam(player)) {
                    const entry = this.recordKill(mob, false);
                    this.client.emit("kill", { killer: "TEAM" });
                    return this.formatPrefix(line, entry, "[   ZABIL   ]", false);
                } else {
                    this.client.emit("kill", { killer: "OTHER" });
                    return this.formatPrefix(line, null, "[   ZABIL   ]", false);
                }
            }
        );

        this.client.port?.postMessage({type: "GET_STORAGE", key: STORAGE_KEY});
        this.client.port?.postMessage({type: "GET_STORAGE", key: SESSION_STORAGE_KEY});
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

    private loadSession(
        session: Record<string, Partial<{ mySession: number; teamSession: number }>> = {}
    ): void {
        Object.entries(session).forEach(([name, data]) => {
            const entry = this.kills[name] ?? { mySession: 0, myTotal: 0, teamSession: 0 };
            entry.mySession = typeof data.mySession === "number" ? data.mySession : 0;
            entry.teamSession = typeof data.teamSession === "number" ? data.teamSession : 0;
            this.kills[name] = entry;
        });
    }

    private persistSessions = () => {
        const sessions: Record<string, { mySession: number; teamSession: number }> = {};
        Object.entries(this.kills).forEach(([name, entry]) => {
            if (entry.mySession || entry.teamSession) {
                sessions[name] = {mySession: entry.mySession, teamSession: entry.teamSession};
            }
        });
        this.client.port?.postMessage({
            type: "SET_STORAGE",
            key: SESSION_STORAGE_KEY,
            value: sessions,
        });
    };

    private ensureEntry(name: string): KillEntry {
        if (!this.kills[name]) {
            this.kills[name] = {mySession: 0, myTotal: 0, teamSession: 0};
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
        this.persistSessions();
        return entry;
    }

    getSessionTotals() {
        const totals = {my: 0, team: 0};
        Object.values(this.kills).forEach((e) => {
            totals.my += e.mySession;
            totals.team += e.teamSession;
        });
        return totals;
    }

    resetSession() {
        Object.values(this.kills).forEach((e) => {
            e.mySession = 0;
            e.teamSession = 0;
        });
        this.persistSessions();
    }

    private formatPrefix(
        line: AnsiAwareBuffer,
        entry: KillEntry | null,
        label: string,
        highlight: boolean
    ): AnsiAwareBuffer {
        const color = KILL_PREFIX_COLOR;
        const countsRaw = entry
            ? ` (${entry.mySession} / ${entry.mySession + entry.teamSession})`
            : "";

        if (highlight && entry) {
            line.append(countsRaw, color);
        } else if (countsRaw) {
            line.append(countsRaw, {});
        }

        const prefixBuffer = new AnsiAwareBuffer();
        prefixBuffer.prepend("\n", {});
        prefixBuffer.append(label, color);
        prefixBuffer.append(" ", {});
        prefixBuffer.append(" ", {});

        return line
            .prependBuffer(prefixBuffer)
            .appendBuffer(new AnsiAwareBuffer("\n\n"))
    }

    showSession() {
        const output = new AnsiAwareBuffer();
        output.append("\n", {});
        output.appendBuffer(formatSessionTable(this.kills));
        output.append("\n", {});
        this.client.print(output);
    }

    showLifetime() {
        const output = new AnsiAwareBuffer();
        output.append("\n", {});
        output.appendBuffer(formatLifetimeTable(this.kills));
        output.append("\n", {});
        this.client.print(output);
    }
}

export function initKillCounter(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
): KillCounter {
    const counter = new KillCounter(client);
    if (aliases) {
        aliases.push({pattern: /\/zabici$/, callback: () => counter.showSession()});
        aliases.push({pattern: /\/zabici2$/, callback: () => counter.showLifetime()});
        aliases.push({pattern: /\/zabici_reset$/, callback: () => counter.resetSession()});
    }
    return counter;
}

export default KillCounter;
