import Client from "../Client";
import {colorString, findClosestColor} from "@modules/core/Colors";

export type ItemCondition = {
    patterns: string[];
    replacement: string;
    color: string;
};

const COLORS: Record<string, number> = {
    green: findClosestColor("#00ff00"),
    yellow: findClosestColor("#ffff00"),
    red: findClosestColor("#ff0000"),
};

export const itemConditions: ItemCondition[] = [
    { patterns: ["w znakomitym stanie"], replacement: "[max]", color: "green" },
    { patterns: ["lekko podniszcz\\w+"], replacement: "[4/5]", color: "yellow" },
    { patterns: ["w kiepskim stanie"], replacement: "[3/5]", color: "red" },
    { patterns: ["w oplakanym stanie"], replacement: "[2/5]", color: "red" },
    { patterns: ["gotow.{1,2} sie rozpasc"], replacement: "[1/5]", color: "red" },
    { patterns: ["w dobrym stanie"], replacement: "[6/7]", color: "green" },
    {
        patterns: ["liczne walki wyryly.*swoje pietno"],
        replacement: "[5/7]",
        color: "yellow",
    },
    { patterns: ["w zlym stanie"], replacement: "[4/7]", color: "red" },
    { patterns: ["w bardzo zlym stanie"], replacement: "[3/7]", color: "red" },
    { patterns: ["wymaga.{0,2} natychmiastowej konserwacji"], replacement: "[2/7]", color: "red" },
    { patterns: ["moze peknac w kazdej chwili"], replacement: "[1/7]", color: "red" },
];

export function processItemCondition(rawLine: string, phrase: string): string {
    for (const condition of itemConditions) {
        const found = condition.patterns.every(p => new RegExp(`^${p}$`).test(phrase));
        if (found) {
            const colorCode = COLORS[condition.color] ?? COLORS.red;
            const colored = colorString(phrase, colorCode);
            const coloredValue = colorString(condition.replacement, colorCode);
            const replaced = `${colored}. ${coloredValue}`;
            return rawLine.replace(`${phrase}.`, replaced);
        }
    }
    return rawLine;
}

export default function initItemCondition(client: Client) {
    const pattern = /^(?:.* jest (?:juz )?|Wyglada na to, ze (?:sa |jest )?)(.+)\.$/;
    client.Triggers.registerTrigger(pattern, (triggerLine) => {
        const m = triggerLine.matches.matches;
        if (!m || !m[1]) return triggerLine;
        const phrase = m[1];
        const raw = triggerLine.toAnsiString();
        const result = processItemCondition(raw, phrase);
        triggerLine.setOverrideAnsi(result);
        return triggerLine;
    }, "item-condition");
}
