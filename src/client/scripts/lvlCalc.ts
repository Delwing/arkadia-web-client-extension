import Client from "../Client";
import { color, colorString, findClosestColor } from "@modules/core/Colors";

const GREEN = findClosestColor("#00ff00");
const RED = findClosestColor("#ff0000");
const YELLOW = findClosestColor("#ffff00");
const TOMATO = findClosestColor("#ff6347");
const RESET = "\x1B[0m";

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

    function formatLine(raw: string, desc: string, next?: string) {
        const { value, step } = collectStat(desc, next);
        let line = raw.replace(desc, `${desc} ${colorString(`[${value}/10]`, GREEN)}`);
        if (next) {
            line = line.replace(next, `${next} ${colorString(`[${step}/5]`, GREEN)}`);
        }
        const index = currentStats.length - 1;
        const sum = calcStatSum(value, step);
        let prefix = colorString(`[${sum}]`, GREEN);
        if (typeof prevStats[index] === "number") {
            const oldSum = calcStatSum(prevStats[index], prevSteps[index]);
            const diff = sum - oldSum;
            if (diff > 0) {
                prefix += colorString(` (+${diff})`, YELLOW);
            } else if (diff < 0) {
                prefix += colorString(` (-${-diff})`, RED);
            }
        }
        return client.prefix(line, prefix + " ");
    }

    function calculateLvl() {
        if (!currentStats.length) return;
        const full = currentStats.reduce((s, v, i) => s + calcStatSum(v, currentSteps[i]), 0);
        let lvl = 1;
        for (let i = 0; i < statToRealLvl.length; i++) {
            lvl = i + 1;
            if (full < statToRealLvl[i]) break;
        }
        let msg: string;
        if (full < 190) {
            const missing = statToRealLvl[lvl - 1] - full;
            msg =
                color(TOMATO) +
                `Twoj aktualny poziom to ` +
                colorString(realLvlString[lvl], GREEN) +
                color(TOMATO) +
                ` (` +
                colorString(String(full), GREEN) +
                color(TOMATO) +
                `) i brakuje ci do nastepnego ` +
                colorString(String(missing), GREEN) +
                color(TOMATO) +
                ` podcech (` +
                colorString(realLvlString[lvl + 1], GREEN) +
                color(TOMATO) +
                `)` +
                RESET;
        } else {
            const extra = full - statToRealLvl[lvl - 1];
            msg =
                color(TOMATO) +
                `Twoj aktualny poziom to ` +
                colorString(realLvlString[lvl + 1], GREEN) +
                color(TOMATO) +
                ` (` +
                colorString(String(full), GREEN) +
                color(TOMATO) +
                `) i masz + ` +
                colorString(String(extra), GREEN) +
                color(TOMATO) +
                ` podcech` +
                RESET;
        }
        client.println(msg);
        prevStats = currentStats;
        prevSteps = currentSteps;
    }

    function run() {
        if (isRunning) return;
        isRunning = true;
        currentStats = [];
        currentSteps = [];
        client.Triggers.removeByTag(tag);
        client.Triggers.registerTrigger(/^Jestes ([a-z ]+) i ([a-z ]+) ci brakuje, zebys mogla? wyzej ocenic sw(?:a|oj) ([a-z]+)\.$/, (triggerLine) => {
            const m = triggerLine.matches.matches as RegExpMatchArray;
            const formatted = formatLine(triggerLine.text, m[1], m[2]);
            triggerLine.setOverrideAnsi(formatted);
            return triggerLine;
        }, tag);
        client.Triggers.registerTrigger(/^Twoja \w+? osiagnela (nadludzki poziom)\.$/, (triggerLine) => {
            const m = triggerLine.matches.matches as RegExpMatchArray;
            const formatted = formatLine(triggerLine.text, m[1]);
            triggerLine.setOverrideAnsi(formatted);
            return triggerLine;
        }, tag);
        client.Triggers.registerOneTimeTrigger(/^Obecnie do waznych cech zaliczasz/, (triggerLine) => {
            calculateLvl();
            client.Triggers.removeByTag(tag);
            isRunning = false;
            return triggerLine;
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
