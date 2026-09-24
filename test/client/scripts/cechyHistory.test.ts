import initLvlCalc, { calcStatSum } from "@client/scripts/lvlCalc";
import initCechyHistory, {
    CechyHistoryEntry,
    getCechyHistory,
    sanitizeCechyHistory,
} from "@client/scripts/cechyHistory";
import Triggers from "@client/Triggers";
import { AnsiAwareBuffer } from "@client/ansi/FormatState";
import { characterStorage } from "@modules/core/storage";
import eventBus from "@modules/core/eventBus";
import { gmcp, setGmcp } from "@client/gmcp";

/** The global postepy counter is a singleton owned by another script; only its
 *  lifetime read-out matters here. */
const { lifetime } = vi.hoisted(() => ({
    lifetime: { entries: [] as { date: string; count: number }[] },
}));

vi.mock("@client/scripts/improveCounter", () => ({
    getLifetimeData: () => lifetime.entries,
}));

class FakeClient {
    Triggers = new Triggers({} as unknown as any);
    println = jest.fn();
    print = jest.fn();
    send = jest.fn();
    sendGMCP = jest.fn();
}

/** The `cechy` block exactly as the game prints it, with `sila` buffed. */
const LINES = [
    "Jestes mocarny i troche ci brakuje, zebys mogl wyzej ocenic swa sile.                      ( +kulczyba )",
    "Jestes zreczny i bardzo niewiele ci brakuje, zebys mogl wyzej ocenic swa zrecznosc.",
    "Jestes atletyczny i niewiele ci brakuje, zebys mogl wyzej ocenic swa wytrzymalosc.",
    "Jestes bystry i bardzo duzo ci brakuje, zebys mogl wyzej ocenic swoj intelekt.",
    "Jestes dzielny i troche ci brakuje, zebys mogl wyzej ocenic swa odwage.",
];

const CLOSING_LINE = "Obecnie do waznych cech zaliczasz: sile, zrecznosc.";
const WEAKENED_LINE =
    "Twoje cechy sa oslabione po ostatniej smierci. By je odbudowac potrzebujesz zdobyc jeszcze 3 postepy.";

describe("cechy history", () => {
    let client: FakeClient;
    let runCechy: () => void;
    let dispose: () => void;

    function parse(line: string) {
        return Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), "");
    }

    /** Feeds a full `cechy` read-out and lets the publish grace period elapse. */
    function readCechy(lines: string[] = LINES, trailing: string[] = []) {
        runCechy();
        lines.forEach(parse);
        parse(CLOSING_LINE);
        trailing.forEach(parse);
        jest.advanceTimersByTime(600);
    }

    beforeEach(() => {
        jest.useFakeTimers();
        localStorage.clear();
        characterStorage.setCharacter("TestChar");
        setGmcp("char.options.state_modifiers", 1);
        lifetime.entries = [];

        client = new FakeClient();
        const aliases: { pattern: RegExp; callback: Function }[] = [];
        initLvlCalc(client as unknown as any, aliases);
        dispose = initCechyHistory(client as unknown as any, aliases);
        runCechy = () => aliases.find((a) => a.pattern.source === "^cechy$")!.callback();
    });

    afterEach(() => {
        dispose();
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        localStorage.clear();
    });

    test("skips the modified trait and records the rest", () => {
        readCechy();

        const history = getCechyHistory();
        expect(history).toHaveLength(1);
        expect(history[0].stats.sila).toBeNull();
        expect(history[0].stats.zrecznosc).toEqual({ value: 6, step: 4, sum: 29 });
        expect(history[0].stats.wytrzymalosc).toEqual({ value: 8, step: 3, sum: 38 });
        expect(history[0].stats.inteligencja).toEqual({ value: 6, step: 0, sum: 25 });
        expect(history[0].stats.odwaga).toEqual({ value: 6, step: 2, sum: 27 });
        // sila is unknown, so the total covers the four traits that were read.
        expect(history[0].total).toBe(119);
        expect(history[0].estimated).toBe(true);
    });

    test("carries the last known value forward once the modifier is gone", () => {
        readCechy();
        readCechy([LINES[0].replace(/\s+\( \+kulczyba \)$/, ""), ...LINES.slice(1)]);

        const history = getCechyHistory();
        expect(history).toHaveLength(2);
        expect(history[1].stats.sila).toEqual({ value: 8, step: 2, sum: 37 });
        expect(history[1].total).toBe(156);
        expect(history[1].estimated).toBe(false);

        // A later modified read-out reuses the value we already know.
        readCechy([...LINES.slice(0, 1), ...LINES.slice(1, 4), "Jestes nieugiety i troche ci brakuje, zebys mogl wyzej ocenic swa odwage."]);
        const [, , third] = getCechyHistory();
        expect(third.stats.sila).toBeNull();
        expect(third.total).toBe(37 + 29 + 38 + 25 + 32);
        expect(third.estimated).toBe(true);
    });

    test("records nothing when the read-out is unchanged", () => {
        readCechy();
        readCechy();
        readCechy();

        expect(getCechyHistory()).toHaveLength(1);
    });

    test("ignores a read-out weakened by death", () => {
        readCechy(LINES, [WEAKENED_LINE]);

        expect(getCechyHistory()).toHaveLength(0);
    });

    test("ignores a read-out whose death notice comes before the closing line", () => {
        runCechy();
        LINES.forEach(parse);
        parse(WEAKENED_LINE);
        parse(CLOSING_LINE);
        jest.advanceTimersByTime(600);

        expect(getCechyHistory()).toHaveLength(0);
    });

    test("does not carry the death notice over into the next read-out", () => {
        readCechy(LINES, [WEAKENED_LINE]);
        readCechy();

        expect(getCechyHistory()).toHaveLength(1);
    });

    test("skips a read-out with a trait below its last known value", () => {
        readCechy();
        // Weakened by death, but the notice never made it through.
        readCechy([...LINES.slice(0, 4), "Jestes odwazny i troche ci brakuje, zebys mogl wyzej ocenic swa odwage."]);

        expect(getCechyHistory()).toHaveLength(1);
    });

    test("cleans stored read-outs taken while weakened when loading", () => {
        const stat = (value: number, step: number) => ({ value, step, sum: calcStatSum(value, step) });
        const real = { sila: stat(8, 2), zrecznosc: stat(6, 4), wytrzymalosc: stat(8, 3), inteligencja: stat(6, 0), odwaga: stat(6, 2) };
        const stored: CechyHistoryEntry[] = [
            { time: 1, stats: real, total: 156, estimated: false, postepy: 100 },
            // Weakened: everything lower.
            { time: 2, stats: { ...real, sila: stat(7, 0), odwaga: stat(5, 0) }, total: 140, estimated: false, postepy: 101 },
            // Part-way back: still below the pre-death sila.
            { time: 3, stats: { ...real, sila: stat(8, 0) }, total: 154, estimated: false, postepy: 110 },
            // Fully recovered: equal to the first entry, so no real change.
            { time: 4, stats: real, total: 156, estimated: false, postepy: 120 },
            // A real gain, with sila modified at the time.
            { time: 5, stats: { ...real, sila: null, odwaga: stat(6, 3) }, total: 0, estimated: true, postepy: 130 },
        ];
        characterStorage.setCharacter("Other");
        localStorage.setItem("TestChar:cechy_history", JSON.stringify(stored));
        characterStorage.setCharacter("TestChar");

        const history = getCechyHistory();
        expect(history.map((e) => e.time)).toEqual([1, 5]);
        // sila falls back to the pre-death reading, not a weakened one.
        expect(history[1].total).toBe(157);
        expect(history[1].estimated).toBe(true);
        expect(history[1].postepy).toBe(130);
        expect(characterStorage.get("cechy_history")).toEqual(history);
    });

    test("leaves a clean history untouched", () => {
        const entries = [
            { time: 1, stats: { sila: { value: 8, step: 2, sum: 37 } }, total: 37, estimated: true },
            { time: 2, stats: { sila: { value: 8, step: 3, sum: 38 } }, total: 38, estimated: true },
        ];

        expect(sanitizeCechyHistory(entries)).toBe(entries);
    });

    test("records nothing, and stays quiet, when state_modifiers is off", () => {
        setGmcp("char.options.state_modifiers", 0);

        readCechy();

        expect(getCechyHistory()).toHaveLength(0);
        // The popup surfaces this; the game output must not be spammed.
        const printed = client.println.mock.calls.map(([b]) => b?.text ?? b).join("\n");
        expect(printed).not.toContain("state_modifiers");
    });

    test("turns the option on via GMCP on request", () => {
        setGmcp("char.options.state_modifiers", 0);

        eventBus.emit("cechy.enableModifiers");

        expect(client.sendGMCP).toHaveBeenCalledWith("char.options", { state_modifiers: 1 });
        expect(gmcp.char.options.state_modifiers).toBe(1);

        readCechy();
        expect(getCechyHistory()).toHaveLength(1);
    });

    // The game's spacing around the modifier varies, and a modifier can itself
    // contain parentheses. Every one of these must still count as modified.
    test.each([
        "                      ( +kulczyba )",
        " ( +kulczyba )",
        "\t( +kulczyba )",
        "   (+kulczyba)",
        "   (  +kulczyba  )",
        "   ( +2 )",
        "   ( -kulczyba )",
        "   ( +kulczyba +blogoslawienstwo )",
        "   ( +eliksir (maly) )",
    ])("treats %j as a modifier", (suffix) => {
        readCechy([`${LINES[0].replace(/\s+\( \+kulczyba \)$/, "")}${suffix}`, ...LINES.slice(1)]);

        expect(getCechyHistory()[0].stats.sila).toBeNull();
    });

    test("keeps reading a trait whose line carries no modifier", () => {
        readCechy([LINES[0].replace(/\s+\( \+kulczyba \)$/, ""), ...LINES.slice(1)]);

        expect(getCechyHistory()[0].stats.sila).toEqual({ value: 8, step: 2, sum: 37 });
    });

    test("reads the masculine nadludzki poziom line", () => {
        readCechy([
            ...LINES.slice(0, 3),
            "Twoj intelekt osiagnal nadludzki poziom.",
            LINES[4],
        ]);

        expect(getCechyHistory()[0].stats.inteligencja).toEqual({ value: 10, step: 0, sum: 45 });
    });

    test("still annotates a modified line in the output", () => {
        runCechy();
        const annotated = parse(LINES[0]);

        expect(annotated?.text).toContain("[37]");
        expect(annotated?.text).toContain("mocarny [8/10]");
        expect(annotated?.text).toContain("troche [2/5]");
    });

    test("stamps each read-out with the lifetime postepy count", () => {
        lifetime.entries = [{ date: "2026/8/1", count: 120 }];
        readCechy();

        lifetime.entries = [
            { date: "2026/8/1", count: 120 },
            { date: "2026/8/2", count: 23 },
        ];
        readCechy([LINES[0].replace(/\s+\( \+kulczyba \)$/, ""), ...LINES.slice(1)]);

        const [first, second] = getCechyHistory();
        expect(first.postepy).toBe(120);
        expect(second.postepy).toBe(143);
        // The gap is what the change between the two read-outs cost.
        expect(second.postepy! - first.postepy!).toBe(23);
    });

    test("leaves postepy out when the global counter has no data", () => {
        readCechy();

        expect(getCechyHistory()[0].postepy).toBeUndefined();
    });

    test("persists the history for the character", () => {
        readCechy();

        expect(characterStorage.get("cechy_history")).toHaveLength(1);
    });
});
