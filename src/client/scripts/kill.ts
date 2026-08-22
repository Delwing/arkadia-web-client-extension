import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";
import {AnsiAwareBuffer} from "../ansi/FormatState";
import eventBus from "@modules/core/eventBus";
import {characterStorage} from "@modules/core/storage";
import {BaseCounter} from "./lib/BaseCounter";
import {createPad, createHeader} from "./lib/counterTableUtils";
import {
    recordKillToDB,
    getLifetimeTotals,
    getKillsByDate,
    getGlobalKillStats,
    getKillsGroupedByDate,
    migrateFromLocalStorage,
    getAllRecords,
    getDistinctDates,
    getTodayDate,
    type LifetimeKillSummary,
    type DailyKillSummary,
    type GlobalKillStats,
    type DateGroupedKills,
    type KillRecord,
} from './lib/killLifetimeStorage';

export type KillEntry = {
    mySession: number;
    myTotal: number;
    teamSession: number;
};

export type KillCounts = Record<string, KillEntry>;

export type TeamMemberKills = Record<string, Record<string, number>>; // player -> mob -> count

export type KillData = {
    kills: KillCounts;
    teamKills: TeamMemberKills;
    totals: { my: number; team: number };
};

const STORAGE_KEY = "kill_counter";
const SESSION_STORAGE_KEY = "kill_counter_session";
const TEAM_KILLS_STORAGE_KEY = "kill_counter_team";

const KILL_HEADER_COLOR = createColorFormat("#7cfc00");
const KILL_MY_COLOR = createColorFormat("#ffff00");
const KILL_NAME_COLOR = createColorFormat("#ffff00");
const KILL_TOTAL_COLOR = createColorFormat("#778899");
const KILL_UPPER_COLOR = createColorFormat("#ffa500");
const KILL_LOWER_COLOR = createColorFormat("#7cfc00");
const KILL_PINK_COLOR = createColorFormat("#ffc0cb");
const KILL_PREFIX_COLOR = createColorFormat("#ff6347");
const KILL_TEAM_MEMBER_COLOR = createColorFormat("#87ceeb");

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

function titleCase(str: string): string {
    return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

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


function formatSessionTable(counts: KillCounts, teamKills: TeamMemberKills = {}): AnsiAwareBuffer {
    const WIDTH = width - 2;
    const LEFT_PADDING = 2;
    const RIGHT_PADDING = 5;
    const CONTENT_WIDTH = WIDTH - LEFT_PADDING - RIGHT_PADDING;

    const HEADER_COLOR = KILL_HEADER_COLOR;
    const MY_COLOR = KILL_MY_COLOR;
    const TOTAL_COLOR = KILL_TOTAL_COLOR;
    const TEAM_MEMBER_COLOR = KILL_TEAM_MEMBER_COLOR;

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

    const summaryLine = (label: string, value: number, color?: ReturnType<typeof createColorFormat>) => {
        const buffer = new AnsiAwareBuffer();
        if (color !== undefined) {
            buffer.append(label, color);
        } else {
            buffer.append(label, {});
        }
        buffer.append(" ", {});
        const num = String(value);
        const dots = CONTENT_WIDTH - label.length - 1 - num.length - 1;
        buffer.append(".".repeat(Math.max(0, dots)), {});
        buffer.append(` ${num}`, {});
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

    // Display team member kills
    const teamMemberEntries = Object.entries(teamKills)
        .filter(([_, mobs]) => Object.values(mobs).reduce((s, c) => s + c, 0) > 0)
        .sort(([a], [b]) => a.localeCompare(b));

    for (const [player, mobs] of teamMemberEntries) {
        output.appendBuffer(pad());
        output.append("\n", {});

        const playerLine = new AnsiAwareBuffer();
        playerLine.append(player, TEAM_MEMBER_COLOR);
        output.appendBuffer(pad(playerLine));
        output.append("\n", {});

        const mobEntries = Object.entries(mobs)
            .filter(([_, count]) => count > 0)
            .sort(([a], [b]) => a.localeCompare(b));

        for (const [mobName, count] of mobEntries) {
            output.appendBuffer(mobLine(mobName, count));
            output.append("\n", {});
        }

        const playerTotal = Object.values(mobs).reduce((s, c) => s + c, 0);
        output.appendBuffer(pad());
        output.append("\n", {});
        output.appendBuffer(summaryLine("LACZNIE:", playerTotal, TOTAL_COLOR));
        output.append("\n", {});
    }

    output.appendBuffer(pad());
    output.append("\n", {});
    output.appendBuffer(pad());
    output.append("\n", {});
    output.appendBuffer(summaryLine("DRUZYNA LACZNIE:", totalCombined, TOTAL_COLOR));
    output.append("\n", {});
    output.append(`+${"-".repeat(WIDTH)}+`, {});
    return output;
}

function formatLifetimeTable(counts: KillCounts, character: string): AnsiAwareBuffer {
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

    const nameLine = new AnsiAwareBuffer();
    nameLine.append("POSTAC: ", {});
    nameLine.append(titleCase(character), KILL_NAME_COLOR);
    output.appendBuffer(pad(nameLine));
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

function formatLifetimeByDateTable(kills: DailyKillSummary[], date: string, character: string): AnsiAwareBuffer {
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

    const entries = kills
        .filter(k => k.count > 0)
        .sort((a, b) => {
            const aUpper = /^[A-Z]/.test(a.mob);
            const bUpper = /^[A-Z]/.test(b.mob);
            if (aUpper !== bUpper) return aUpper ? -1 : 1;
            return a.mob.localeCompare(b.mob);
        });

    const total = entries.reduce((s, k) => s + k.count, 0);

    const mobLine = (name: string, count: number) => {
        const color = /^[A-Z]/.test(name) ? UPPER_COLOR : LOWER_COLOR;
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
    output.appendBuffer(header(`Zabici (${date})`));
    output.append("\n", {});
    output.appendBuffer(pad());
    output.append("\n", {});

    const nameLine = new AnsiAwareBuffer();
    nameLine.append("POSTAC: ", {});
    nameLine.append(titleCase(character), KILL_NAME_COLOR);
    output.appendBuffer(pad(nameLine));
    output.append("\n", {});
    output.appendBuffer(pad());
    output.append("\n", {});
    entries.forEach(({mob, count}) => {
        output.appendBuffer(mobLine(mob, count));
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
    summaryBuffer.append("LACZNIE: ", PINK_COLOR);
    summaryBuffer.append(String(total), LOWER_COLOR);
    summaryBuffer.append(" zabitych", LOWER_COLOR);

    output.appendBuffer(pad(summaryBuffer));
    output.append("\n", {});
    output.appendBuffer(pad());
    output.append("\n", {});
    output.append(`+${"-".repeat(INNER)}+`, {});
    return output;
}

function formatGlobalStatsTable(groups: DateGroupedKills[], character: string): AnsiAwareBuffer {
    const WIDTH = width;
    const LEFT_PADDING = 2;
    const RIGHT_PADDING = 5;
    const INNER = WIDTH - 2;
    const CONTENT_WIDTH = INNER - LEFT_PADDING - RIGHT_PADDING;

    const HEADER_COLOR = KILL_HEADER_COLOR;
    const UPPER_COLOR = KILL_UPPER_COLOR;
    const LOWER_COLOR = KILL_LOWER_COLOR;
    const PINK_COLOR = KILL_PINK_COLOR;
    const DATE_COLOR = KILL_UPPER_COLOR;
    const TOTAL_COLOR = KILL_TOTAL_COLOR;

    const pad = createPad(INNER, LEFT_PADDING, RIGHT_PADDING);
    const header = createHeader(WIDTH, 4, HEADER_COLOR);

    const grandTotal = groups.reduce((s, g) => s + g.total, 0);

    const mobLine = (name: string, count: number) => {
        const color = /^[A-Z]/.test(name) ? UPPER_COLOR : LOWER_COLOR;
        const buffer = new AnsiAwareBuffer();
        buffer.append("  - ", {});
        buffer.append(name, color);
        buffer.append(" ", {});
        const num = String(count);
        const dots = CONTENT_WIDTH - 4 - name.length - 1 - num.length;
        buffer.append(".".repeat(Math.max(0, dots)), {});
        buffer.append(num, {});
        return pad(buffer);
    };

    const output = new AnsiAwareBuffer();
    output.appendBuffer(header("Zabici - historia"));
    output.append("\n", {});
    output.appendBuffer(pad());
    output.append("\n", {});

    const nameLine = new AnsiAwareBuffer();
    nameLine.append("POSTAC: ", {});
    nameLine.append(titleCase(character), KILL_NAME_COLOR);
    output.appendBuffer(pad(nameLine));
    output.append("\n", {});
    output.appendBuffer(pad());
    output.append("\n", {});

    groups.forEach((group, idx) => {
        if (idx > 0) {
            output.appendBuffer(pad());
            output.append("\n", {});
        }
        const dateLine = new AnsiAwareBuffer();
        dateLine.append(group.date, DATE_COLOR);
        output.appendBuffer(pad(dateLine));
        output.append("\n", {});

        const sepLine = new AnsiAwareBuffer();
        sepLine.append("----------", {});
        output.appendBuffer(pad(sepLine));
        output.append("\n", {});

        group.kills.forEach(({mob, count}) => {
            output.appendBuffer(mobLine(mob, count));
            output.append("\n", {});
        });

        output.appendBuffer(pad());
        output.append("\n", {});

        const sumBuffer = new AnsiAwareBuffer();
        sumBuffer.append("SUMA: ", TOTAL_COLOR);
        sumBuffer.append(`${group.total} zabitych`, LOWER_COLOR);
        output.appendBuffer(pad(sumBuffer));
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
    summaryBuffer.append(String(grandTotal), LOWER_COLOR);
    summaryBuffer.append(" zabitych", LOWER_COLOR);

    output.appendBuffer(pad(summaryBuffer));
    output.append("\n", {});
    output.appendBuffer(pad());
    output.append("\n", {});
    output.append(`+${"-".repeat(INNER)}+`, {});
    return output;
}

export {parseName, formatSessionTable, formatLifetimeTable, formatLifetimeByDateTable, formatGlobalStatsTable};

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

function isTeamMemberKills(value: unknown): value is TeamMemberKills {
    if (!value || typeof value !== "object") {
        return false;
    }
    return Object.values(value as Record<string, unknown>).every(entry => {
        if (!entry || typeof entry !== "object") {
            return false;
        }
        return Object.values(entry as Record<string, unknown>).every(v => typeof v === "number");
    });
}

let killCounterInstance: KillCounter | null = null;

export function getKillData(): KillData | null {
    return killCounterInstance?.getData() ?? null;
}

export type LifetimeKillData = {
    totals: LifetimeKillSummary[];
    grandTotal: number;
};

let lifetimeKillDataCache: LifetimeKillData | null = null;

export function getLifetimeKillData(): LifetimeKillData | null {
    return lifetimeKillDataCache;
}

export {type KillRecord, type DailyKillSummary, type GlobalKillStats};
export {getAllRecords, getDistinctDates, getKillsByDate as getKillsByDateFromDB, getGlobalKillStats as getGlobalKillStatsFromDB};

class KillCounter extends BaseCounter {
    private kills: KillCounts = {};
    private teamKills: TeamMemberKills = {};
    private migrationDone = false;

    constructor(client: Client) {
        super(client);
        killCounterInstance = this;

        // Load initial data from storage
        const initialTotals = characterStorage.get(STORAGE_KEY);
        if (initialTotals) {
            this.loadTotals(isNumberRecord(initialTotals) ? initialTotals : {});
            this.migrateIfNeeded();
        }
        const initialSession = characterStorage.get(SESSION_STORAGE_KEY);
        if (initialSession) {
            this.loadSession(isSessionRecord(initialSession) ? initialSession : {});
        }
        const initialTeam = characterStorage.get(TEAM_KILLS_STORAGE_KEY);
        if (initialTeam) {
            this.loadTeamKills(isTeamMemberKills(initialTeam) ? initialTeam : {});
        }

        this.onStorageChange(STORAGE_KEY, (newValue) => {
            this.loadTotals(isNumberRecord(newValue) ? newValue : {});
            this.migrateIfNeeded();
        });
        this.onStorageChange(SESSION_STORAGE_KEY, (newValue) => {
            this.loadSession(isSessionRecord(newValue) ? newValue : {});
        });
        this.onStorageChange(TEAM_KILLS_STORAGE_KEY, (newValue) => {
            this.loadTeamKills(isTeamMemberKills(newValue) ? newValue : {});
        });

        window.addEventListener("beforeunload", this.persistTotals);
        window.addEventListener("beforeunload", this.persistSessions);
        window.addEventListener("beforeunload", this.persistTeamKills);

        const myKillRegex = /^[ >]*(Zabil(?<variant>es|as) (?<name>[A-Za-z ()!,]+))\.$/;
        const teamKillRegex = /^[ >]*(?<player>[a-zA-Z (),!]+) zabil(?<variant>a?) (?<name>[a-zA-Z (),!]+)\.$/;

        this.client.Triggers.registerTrigger(
            myKillRegex,
            (line, matches) => {
                if (!matches) return line;
                this.client.emit("kill", { killer: "ME" });
                const mob = parseName(matches.groups?.name ?? "");
                const variant = matches.groups?.variant ?? "es";
                const prefix = variant === "as" ? "[  ZABILAS  ]" : "[  ZABILES  ]";
                const entry = this.recordKill(mob, true);
                return this.formatPrefix(line, entry, prefix, true);
            }
        );

        this.client.Triggers.registerTrigger(
            teamKillRegex,
            (line, matches) => {
                if (!matches) return line;
                const player = (matches.groups?.player ?? "").trim();
                const mob = parseName(matches.groups?.name ?? "");
                const variant = matches.groups?.variant ?? "";
                const prefix = variant === "a" ? "[   ZABILA   ]" : "[   ZABIL   ]";
                if (this.client.TeamManager.isInTeam(player)) {
                    const entry = this.recordKill(mob, false, player);
                    this.client.emit("kill", { killer: "TEAM" });
                    return this.formatPrefix(line, entry, prefix, false);
                } else {
                    this.client.emit("kill", { killer: "OTHER" });
                    return this.formatPrefix(line, null, prefix, false);
                }
            }
        );

    }

    private loadTotals(totals: Record<string, number> = {}): void {
        const newKills: KillCounts = {};
        Object.entries(totals).forEach(([name, total]) => {
            newKills[name] = {
                mySession: this.kills[name]?.mySession ?? 0,
                myTotal: total,
                teamSession: this.kills[name]?.teamSession ?? 0,
            };
        });
        this.kills = newKills;
    }

    protected onReset(): void {
        this.resetSession();
    }

    private persistTotals = () => {
        const totals: Record<string, number> = {};
        Object.entries(this.kills).forEach(([name, entry]) => {
            totals[name] = entry.myTotal;
        });
        this.setStorage(STORAGE_KEY, totals);
    };

    private loadSession(
        session: Record<string, Partial<{ mySession: number; teamSession: number }>> = {}
    ): void {
        for (const entry of Object.values(this.kills)) {
            entry.mySession = 0;
            entry.teamSession = 0;
        }
        Object.entries(session).forEach(([name, data]) => {
            const entry = this.kills[name] ?? { mySession: 0, myTotal: 0, teamSession: 0 };
            entry.mySession = typeof data.mySession === "number" ? data.mySession : 0;
            entry.teamSession = typeof data.teamSession === "number" ? data.teamSession : 0;
            this.kills[name] = entry;
        });
        this.emitUpdate();
    }

    private persistSessions = () => {
        const sessions: Record<string, { mySession: number; teamSession: number }> = {};
        Object.entries(this.kills).forEach(([name, entry]) => {
            if (entry.mySession || entry.teamSession) {
                sessions[name] = {mySession: entry.mySession, teamSession: entry.teamSession};
            }
        });
        this.setStorage(SESSION_STORAGE_KEY, sessions);
    };

    private loadTeamKills(teamKills: TeamMemberKills = {}): void {
        this.teamKills = teamKills;
    }

    private persistTeamKills = () => {
        const filtered: TeamMemberKills = {};
        Object.entries(this.teamKills).forEach(([player, mobs]) => {
            const hasKills = Object.values(mobs).some(count => count > 0);
            if (hasKills) {
                filtered[player] = mobs;
            }
        });
        this.setStorage(TEAM_KILLS_STORAGE_KEY, filtered);
    };

    private ensureEntry(name: string): KillEntry {
        if (!this.kills[name]) {
            this.kills[name] = {mySession: 0, myTotal: 0, teamSession: 0};
        }
        return this.kills[name];
    }

    private recordKill(mob: string, self: boolean, player?: string): KillEntry {
        const entry = this.ensureEntry(mob);
        if (self) {
            entry.mySession += 1;
            entry.myTotal += 1;
            this.persistTotals();
            this.persistKillToIDB(mob);
        } else {
            entry.teamSession += 1;
            if (player) {
                if (!this.teamKills[player]) {
                    this.teamKills[player] = {};
                }
                this.teamKills[player][mob] = (this.teamKills[player][mob] ?? 0) + 1;
                this.persistTeamKills();
            }
        }
        this.persistSessions();
        this.emitUpdate();
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

    getData(): KillData {
        const kills: KillCounts = {};
        Object.entries(this.kills).forEach(([name, entry]) => {
            kills[name] = {...entry};
        });
        const teamKills: TeamMemberKills = {};
        Object.entries(this.teamKills).forEach(([player, mobs]) => {
            teamKills[player] = {...mobs};
        });
        return {
            kills,
            teamKills,
            totals: this.getSessionTotals(),
        };
    }

    private emitUpdate() {
        eventBus.emit("zabici.updated", this.getData());
    }

    resetSession() {
        Object.values(this.kills).forEach((e) => {
            e.mySession = 0;
            e.teamSession = 0;
        });
        this.teamKills = {};
        this.persistSessions();
        this.persistTeamKills();
        this.emitUpdate();
    }

    private async migrateIfNeeded() {
        if (this.migrationDone) return;
        this.migrationDone = true;
        const character = characterStorage.getCharacter();
        if (!character) return;
        try {
            await migrateFromLocalStorage(character);
            await this.syncTotalsFromIDB();
        } catch (e) {
            console.warn('Kill counter migration failed:', e);
        }
    }

    private async persistKillToIDB(mob: string): Promise<void> {
        const character = characterStorage.getCharacter();
        if (!character) return;
        const date = getTodayDate();
        try {
            await recordKillToDB(character, mob, date);
            await this.refreshLifetimeCache();
        } catch (e) {
            console.warn('Failed to persist kill to IndexedDB:', e);
        }
    }

    private async refreshLifetimeCache(): Promise<void> {
        const character = characterStorage.getCharacter();
        if (!character) return;
        try {
            const totals = await getLifetimeTotals(character);
            const grandTotal = totals.reduce((sum, t) => sum + t.total, 0);
            lifetimeKillDataCache = {totals, grandTotal};
            eventBus.emit("zabici2.updated", lifetimeKillDataCache);
        } catch (e) {
            console.warn('Failed to refresh lifetime kill cache:', e);
        }
    }

    private async syncTotalsFromIDB(): Promise<void> {
        const character = characterStorage.getCharacter();
        if (!character) return;
        try {
            const totals = await getLifetimeTotals(character);
            for (const {mob, total} of totals) {
                const entry = this.kills[mob] ?? {mySession: 0, myTotal: 0, teamSession: 0};
                entry.myTotal = total;
                this.kills[mob] = entry;
            }
            await this.refreshLifetimeCache();
        } catch {
            // Silently fall back to localStorage data
        }
    }

    async showLifetimeByDate(dateStr: string): Promise<void> {
        const character = characterStorage.getCharacter();
        if (!character) {
            this.client.print(new AnsiAwareBuffer("Brak aktywnej postaci.\n"));
            return;
        }
        try {
            const kills = await getKillsByDate(character, dateStr);
            if (kills.length === 0) {
                this.client.print(new AnsiAwareBuffer(`Brak zabitych w dniu ${dateStr}.\n`));
                return;
            }
            const output = new AnsiAwareBuffer();
            output.append("\n", {});
            output.appendBuffer(formatLifetimeByDateTable(kills, dateStr, character));
            output.append("\n", {});
            this.client.print(output);
        } catch {
            this.client.print(new AnsiAwareBuffer("Blad odczytu danych z bazy.\n"));
        }
    }

    async showGlobalStats(): Promise<void> {
        const character = characterStorage.getCharacter();
        if (!character) {
            this.client.print(new AnsiAwareBuffer("Brak aktywnej postaci.\n"));
            return;
        }
        try {
            const groups = await getKillsGroupedByDate(character);
            if (groups.length === 0) {
                this.client.print(new AnsiAwareBuffer("Brak danych o zabitych.\n"));
                return;
            }
            const output = new AnsiAwareBuffer();
            output.append("\n", {});
            output.appendBuffer(formatGlobalStatsTable(groups, character));
            output.append("\n", {});
            this.client.print(output);
        } catch {
            this.client.print(new AnsiAwareBuffer("Blad odczytu danych z bazy.\n"));
        }
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
        output.appendBuffer(formatSessionTable(this.kills, this.teamKills));
        output.append("\n", {});
        this.client.print(output);
    }

    async showLifetime(): Promise<void> {
        const character = characterStorage.getCharacter();
        if (!character) {
            this.client.print(new AnsiAwareBuffer("Brak aktywnej postaci.\n"));
            return;
        }
        try {
            const totals = await getLifetimeTotals(character);
            const counts: KillCounts = {};
            for (const {mob, total} of totals) {
                counts[mob] = {mySession: 0, myTotal: total, teamSession: 0};
            }
            const output = new AnsiAwareBuffer();
            output.append("\n", {});
            output.appendBuffer(formatLifetimeTable(counts, character));
            output.append("\n", {});
            this.client.print(output);
        } catch {
            this.client.print(new AnsiAwareBuffer("Blad odczytu danych z bazy.\n"));
        }
    }
}

export function initKillCounter(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
): KillCounter {
    const counter = new KillCounter(client);
    if (aliases) {
        aliases.push({pattern: /\/zabici$/, callback: () => counter.showSession()});
        aliases.push({pattern: /\/zabiciw$/, callback: () => eventBus.emit("zabici.popup.open")});
        aliases.push({pattern: /\/zabici2 (\d{4}\/\d{1,2}\/\d{1,2})$/, callback: (m: RegExpMatchArray) => counter.showLifetimeByDate(m[1])});
        aliases.push({pattern: /\/zabici2$/, callback: () => counter.showLifetime()});
        aliases.push({pattern: /\/zabici2w$/, callback: () => eventBus.emit("zabici2.popup.open")});
        aliases.push({pattern: /\/zabici2!$/, callback: () => counter.showGlobalStats()});
        aliases.push({pattern: /\/zabici_reset$/, callback: () => counter.resetSession()});
    }
    return counter;
}

export default KillCounter;
