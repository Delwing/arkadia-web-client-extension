import Client from "../Client";
import { createColorFormat } from "@modules/core/Colors";
import { AnsiAwareBuffer } from "@client/ansi/FormatState";
import eventBus from "@modules/core/eventBus";

const GREEN = createColorFormat("#00ff00");
const RED = createColorFormat("#ff0000");
const YELLOW = createColorFormat("#ffff00");
const TOMATO = createColorFormat("#ff6347");

const statToNumber: Record<string, number> = {
    "slabiutki": 1,
    "slabiutka": 1,
    "watly": 2,
    "watla": 2,
    "slaby": 3,
    "slaba": 3,
    "krzepki": 4,
    "krzepka": 4,
    "silny": 5,
    "silna": 5,
    "mocny": 6,
    "mocna": 6,
    "potezny": 7,
    "potezna": 7,
    "mocarny": 8,
    "mocarna": 8,
    "epicko silny": 9,
    "epicko silna": 9,
    "nieskoordynowany": 1,
    "nieskoordynowana": 1,
    "niezreczny": 2,
    "niezreczna": 2,
    "niezgrabny": 3,
    "niezgrabna": 3,
    "sprawny": 4,
    "sprawna": 4,
    "zwinny": 5,
    "zwinna": 5,
    "zreczny": 6,
    "zreczna": 6,
    "gibki": 7,
    "gibka": 7,
    "akrobatyczny": 8,
    "akrobatyczna": 8,
    "epicko zreczny": 9,
    "epicko zreczna": 9,
    "charlawy": 1,
    "cherlawa": 1,
    "rachityczny": 2,
    "rachityczna": 2,
    "mizerny": 3,
    "mizerna": 3,
    "dobrze zbudowany": 4,
    "dobrze zbudowana": 4,
    "wytrzymaly": 5,
    "wytrzymala": 5,
    "twardy": 6,
    "twarda": 6,
    "muskularny": 7,
    "muskularna": 7,
    "atletyczny": 8,
    "atletyczna": 8,
    "epicko wytrzymaly": 9,
    "epicko wytrzymala": 9,
    "bezmyslny": 1,
    "bezmyslna": 1,
    "tepy": 2,
    "tepa": 2,
    "ograniczony": 3,
    "ograniczona": 3,
    "pojetny": 4,
    "pojetna": 4,
    "inteligentny": 5,
    "inteligentna": 5,
    "bystry": 6,
    "bystra": 6,
    "blyskotliwy": 7,
    "blyskotliwa": 7,
    "genialny": 8,
    "genialna": 8,
    "epicko inteligentny": 9,
    "epicko inteligentna": 9,
    "thorzliwy": 1,
    "thorzliwa": 1,
    "strachliwy": 2,
    "strachliwa": 2,
    "niepewny": 3,
    "niepewna": 3,
    "zdecydowany": 4,
    "zdecydowana": 4,
    "odwazny": 5,
    "odwazna": 5,
    "dzielny": 6,
    "dzielna": 6,
    "nieugiety": 7,
    "nieugieta": 7,
    "nieustraszony": 8,
    "nieustraszona": 8,
    "epicko odwazny": 9,
    "epicko odwazna": 9,
    "nadludzki poziom": 10,
};

const valToNextNumber: Record<string, number> = {
    "bardzo duzo": 0,
    "duzo": 1,
    "troche": 2,
    "niewiele": 3,
    "bardzo niewiele": 4,
};

/** Subcech totals at which each successive experience level starts. */
export const LEVEL_THRESHOLDS = [
    58,
    70,
    82,
    94,
    106,
    118,
    130,
    142,
    154,
    166,
    178,
    190,
];

const realLvlString: Record<number, string> = {
    1: "ktos niedoswiadczony",
    2: "ktos kto widzial juz to i owo",
    3: "ktos kto pewnie stapa po swiecie",
    4: "ktos kto niejedno widzial",
    5: "ktos kto swoje przezyl",
    6: "ktos doswiadczony",
    7: "ktos kto wiele przeszedl",
    8: "ktos kto widzial kawal swiata",
    9: "ktos bardzo doswiadczony",
    10: "ktos kto zwiedzil caly swiat",
    11: "ktos wielce doswiadczony",
    12: "ktos kto widzial i doswiadczyl wszystkiego",
    13: "osoba owiana legenda",
};

/** Canonical trait keys, in the order the game prints them. */
export const CECHA_ORDER = ["sila", "zrecznosc", "wytrzymalosc", "inteligencja", "odwaga"] as const;

export type CechaKey = typeof CECHA_ORDER[number];

export const CECHA_LABELS: Record<CechaKey, string> = {
    sila: "Sila",
    zrecznosc: "Zrecznosc",
    wytrzymalosc: "Wytrzymalosc",
    inteligencja: "Inteligencja",
    odwaga: "Odwaga",
};

/** Highest trait level (`nadludzki poziom`). */
export const CECHA_MAX_LEVEL = 10;
/** Number of sub-levels between two trait levels. */
export const CECHA_STEPS = 5;

/**
 * The nouns the game uses for a trait, both in the `ocenic swa <noun>` phrasing
 * and in the `Twoja <noun> osiagnela` one, mapped to the canonical key.
 */
const nounToCecha: Record<string, CechaKey> = {
    sile: "sila",
    sila: "sila",
    zrecznosc: "zrecznosc",
    wytrzymalosc: "wytrzymalosc",
    intelekt: "inteligencja",
    inteligencja: "inteligencja",
    odwage: "odwaga",
    odwaga: "odwaga",
};

/**
 * The named groups both `cechy` line patterns expose. `next` is absent on the
 * `nadludzki poziom` line (there is nothing left to progress towards) and
 * `modifier` is absent unless the trait is currently modified.
 */
interface CechaMatch {
    /** The trait adjective, e.g. `mocarny`, or the literal `nadludzki poziom`. */
    desc: string;
    /** How much is left to the next level, e.g. `troche`. */
    next?: string;
    /** The trait noun as printed, e.g. `sile` / `intelekt`. */
    noun?: string;
    /** Contents of the trailing `( +cos )` annotation, without the parentheses. */
    modifier?: string;
}

/**
 * The trailing `( +cos )` annotation the game appends when `state_modifiers` is
 * on. Spacing around the parentheses varies, and a modifier may itself contain
 * parentheses, so the contents stay permissive and the closing `)` is pinned to
 * the end of the line.
 */
const MODIFIER_SUFFIX = String.raw`(?:\s+\(\s*(?<modifier>[+-].*?)\s*\))?$`;

/** `Jestes mocarny i troche ci brakuje, zebys mogl wyzej ocenic swa sile.` */
const CECHA_LINE = new RegExp(
    String.raw`^Jestes (?<desc>[a-z ]+) i (?<next>[a-z ]+) ci brakuje, zebys mogla? wyzej ocenic sw(?:a|oj) (?<noun>[a-z]+)\.` +
    MODIFIER_SUFFIX,
);

/** `Twoja sila osiagnela nadludzki poziom.` */
const CECHA_MAX_LINE = new RegExp(
    String.raw`^Tw(?:oja|oj) (?<noun>[a-z]+) osiagn(?:ela|al) (?<desc>nadludzki poziom)\.` +
    MODIFIER_SUFFIX,
);

/**
 * `Twoje cechy sa oslabione po ostatniej smierci.` — printed after the read-out
 * when death has temporarily lowered every trait.
 */
const WEAKENED_LINE = /^Twoje cechy sa oslabione po ostatniej smierci\./;

/** How long to wait after the closing line for the weakened notice to arrive. */
const WEAKENED_GRACE_MS = 500;

/** A single trait as read from one `cechy` line. */
export interface CechaReading {
    /** Canonical trait key, or null when the noun was not recognized. */
    key: CechaKey | null;
    /** The adjective the game printed, e.g. `mocarny`. */
    desc: string;
    /** Trait level, 1..10. */
    value: number;
    /** Progress towards the next level, 0..4. */
    step: number;
    /** Trait value expressed in subcech. */
    sum: number;
    /**
     * Raw contents of the trailing `( +cos )` annotation, present only when the
     * `state_modifiers` GMCP option is on AND the trait is currently modified.
     * Such a reading does not reflect the real trait and must not be recorded.
     */
    modifier?: string;
}

/** A full `cechy` read-out. */
export interface CechySnapshot {
    time: number;
    readings: CechaReading[];
    /** Sum of every reading, in subcech (includes modified traits as printed). */
    total: number;
    level: LevelInfo;
    /**
     * True when death has temporarily lowered every trait. Such a read-out shows
     * no real value for any trait and must not be recorded.
     */
    weakened: boolean;
}

/** Where a subcech total places the character on the experience-level ladder. */
export interface LevelInfo {
    /** Index into `realLvlString` of the level the character currently holds. */
    level: number;
    /** Name of the current level. */
    name: string;
    /** Name of the next level, or null once the ladder is maxed out. */
    nextName: string | null;
    total: number;
    /** Subcech total at which the current level started. */
    from: number;
    /** Subcech total needed for the next level, or null once maxed out. */
    to: number | null;
    /** Subcech still missing for the next level (0 once maxed out). */
    missing: number;
    /** Subcech gained past the last threshold (0 until maxed out). */
    extra: number;
}

export function calcStatSum(stat: number, step: number) {
    return (stat - 1) * 5 + step;
}

/** Resolves a subcech total into its position on the experience-level ladder. */
export function describeLevel(total: number): LevelInfo {
    let level = 1;
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
        level = i + 1;
        if (total < LEVEL_THRESHOLDS[i]) break;
    }
    const maxed = total >= 190;
    const threshold = LEVEL_THRESHOLDS[level - 1];
    return {
        level,
        name: realLvlString[maxed ? level + 1 : level],
        nextName: maxed ? null : realLvlString[level + 1] ?? null,
        total,
        from: level > 1 ? LEVEL_THRESHOLDS[level - 2] : 0,
        to: maxed ? null : threshold,
        missing: maxed ? 0 : threshold - total,
        extra: maxed ? total - threshold : 0,
    };
}

export default function initLvlCalc(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    let prevStats: number[] = [];
    let prevSteps: number[] = [];
    let currentStats: number[] = [];
    let currentSteps: number[] = [];
    let currentReadings: CechaReading[] = [];
    let pendingSnapshot: CechySnapshot | null = null;
    let publishTimer: ReturnType<typeof setTimeout> | undefined;
    let isRunning = false;
    const tag = "lvlCalc";
    const weakenedTag = "lvlCalcWeakened";

    function collectStat({ desc, next, noun, modifier }: CechaMatch) {
        const value = statToNumber[desc];
        const step = next ? valToNextNumber[next] : 0;
        currentStats.push(value);
        currentSteps.push(step);
        currentReadings.push({
            key: noun ? nounToCecha[noun] ?? null : null,
            desc,
            value,
            step,
            sum: calcStatSum(value, step),
            ...(modifier ? { modifier } : {}),
        });
        return { value, step };
    }

    function formatLine(buffer: AnsiAwareBuffer, match: CechaMatch) {
        const { desc, next } = match;
        const { value, step } = collectStat(match);

        // Insert annotation after the stat description (without changing original colors)
        const descIndex = buffer.text.indexOf(desc);
        if (descIndex !== -1) {
            buffer.insert(descIndex + desc.length, ` [${value}/10]`, GREEN);
        }

        // Insert annotation after the next level indicator if present (without changing original colors)
        if (next) {
            const nextIndex = buffer.text.indexOf(next);
            if (nextIndex !== -1) {
                buffer.insert(nextIndex + next.length, ` [${step}/5]`, GREEN);
            }
        }

        // Build the prefix
        const index = currentStats.length - 1;
        const sum = calcStatSum(value, step);
        const prefixBuffer = new AnsiAwareBuffer();
        prefixBuffer.append(`[${sum}]`, GREEN);

        if (typeof prevStats[index] === "number") {
            const oldSum = calcStatSum(prevStats[index], prevSteps[index]);
            const diff = sum - oldSum;
            if (diff > 0) {
                prefixBuffer.append(` (+${diff})`, YELLOW);
            } else if (diff < 0) {
                prefixBuffer.append(` (-${-diff})`, RED);
            }
        }

        prefixBuffer.append(" ", {});
        buffer.prependBuffer(prefixBuffer);
        return buffer;
    }

    function calculateLvl() {
        if (!currentStats.length) return;
        const full = currentStats.reduce((s, v, i) => s + calcStatSum(v, currentSteps[i]), 0);
        const level = describeLevel(full);
        const buffer = new AnsiAwareBuffer();
        if (level.to !== null) {
            buffer.append(`Twoj aktualny poziom to `, TOMATO);
            buffer.append(level.name, GREEN);
            buffer.append(` (`, TOMATO);
            buffer.append(String(full), GREEN);
            buffer.append(`) i brakuje ci do nastepnego `, TOMATO);
            buffer.append(String(level.missing), GREEN);
            buffer.append(` podcech (`, TOMATO);
            buffer.append(String(level.nextName), GREEN);
            buffer.append(`)`, TOMATO);
        } else {
            buffer.append(`Twoj aktualny poziom to `, TOMATO);
            buffer.append(level.name, GREEN);
            buffer.append(` (`, TOMATO);
            buffer.append(String(full), GREEN);
            buffer.append(`) i masz + `, TOMATO);
            buffer.append(String(level.extra), GREEN);
            buffer.append(` podcech`, TOMATO);
        }
        client.println(buffer);
        prevStats = currentStats;
        prevSteps = currentSteps;
        pendingSnapshot = {
            time: Date.now(),
            readings: currentReadings,
            total: full,
            level,
            weakened: false,
        };
    }

    /**
     * The `Twoje cechy sa oslabione` notice arrives *after* the summary line that
     * ends the read-out, so the snapshot cannot be published until we have given
     * that notice a chance to land.
     */
    function publish() {
        if (publishTimer !== undefined) {
            clearTimeout(publishTimer);
            publishTimer = undefined;
        }
        client.Triggers.removeByTag(weakenedTag);
        if (pendingSnapshot) {
            eventBus.emit("cechy.read", pendingSnapshot);
            pendingSnapshot = null;
        }
    }

    function run() {
        if (isRunning) return;
        isRunning = true;
        currentStats = [];
        currentSteps = [];
        currentReadings = [];
        pendingSnapshot = null;
        client.Triggers.removeByTag(tag);
        client.Triggers.removeByTag(weakenedTag);
        client.Triggers.registerTrigger(CECHA_LINE, (line, matches) => {
            return formatLine(line, matches.groups as unknown as CechaMatch);
        }, tag);
        client.Triggers.registerTrigger(CECHA_MAX_LINE, (line, matches) => {
            return formatLine(line, matches.groups as unknown as CechaMatch);
        }, tag);
        client.Triggers.registerTrigger(WEAKENED_LINE, (line) => {
            if (pendingSnapshot) {
                pendingSnapshot.weakened = true;
                publish();
            }
            return line;
        }, weakenedTag);
        client.Triggers.registerOneTimeTrigger(/^Obecnie do waznych cech zaliczasz/, (line) => {
            calculateLvl();
            client.Triggers.removeByTag(tag);
            isRunning = false;
            publishTimer = setTimeout(publish, WEAKENED_GRACE_MS);
            return line;
        }, tag);
        client.send("cechy");
        setTimeout(() => {
            client.Triggers.removeByTag(tag);
            isRunning = false;
        }, 3000);
    }

    if (aliases) {
        aliases.push({ pattern: /^cechy$/, callback: run });
    }
}
