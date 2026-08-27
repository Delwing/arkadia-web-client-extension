import Client from "../Client";
import { characterStorage } from "@modules/core/storage";
import { mudletColorLine } from "@modules/core/Colors";
import eventBus from "@modules/core/eventBus";

export const STORAGE_KEY = "profession";
export const FULL_PROFESSION_POINTS = 240;
export const WEEKLY_POINTS = 10;
export const PLUS_POINT = 3;
export const ONE_WEEK_IN_SECONDS = 604800;

export interface ProfessionState {
    start_time: number;
    plus_events: number[];
}

interface LegacyProfessionState {
    start_time: number;
    plus_points: number;
}

type StoredProfessionState = ProfessionState | LegacyProfessionState;

function migrateLegacy(legacy: LegacyProfessionState): ProfessionState {
    const eventCount = Math.round(legacy.plus_points / PLUS_POINT);
    const plus_events: number[] = [];
    for (let i = 0; i < eventCount; i++) {
        plus_events.push(legacy.start_time + i + 1);
    }
    return { start_time: legacy.start_time, plus_events };
}

function normalize(state: StoredProfessionState): ProfessionState {
    if ('plus_events' in state) return state as ProfessionState;
    return migrateLegacy(state as LegacyProfessionState);
}

export function getState(): ProfessionState | null {
    const raw = characterStorage.get(STORAGE_KEY) as unknown as StoredProfessionState | undefined ?? null;
    if (!raw) return null;

    const state = normalize(raw);
    // Persist migration if needed
    if (!('plus_events' in raw)) {
        setState(state);
    }
    return state;
}

export function setState(state: ProfessionState): void {
    characterStorage.set(STORAGE_KEY, state as any);
}

export function getTimePoints(state: ProfessionState, time: number): number {
    return WEEKLY_POINTS * getNumberOfWeeks(state, time);
}

export function getNumberOfWeeks(state: ProfessionState, time: number): number {
    const firstBreakPoint = getNextBreakPoint(state.start_time);
    const timeDiff = (time - firstBreakPoint) / ONE_WEEK_IN_SECONDS;
    return Math.floor(timeDiff) + 1;
}

export function getNextBreakPoint(time: number): number {
    const date = new Date(time * 1000);
    // Get day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    // In Lua: wday 1 = Sunday, 2 = Monday, etc. Target is 2 (Monday at 2:00)
    // Formula: (9 - date.wday) % 7 in Lua, where wday 1 = Sunday
    // In JS: (8 - date.getDay()) % 7, where getDay() 0 = Sunday
    const dateDiff = (8 - date.getDay()) % 7;
    date.setDate(date.getDate() + dateDiff);
    date.setHours(2, 0, 0, 0);

    let nextBreakpoint = Math.floor(date.getTime() / 1000);
    if (nextBreakpoint < time) {
        nextBreakpoint += ONE_WEEK_IN_SECONDS;
    }
    return nextBreakpoint;
}

export function getPlusPoints(state: ProfessionState): number {
    return state.plus_events.length * PLUS_POINT;
}

function printLog(client: Client, message: string): void {
    client.println(mudletColorLine(`<CadetBlue>(skrypty)<reset>: ${message}`));
}

function initTraining(client: Client, plusPoints: number): void {
    const startTime = Math.floor(Date.now() / 1000);
    const eventCount = Math.round(plusPoints / PLUS_POINT);
    const plus_events: number[] = [];
    for (let i = 0; i < eventCount; i++) {
        plus_events.push(startTime + i + 1);
    }
    const state: ProfessionState = {
        start_time: startTime,
        plus_events,
    };
    setState(state);
    eventBus.emit("profession.updated");
    printLog(client, "Rozpoczeto trening zawodu");
    showPercentage(client);
}

function addPlusPoint(client: Client): void {
    const state = getState();
    if (!state) {
        printLog(client, "Zliczanie stazu w zawodzie nie zostalo zainicjalizowane");
        return;
    }
    state.plus_events.push(Math.floor(client.now() / 1000));
    setState(state);
    eventBus.emit("profession.updated");
    showPercentage(client);
}

function showPercentage(client: Client): void {
    const state = getState();
    if (!state?.start_time) {
        printLog(client, "Zliczanie stazu w zawodzie nie zostalo zainicjalizowane");
        return;
    }
    const currentTime = Math.floor(Date.now() / 1000);
    const total = getTimePoints(state, currentTime) + getPlusPoints(state);
    const percentage = (total / FULL_PROFESSION_POINTS) * 100;
    printLog(
        client,
        `Zawod ukonczony w ${percentage.toFixed(2)}% (${total}/${FULL_PROFESSION_POINTS})`
    );
}

/**
 * Merge two profession states using CRDT grow-only set semantics.
 * Takes the union of plus_events arrays (deduplicated) and the earlier start_time.
 * Handles both legacy and new format on either side.
 */
export function mergeProfessionStates(
    local: StoredProfessionState | null,
    cloud: StoredProfessionState | null
): ProfessionState | null {
    if (!local && !cloud) return null;
    if (!local) return normalize(cloud!);
    if (!cloud) return normalize(local);

    const normalLocal = normalize(local);
    const normalCloud = normalize(cloud);

    const start_time = Math.min(normalLocal.start_time, normalCloud.start_time);
    const eventSet = new Set([...normalLocal.plus_events, ...normalCloud.plus_events]);
    const plus_events = Array.from(eventSet).sort((a, b) => a - b);

    return { start_time, plus_events };
}

export default function initProfession(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
): void {
    const aliasList = aliases ?? client.aliases;

    // Alias: /zawod - open profession popup
    aliasList.push({
        pattern: /^\/zawod$/,
        callback: () => {
            eventBus.emit("profession.popup.open");
        },
    });

    // Alias: /staz ?(.*)
    aliasList.push({
        pattern: /^\/staz(?:\s+(.*))?$/,
        callback: (matches: RegExpMatchArray) => {
            const value = matches[1]?.trim();
            if (value) {
                const numValue = parseInt(value, 10);
                if (!isNaN(numValue)) {
                    initTraining(client, numValue);
                } else {
                    showPercentage(client);
                }
            } else {
                showPercentage(client);
            }
        },
    });

    // Trigger: Twoja wysoka forma pozwala ci nieznacznie przyspieszyc nauke zawodu.
    client.Triggers.registerTrigger(
        /Twoja wysoka forma pozwala ci nieznacznie przyspieszyc nauke zawodu\./,
        (line) => {
            addPlusPoint(client);
            return line;
        },
        "profession"
    );

    // Trigger: Decydujesz sie porzucic stary fach i rozpoczynasz trening w zawodzie
    client.Triggers.registerTrigger(
        /Decydujesz sie porzucic stary fach i rozpoczynasz trening w zawodzie/,
        (line) => {
            client.println(
                mudletColorLine(`<CadetBlue>(skrypty)<tomato>: Jezeli rozpoczynasz trenowanie nowego zawodu wpisz /staz 0`)
            );
            printLog(
                client,
                "Jezeli znasz wartosc stazu (240 pelny staz, 10 punktow za tydzien, 3 punkt za +staz) wpisz /staz [liczba]"
            );
            return line;
        },
        "profession"
    );
}
