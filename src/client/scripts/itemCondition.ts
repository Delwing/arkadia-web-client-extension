import Client from "../Client";
import {findClosestColor} from "@modules/core/Colors";
import {AnsiAwareBuffer, FormatStateSnapshot} from "../ansi/FormatState";

export type ItemCondition = {
    patterns: string[];
    replacement: string;
    color: string;
};

const COLORS: Record<string, FormatStateSnapshot> = {
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

export function processItemCondition(buffer: AnsiAwareBuffer, phrase: string): AnsiAwareBuffer {
    for (const condition of itemConditions) {
        const found = condition.patterns.every(p => new RegExp(`^${p}$`).test(phrase));
        if (found) {
            const colorCode = COLORS[condition.color] ?? COLORS.red;
            const text = buffer.text;
            const searchText = `${phrase}.`;
            const matchIndex = text.indexOf(searchText);
            if (matchIndex === -1) return buffer;

            buffer.color([matchIndex, matchIndex + phrase.length], colorCode);
            buffer.insert(matchIndex + searchText.length, ` ${condition.replacement}`, colorCode);
            return buffer;
        }
    }
    return buffer;
}

export default function initItemCondition(client: Client) {
    const pattern = /^(?:.* jest (?:juz )?|Wyglada na to, ze (?:sa |jest )?)(.+)\.$/;
    client.Triggers.registerTrigger(pattern, (line, matches) => {
        if (!matches || !matches[1]) return line;
        const phrase = matches[1];
        return processItemCondition(line, phrase);
    }, "item-condition");
}
