import Client from "../Client";
import { createColorFormat } from "@modules/core/Colors";
import {AnsiAwareBuffer, FormatStateSnapshot} from "../ansi/FormatState";

export type DurabilityEntry = {
    patterns: string[];
    short: string;
    color: string;
};

const COLORS: Record<string, FormatStateSnapshot> = {
    brightGreen: createColorFormat("#00ff00"),
    green: createColorFormat("#80ff00"),
    yellowGreen: createColorFormat("#bfff00"),
    yellow: createColorFormat("#ffff00"),
    yellowOrange: createColorFormat("#ffbf00"),
    orange: createColorFormat("#ffa500"),
    redOrange: createColorFormat("#ff4500"),
    red: createColorFormat("#ff0000"),
};

export const durabilityEntries: DurabilityEntry[] = [
    { patterns: ["naprawde dlugo"], short: "8d", color: "brightGreen" },
    { patterns: ["bardzo dlugo"], short: "5d-8d", color: "green" },
    { patterns: ["dlugo"], short: "3d-5d", color: "yellowGreen" },
    { patterns: ["raczej dlugo"], short: "2d-3d", color: "yellow" },
    { patterns: ["troche"], short: "1d-2d", color: "yellowOrange" },
    { patterns: ["raczej krotko"], short: "6h-1d", color: "orange" },
    { patterns: ["krotko"], short: "1h-6h", color: "redOrange" },
    { patterns: ["bardzo krotko"], short: "1h", color: "red" },
];

export function processDurability(buffer: AnsiAwareBuffer, phrase: string): AnsiAwareBuffer {
    for (const entry of durabilityEntries) {
        const found = entry.patterns.every((p) => p === phrase);
        if (found) {
            const colorCode = COLORS[entry.color] ?? COLORS.red;
            const text = buffer.text;
            const matchIndex = text.indexOf(phrase);
            if (matchIndex === -1) {
                return buffer;
            }
            const suffixText = ` [${entry.short}]`;
            buffer.color([matchIndex, matchIndex + phrase.length], colorCode);
            buffer.insert(matchIndex + phrase.length, suffixText, colorCode);
            return buffer;
        }
    }
    return buffer;
}

export default function initDurability(client: Client) {
    const patterns = [
        /^Wyglada na to, ze mogl(?:a|o|y|)by ci jeszcze ([\w\s]*) sluzyc\.$/,
        /\(posluzy ([\w\s]*)(?:, .*)?\)/,
    ];
    const tag = "durability";
    patterns.forEach((pattern) => {
        client.Triggers.registerTrigger(pattern, (line, matches) => {
            if (!matches) return line;
            const phrase = matches[1];
            return processDurability(line, phrase);
        }, tag);
    });
}
