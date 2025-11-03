import Client from "../Client";
import { colorString, findClosestColor } from "@modules/core/Colors";

export type DurabilityEntry = {
    patterns: string[];
    short: string;
    color: string;
};

const COLORS: Record<string, number> = {
    green: findClosestColor("#00ff00"),
    yellow: findClosestColor("#ffff00"),
    orange: findClosestColor("#ffa500"),
    red: findClosestColor("#ff0000"),
};

export const durabilityEntries: DurabilityEntry[] = [
    { patterns: ["naprawde dlugo"], short: "8d", color: "green" },
    { patterns: ["bardzo dlugo"], short: "5d-8d", color: "green" },
    { patterns: ["dlugo"], short: "3d-5d", color: "green" },
    { patterns: ["raczej dlugo"], short: "2d-3d", color: "green" },
    { patterns: ["troche"], short: "1d-2d", color: "yellow" },
    { patterns: ["raczej krotko"], short: "6h-1d", color: "orange" },
    { patterns: ["krotko"], short: "1h-6h", color: "orange" },
    { patterns: ["bardzo krotko"], short: "1h", color: "red" },
];

export function processDurability(rawLine: string, phrase: string): string {
    for (const entry of durabilityEntries) {
        const found = entry.patterns.every((p) => new RegExp(p).test(phrase));
        if (found) {
            const colorCode = COLORS[entry.color] ?? COLORS.red;
            const colored = colorString(phrase, colorCode);
            const coloredValue = colorString(`[${entry.short}]`, colorCode);
            const replaced = `${colored} ${coloredValue}`;
            return rawLine.replace(phrase, replaced);
        }
    }
    return rawLine;
}

export default function initDurability(client: Client) {
    const patterns = [
        /^Wyglada na to, ze mogl(?:a|o|y|)by ci jeszcze ([\w\s]*) sluzyc\.$/,
        /\(posluzy ([\w\s]*)(?:, .*)?\)/,
    ];
    const tag = "durability";
    patterns.forEach((pattern) => {
        client.Triggers.registerTrigger(pattern, (raw, _line, m) => {
            const phrase = m[1];
            return processDurability(raw, phrase);
        }, tag);
    });
}
