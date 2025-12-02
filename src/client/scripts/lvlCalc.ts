import Client from "../Client";
import { createColorFormat } from "@modules/core/Colors";
import { AnsiAwareBuffer } from "@client/ansi/FormatState";

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

const statToRealLvl = [
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

function calcStatSum(stat: number, step: number) {
    return (stat - 1) * 5 + step;
}

export default function initLvlCalc(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    let prevStats: number[] = [];
    let prevSteps: number[] = [];
    let currentStats: number[] = [];
    let currentSteps: number[] = [];
    let isRunning = false;
    const tag = "lvlCalc";

    function collectStat(desc: string, next?: string) {
        const value = statToNumber[desc];
        const step = next ? valToNextNumber[next] : 0;
        currentStats.push(value);
        currentSteps.push(step);
        return { value, step };
    }

    function formatLine(buffer: AnsiAwareBuffer, desc: string, next?: string) {
        const { value, step } = collectStat(desc, next);

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
        let lvl = 1;
        for (let i = 0; i < statToRealLvl.length; i++) {
            lvl = i + 1;
            if (full < statToRealLvl[i]) break;
        }
        const buffer = new AnsiAwareBuffer();
        if (full < 190) {
            const missing = statToRealLvl[lvl - 1] - full;
            buffer.append(`Twoj aktualny poziom to `, TOMATO);
            buffer.append(realLvlString[lvl], GREEN);
            buffer.append(` (`, TOMATO);
            buffer.append(String(full), GREEN);
            buffer.append(`) i brakuje ci do nastepnego `, TOMATO);
            buffer.append(String(missing), GREEN);
            buffer.append(` podcech (`, TOMATO);
            buffer.append(realLvlString[lvl + 1], GREEN);
            buffer.append(`)`, TOMATO);
        } else {
            const extra = full - statToRealLvl[lvl - 1];
            buffer.append(`Twoj aktualny poziom to `, TOMATO);
            buffer.append(realLvlString[lvl + 1], GREEN);
            buffer.append(` (`, TOMATO);
            buffer.append(String(full), GREEN);
            buffer.append(`) i masz + `, TOMATO);
            buffer.append(String(extra), GREEN);
            buffer.append(` podcech`, TOMATO);
        }
        client.println(buffer);
        prevStats = currentStats;
        prevSteps = currentSteps;
    }

    function run() {
        if (isRunning) return;
        isRunning = true;
        currentStats = [];
        currentSteps = [];
        client.Triggers.removeByTag(tag);
        client.Triggers.registerTrigger(/^Jestes ([a-z ]+) i ([a-z ]+) ci brakuje, zebys mogla? wyzej ocenic sw(?:a|oj) ([a-z]+)\.(?:\s+\( [+-].+ \))?$/, (line, matches) => {
            return formatLine(line, matches[1], matches[2]);
        }, tag);
        client.Triggers.registerTrigger(/^Twoja \w+? osiagnela (nadludzki poziom)\.(?:\s+\( [+-].+ \))?$/, (line, matches) => {
            return formatLine(line, matches[1]);
        }, tag);
        client.Triggers.registerOneTimeTrigger(/^Obecnie do waznych cech zaliczasz/, (line) => {
            calculateLvl();
            client.Triggers.removeByTag(tag);
            isRunning = false;
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
