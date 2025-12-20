import Client from "../Client";
import { getItemSync, setItemSync } from "@modules/core/storage";
import { mudletColorLine } from "@modules/core/Colors";

const STORAGE_KEY = "profession";
const FULL_PROFESSION_POINTS = 240;
const WEEKLY_POINTS = 10;
const PLUS_POINT = 3;
const ONE_WEEK_IN_SECONDS = 604800;

interface ProfessionState {
    start_time: number;
    plus_points: number;
}

function getState(): ProfessionState | null {
    const stored = getItemSync(STORAGE_KEY);
    return stored?.[STORAGE_KEY] ?? null;
}

function setState(state: ProfessionState): void {
    setItemSync(STORAGE_KEY, state);
}

function getTimePoints(state: ProfessionState, time: number): number {
    return WEEKLY_POINTS * getNumberOfWeeks(state, time);
}

function getNumberOfWeeks(state: ProfessionState, time: number): number {
    const firstBreakPoint = getNextBreakPoint(state.start_time);
    const timeDiff = (time - firstBreakPoint) / ONE_WEEK_IN_SECONDS;
    return Math.floor(timeDiff) + 1;
}

function getNextBreakPoint(time: number): number {
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

function printLog(client: Client, message: string): void {
    client.println(mudletColorLine(`<CadetBlue>(skrypty)<reset>: ${message}`));
}

function initTraining(client: Client, plusPoints: number): void {
    const state: ProfessionState = {
        start_time: Math.floor(Date.now() / 1000),
        plus_points: plusPoints,
    };
    setState(state);
    printLog(client, "Rozpoczeto trening zawodu");
    showPercentage(client);
}

function addPlusPoint(client: Client): void {
    const state = getState();
    if (!state) {
        printLog(client, "Zliczanie stazu w zawodzie nie zostalo zainicjalizowane");
        return;
    }
    state.plus_points += PLUS_POINT;
    setState(state);
    showPercentage(client);
}

function showPercentage(client: Client): void {
    const state = getState();
    if (!state?.start_time) {
        printLog(client, "Zliczanie stazu w zawodzie nie zostalo zainicjalizowane");
        return;
    }
    const currentTime = Math.floor(Date.now() / 1000);
    const total = getTimePoints(state, currentTime) + state.plus_points;
    const percentage = (total / FULL_PROFESSION_POINTS) * 100;
    printLog(
        client,
        `Zawod ukonczony w ${percentage.toFixed(2)}% (${total}/${FULL_PROFESSION_POINTS})`
    );
}

function resetProfession(client: Client): void {
    initTraining(client, 0);
}

export default function initProfession(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
): void {
    const aliasList = aliases ?? client.aliases;

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
