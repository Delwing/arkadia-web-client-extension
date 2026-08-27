import Client from "../Client";
import {colorString, createColorFormat} from "@modules/core/Colors";
import {characterStorage} from "@modules/core/storage";
import {AnsiAwareBuffer} from "@client/ansi/FormatState";
import eventBus from "@modules/core/eventBus";
import {getKillData} from "./kill";
import {BaseCounter} from "./BaseCounter";
import {createPad, createHeader} from "./counterTableUtils";

const HEADER_COLOR = createColorFormat("#90ee90");
const SECTION_COLOR = createColorFormat("#ffa500");
const LABEL_COLOR = HEADER_COLOR;
const COUNT_COLOR = SECTION_COLOR;
const POSTEP_COLOR = createColorFormat("#6a5acd");
const TIME_COLOR = createColorFormat("#ffff00");
const NAME_COLOR = createColorFormat("#ffff00");
const DATE_COLOR = createColorFormat("#ffd700");
const TOTAL_LABEL_COLOR = createColorFormat("#ffb6c1");

export const IMPROVE_STATES = [
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

const STATES = IMPROVE_STATES;

function titleCase(str: string): string {
    return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatCount(count: number): string {
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

export function formatDuration(ms: number): string {
    const sec = Math.floor(ms / 1000);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(3, " ")}:${s.toString().padStart(2, "0")}`;
}


export type ImproveEntry = {
    state: string;
    time: number;
    delta: number;
    killsMy: number;
    killsTeam: number;
};

export type ImproveData = {
    entries: ImproveEntry[];
    lastTime: number;
    lastKills: { my: number; team: number };
    currentKills: { my: number; team: number };
    waitingForFirstCombat?: boolean;
};

let improveCounterInstance: ImproveCounter | null = null;

export function getImproveData(): ImproveData | null {
    return improveCounterInstance?.getData() ?? null;
}

export type LifetimeEntry = {
    date: string;
    count: number;
    noFormCount?: number;
};

export function getLifetimeData(): LifetimeEntry[] {
    return improveCounterInstance?.getLifetimeData() ?? [];
}

export type MergeMode = 'max' | 'add';

export function mergeLifetimeData(entries: { date: string; count: number }[], mode: MergeMode = 'max'): boolean {
    if (!improveCounterInstance) return false;
    improveCounterInstance.mergeLifetimeData(entries, mode);
    return true;
}

export function editLifetimeEntry(index: number, count: number): boolean {
    if (!improveCounterInstance) return false;
    return improveCounterInstance.editLifetimeEntry(index, count);
}

export function deleteLifetimeEntry(index: number): boolean {
    if (!improveCounterInstance) return false;
    return improveCounterInstance.deleteLifetimeEntry(index);
}

export function getFormattedPostepyTable(): AnsiAwareBuffer | null {
    return improveCounterInstance?.getFormattedTable() ?? null;
}

export default class ImproveCounter extends BaseCounter {
    private entries: ImproveEntry[] = [];
    private lifetime: { date: string; count: number; noFormCount?: number }[] = [];
    private lifetimeEnabled = true;
    private lifetimeLoaded = false;
    private pendingLifetime: { count: number; time: number; noForm?: boolean }[] = [];
    private lastTime: number = 0;
    private lastKills = {my: 0, team: 0};
    private level: number = -1;
    private lastObjNum?: number;
    private loaded = false;
    private pendingLevel?: number;
    private initialized = false;
    private waitingForFirstCombat = false;
    private stateForm: number = 0;
    private optionsForm: number = 0;
    constructor(client: Client) {
        super(client);
        improveCounterInstance = this;

        const initialData = characterStorage.get('improve_counter');
        this.load(initialData ?? {});
        this.loaded = true;

        const initialLifetime = characterStorage.get('improve_counter_lifetime');
        this.loadLifetime(initialLifetime ?? {});
        this.lifetimeLoaded = true;

        this.onStorageChange('improve_counter', (value) => {
            this.load(value ?? {});
            this.initialized = false;
            this.loaded = true;
            if (this.pendingLevel !== undefined) {
                const level = this.pendingLevel;
                this.pendingLevel = undefined;
                this.handleLevel(level);
            }
        });
        this.onStorageChange('improve_counter_lifetime', (value) => {
            this.loadLifetime(value ?? {});
            this.lifetimeLoaded = true;
            if (this.pendingLifetime.length) {
                for (const p of this.pendingLifetime) {
                    this.addToLifetime(p.count, p.time, p.noForm);
                }
                this.pendingLifetime = [];
            }
        });

        window.addEventListener("beforeunload", this.persist);

        this.client.on("gmcp.char.state", (state) => {
            if (typeof state.form === "number") {
                this.stateForm = state.form;
            }
            if (typeof state.improve === "number") {
                this.handleLevel(state.improve);
            }
        });

        this.client.on("gmcp.char.options", (options) => {
            if (typeof options.form === "number") {
                this.optionsForm = options.form;
            }
        });

        this.client.on("combatState", (inCombat: boolean) => {
            if (inCombat && this.waitingForFirstCombat) {
                this.waitingForFirstCombat = false;
                this.lastTime = this.client.now();
                this.lastKills = this.getKills();
                this.persist();
                this.emitUpdate();
            }
        });
    }

    private getKills() {
        return getKillData()?.totals ?? {my: 0, team: 0};
    }

    getData(): ImproveData {
        return {
            entries: [...this.entries],
            lastTime: this.lastTime,
            lastKills: {...this.lastKills},
            currentKills: this.getKills(),
            waitingForFirstCombat: this.waitingForFirstCombat,
        };
    }

    getLifetimeData(): LifetimeEntry[] {
        return [...this.lifetime];
    }

    private emitUpdate() {
        eventBus.emit("postepy.updated", this.getData());
    }

    reset() {
        this.entries = [];
        this.level = -1;
        this.lastTime = Date.now();
        this.lastKills = this.getKills();
        this.waitingForFirstCombat = true;
        this.persist();
        this.emitUpdate();
    }

    private handleLevel(level: number) {
        if (!this.loaded) {
            this.pendingLevel = level;
            return;
        }
        const objStored = characterStorage.get("object_num");
        const objNum =
            typeof objStored === "string"
                ? parseInt(objStored, 10)
                : typeof objStored === "number"
                    ? objStored
                    : undefined;
        const newObj =
            objNum !== undefined &&
            this.lastObjNum !== undefined &&
            objNum !== this.lastObjNum;
        const isFreshLogin = this.lastObjNum === undefined || objNum !== this.lastObjNum;

        if (!this.initialized || newObj) {
            if (newObj) {
                // Respawned character - if level > 0 combat has happened, otherwise wait
                if (level > 0) {
                    this.waitingForFirstCombat = false;
                    for (let l = 1; l <= level; l++) {
                        const s = STATES[l] ?? String(l);
                        this.recordInitial(s);
                    }
                } else {
                    this.waitingForFirstCombat = true;
                }
                this.level = level;
            } else if (this.level < 0) {
                // Fresh login - if level > 0 combat has already happened, start timer
                if (level > 0) {
                    this.waitingForFirstCombat = false;
                    for (let l = 1; l < level; l++) {
                        const s = STATES[l] ?? String(l);
                        this.recordInitial(s);
                    }
                    const state = STATES[level] ?? String(level);
                    this.record(state);
                } else if (isFreshLogin) {
                    // Level is 0 and fresh login - wait for first combat
                    this.waitingForFirstCombat = true;
                }
                this.level = level;
            } else if (level > this.level) {
                if (!isFreshLogin) {
                    // Same session (same obj_num), reconnected after page reload
                    // Track as real improvements
                    for (let l = this.level + 1; l <= level; l++) {
                        const state = STATES[l] ?? String(l);
                        this.record(state);
                    }
                } else {
                    // Different session - silently catch up
                    for (let l = this.level + 1; l <= level; l++) {
                        const state = STATES[l] ?? String(l);
                        this.recordInitial(state);
                    }
                }
                this.level = level;
            } else if (isFreshLogin && level < this.level) {
                // Level decreased since stored value (e.g., improvements absorbed between sessions)
                // Reset to current level so new improvements get recorded
                this.level = level;
            }
            if (objNum !== undefined) {
                this.lastObjNum = objNum;
            }
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
            if (objNum !== undefined) {
                this.lastObjNum = objNum;
            }
            this.persist();
        } else {
            if (objNum !== undefined) {
                this.lastObjNum = objNum;
                this.persist();
            }
        }
    }

    private isNoForm(): boolean {
        return this.optionsForm === 1 && this.stateForm < 3;
    }

    private addToLifetime(count: number, time: number, noForm?: boolean) {
        if (!this.lifetimeEnabled) return;
        const isNoFormEntry = noForm ?? this.isNoForm();
        if (!this.lifetimeLoaded) {
            this.pendingLifetime.push({count, time, noForm: isNoFormEntry});
            return;
        }
        const d = new Date(time);
        const date = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
        let day = this.lifetime[this.lifetime.length - 1];
        if (!day || day.date !== date) {
            day = {date, count: 0, noFormCount: 0};
            this.lifetime.push(day);
        }
        if (isNoFormEntry) {
            day.noFormCount = (day.noFormCount || 0) + count;
        } else {
            day.count += count;
        }
        this.persistLifetime();
    }

    private record(state: string) {
        const now = Date.now();
        const kills = this.getKills();
        const entry: ImproveEntry = {
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
        this.emitUpdate();
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
        this.waitingForFirstCombat = data.waitingForFirstCombat === true;
        this.emitUpdate();
    }

    private loadLifetime(data: any = {}) {
        const convertLegacy = (arr: any[]) => {
            const result: { date: string; count: number }[] = [];
            arr.forEach((e) => {
                const d = new Date(e.time);
                const date = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
                let day = result.find((x) => x.date === date);
                if (!day) {
                    day = {date, count: 0};
                    result.push(day);
                }
                day.count += 1;
            });
            return result;
        };
        const convertStates = (arr: any[]) =>
            arr.map((e) => ({date: e.date, count: Array.isArray(e.states) ? e.states.length : 0}));
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

    protected onReset(): void {
        this.reset();
    }

    private persist = () => {
        this.setStorage('improve_counter', {
            entries: this.entries,
            lastTime: this.lastTime,
            lastKills: this.lastKills,
            level: this.level,
            lastObjNum: this.lastObjNum,
            waitingForFirstCombat: this.waitingForFirstCombat,
        });
    };

    private persistLifetime = () => {
        this.setStorage('improve_counter_lifetime', {entries: this.lifetime, enabled: this.lifetimeEnabled});
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
                day = {date, count: 0};
                this.lifetime.push(day);
            }
            day.count += toAdd;
        }
        this.persistLifetime();
        const total = this.lifetime.reduce((sum, e) => sum + e.count, 0);
        this.client.println(
            colorString(`Dodano ${toAdd} postepow (lacznie: ${total})`, SECTION_COLOR)
        );
    }

    removeLifetime(id: number, count?: number) {
        const idx = id - 1;
        if (idx < 0 || idx >= this.lifetime.length) return;
        let removed: number;
        if (typeof count === "number") {
            const day = this.lifetime[idx];
            const n = Math.min(Math.max(1, count), day.count);
            day.count -= n;
            removed = n;
            if (day.count === 0) {
                this.lifetime.splice(idx, 1);
            }
        } else {
            removed = this.lifetime[idx].count;
            this.lifetime.splice(idx, 1);
        }
        this.persistLifetime();
        const total = this.lifetime.reduce((sum, e) => sum + e.count, 0);
        this.client.println(
            colorString(`Usunieto ${removed} postepow (lacznie: ${total})`, SECTION_COLOR)
        );
    }

    resetLifetime() {
        this.lifetime = [];
        this.persistLifetime();
        this.client.println(
            colorString("Zresetowano globalny licznik postepow.", SECTION_COLOR)
        );
    }

    addDemoData() {
        const now = new Date();
        const demoData: { date: string; count: number; noFormCount?: number }[] = [];

        // Add 10 days of demo data
        for (let i = 9; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const date = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
            const count = Math.floor(Math.random() * 20) + 5; // 5-25 normal
            const noFormCount = Math.random() > 0.5 ? Math.floor(Math.random() * 10) + 1 : 0; // 0-10 noform
            demoData.push({ date, count, noFormCount: noFormCount || undefined });
        }

        this.lifetime = demoData;
        this.persistLifetime();
        eventBus.emit("postepy2.updated");
        this.client.println(
            colorString("Dodano dane demo do postepy2.", SECTION_COLOR)
        );
    }

    mergeLifetimeData(entries: { date: string; count: number }[], mode: MergeMode = 'max') {
        const dateMap = new Map<string, { count: number; noFormCount?: number }>();
        for (const e of this.lifetime) {
            const existing = dateMap.get(e.date);
            if (existing) {
                existing.count = Math.max(existing.count, e.count);
                if (e.noFormCount) existing.noFormCount = Math.max(existing.noFormCount || 0, e.noFormCount);
            } else {
                dateMap.set(e.date, { count: e.count, noFormCount: e.noFormCount });
            }
        }
        for (const e of entries) {
            const existing = dateMap.get(e.date);
            if (existing) {
                existing.count = mode === 'add' ? existing.count + e.count : Math.max(existing.count, e.count);
            } else {
                dateMap.set(e.date, { count: e.count });
            }
        }
        this.lifetime = Array.from(dateMap.entries())
            .map(([date, v]) => ({ date, count: v.count, noFormCount: v.noFormCount }))
            .sort((a, b) => {
                const [ay, am, ad] = a.date.split('/').map(Number);
                const [by, bm, bd] = b.date.split('/').map(Number);
                return ay - by || am - bm || ad - bd;
            });
        this.persistLifetime();
        eventBus.emit("postepy2.updated");
    }

    editLifetimeEntry(index: number, count: number): boolean {
        if (index < 0 || index >= this.lifetime.length) return false;
        if (count <= 0) {
            this.lifetime.splice(index, 1);
        } else {
            this.lifetime[index].count = count;
        }
        this.persistLifetime();
        eventBus.emit("postepy2.updated");
        return true;
    }

    deleteLifetimeEntry(index: number): boolean {
        if (index < 0 || index >= this.lifetime.length) return false;
        this.lifetime.splice(index, 1);
        this.persistLifetime();
        eventBus.emit("postepy2.updated");
        return true;
    }

    setLifetimeEnabled(on: boolean) {
        this.lifetimeEnabled = on;
        this.persistLifetime();
        const msg = on
            ? "Wlaczono automatyczne dodawanie postepow."
            : "Wylaczono automatyczne dodawanie postepow.";
        this.client.println(colorString(msg, SECTION_COLOR));
    }

    getFormattedTable(): AnsiAwareBuffer {
        const WIDTH = 74;
        const INNER = WIDTH - 2;
        const pad = createPad(INNER, 1, 1);
        const header = createHeader(INNER, 2, HEADER_COLOR);

        const now = new Date();
        const avg = this.entries.length
            ? this.entries.reduce((s, e) => s + e.delta, 0) / this.entries.length
            : 0;
        const lines: AnsiAwareBuffer[] = [];
        lines.push(header("Postepy"));
        lines.push(pad());

        const todayStr = `${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()}`;
        const todayEntry = this.lifetime.find(e => e.date === todayStr);
        const todayCount = (todayEntry?.count ?? 0) + (todayEntry?.noFormCount ?? 0);

        const currentLine = new AnsiAwareBuffer();
        currentLine.appendBuffer(colorString(`Aktualny czas   : ${formatDate(now)}`, TIME_COLOR));
        currentLine.append(`    : sred ${formatDuration(avg)}       Dzisiaj: ${todayCount}`);
        lines.push(pad(currentLine));

        lines.push(pad());

        this.entries.forEach((e, idx) => {
            const entryLine = new AnsiAwareBuffer();
            entryLine.append(`${(idx + 1).toString().padStart(2, " ")}. ${e.state.padEnd(15)} : ${formatDate(new Date(e.time))} : czas ${formatDuration(e.delta)} : zabici ${e.killsMy}/${e.killsMy + e.killsTeam}`);
            lines.push(pad(entryLine));
        });

        lines.push(pad());
        lines.push(pad(colorString("ZABITYCH", SECTION_COLOR)));

        const totals = this.getKills();
        const jaLine = new AnsiAwareBuffer();
        jaLine.appendBuffer(colorString("JA ... :", LABEL_COLOR));
        jaLine.append(" ");
        jaLine.appendBuffer(colorString(String(totals.my), COUNT_COLOR));
        lines.push(pad(jaLine));

        const wszyscyLine = new AnsiAwareBuffer();
        wszyscyLine.appendBuffer(colorString("WSZYSCY:", LABEL_COLOR));
        wszyscyLine.append(" ");
        wszyscyLine.appendBuffer(colorString(String(totals.my + totals.team), COUNT_COLOR));
        lines.push(pad(wszyscyLine));

        lines.push(pad());

        // When waiting for first combat, show 0:00 instead of time since login
        const effectiveLastTime = this.waitingForFirstCombat ? Date.now() : this.lastTime;
        const effectiveLastKills = this.waitingForFirstCombat ? totals : this.lastKills;
        const since = Date.now() - effectiveLastTime;
        const myDelta = totals.my - effectiveLastKills.my;
        const teamDelta = totals.team - effectiveLastKills.team;
        const sinceLine = colorString(
            `Od ostatniego postepu: ${formatDuration(since)} : zabici: ${myDelta}/${myDelta + teamDelta}`,
            POSTEP_COLOR
        );
        lines.push(pad(sinceLine));

        lines.push(pad());
        lines.push(new AnsiAwareBuffer(`+${"-".repeat(INNER)}+`));

        const output = new AnsiAwareBuffer();
        lines.forEach((line, i) => {
            if (i > 0) output.append("\n");
            output.appendBuffer(line);
        });

        return output;
    }

    show() {
        const output = new AnsiAwareBuffer("\n\n");
        output.appendBuffer(this.getFormattedTable());
        output.append("\n\n");
        this.client.print(output);
    }

    private formatLifetimeTable(): AnsiAwareBuffer {
        const WIDTH = 57;
        const INNER = WIDTH - 2;
        const pad = createPad(INNER, 1, 1);
        const lines: AnsiAwareBuffer[] = [];
        lines.push(new AnsiAwareBuffer(`+${"-".repeat(INNER)}+`));
        lines.push(pad());

        const name = titleCase(characterStorage.getCharacter() || "");
        const nameLine = new AnsiAwareBuffer("POSTAC: ");
        nameLine.appendBuffer(colorString(name, NAME_COLOR));
        lines.push(pad(nameLine));

        lines.push(pad());

        this.lifetime.forEach((e, idx) => {
            const entryLine = new AnsiAwareBuffer();
            entryLine.append(`[${String(idx + 1).padStart(4, " ")}] `);
            entryLine.appendBuffer(colorString(e.date, DATE_COLOR));
            entryLine.append(`    - ${formatCount(e.count)}`);
            lines.push(pad(entryLine));
        });

        lines.push(pad());
        lines.push(pad(new AnsiAwareBuffer("      ------------------------------------")));
        lines.push(pad());

        const total = this.lifetime.reduce((sum, e) => sum + e.count, 0);
        const approx = (total / 15).toFixed(2);

        const totalLine = new AnsiAwareBuffer();
        totalLine.appendBuffer(colorString("WSZYSTKICH DO TEJ PORY:", TOTAL_LABEL_COLOR));
        totalLine.append(" ");
        totalLine.appendBuffer(colorString(`${total} postepow`, HEADER_COLOR));
        lines.push(pad(totalLine));

        const approxLine = new AnsiAwareBuffer("                         ");
        approxLine.appendBuffer(colorString(`~${approx} niebotycznych`, HEADER_COLOR));
        lines.push(pad(approxLine));

        lines.push(pad());
        lines.push(new AnsiAwareBuffer(`+${"-".repeat(INNER)}+`));

        const output = new AnsiAwareBuffer();
        lines.forEach((line, i) => {
            if (i > 0) output.append("\n");
            output.appendBuffer(line);
        });

        return output;
    }

    showLifetime() {
        const output = new AnsiAwareBuffer("\n");
        output.appendBuffer(this.formatLifetimeTable());
        output.append("\n");
        this.client.print(output);
    }
}

export function initImproveCounter(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
): ImproveCounter {
    const counter = new ImproveCounter(client);
    if (aliases) {
        aliases.push({pattern: /\/postepy$/, callback: () => counter.show()});
        aliases.push({pattern: /\/postepyw$/, callback: () => eventBus.emit("postepy.popup.open")});
        aliases.push({pattern: /\/postepy_reset$/, callback: () => counter.reset()});
        aliases.push({pattern: /\/postepy2$/, callback: () => counter.showLifetime()});
        aliases.push({pattern: /\/postepy2w$/, callback: () => eventBus.emit("postepy2.popup.open")});
        aliases.push({pattern: /\/postepy2_reset$/, callback: () => counter.resetLifetime()});
        aliases.push({pattern: /\/postepy2_demo$/, callback: () => counter.addDemoData()});
        aliases.push({pattern: /\/postepy2_off$/, callback: () => counter.setLifetimeEnabled(false)});
        aliases.push({pattern: /\/postepy2_on$/, callback: () => counter.setLifetimeEnabled(true)});
        aliases.push({pattern: /\/postepy2\+$/, callback: () => counter.addLifetime(1)});
        aliases.push({
            pattern: /\/postepy2\+ ([0-9]+)$/,
            callback: (m: RegExpMatchArray) => counter.addLifetime(parseInt(m[1], 10))
        });
        aliases.push({
            pattern: /\/postepy2\+ ([0-9]+) ([0-9]+)$/,
            callback: (m: RegExpMatchArray) => counter.addLifetime(parseInt(m[2], 10), parseInt(m[1], 10))
        });
        aliases.push({
            pattern: /\/postepy2- ([0-9]+)$/,
            callback: (m: RegExpMatchArray) => counter.removeLifetime(parseInt(m[1], 10))
        });
        aliases.push({
            pattern: /\/postepy2- ([0-9]+) ([0-9]+)$/,
            callback: (m: RegExpMatchArray) => counter.removeLifetime(parseInt(m[1], 10), parseInt(m[2], 10))
        });
    }
    return counter;
}
