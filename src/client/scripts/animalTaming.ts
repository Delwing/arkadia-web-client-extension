import Client from "../Client";
import { createColorFormat } from "@modules/core/Colors";
import { AnsiAwareBuffer, FormatStateSnapshot } from "../ansi/FormatState";

/** Hex color per taming level (1-based index maps via value - 1). */
export const TAMING_LEVEL_COLORS: string[] = [
    "#ff0000",
    "#ff0000",
    "#ff0000",
    "#ffa500",
    "#ffa500",
    "#ffff00",
    "#ffff00",
    "#00ff00",
    "#00ff00",
    "#87ceeb",
];

const COLORS: FormatStateSnapshot[] = TAMING_LEVEL_COLORS.map(createColorFormat);

export const TAMING_LEVELS: Record<string, number> = {
    "plochliwe": 1,
    "nerwowe": 2,
    "nieufne": 3,
    "ulegle": 4,
    "spokojne": 5,
    "przywiazane": 6,
    "ufne": 7,
    "lojalne": 8,
    "oddane": 9,
    "calkowicie oddane": 10,
};

/** Taming value (1-10) and display color for a level name, or null if unknown. */
export function getTamingLevelInfo(level: string): { value: number; color: string } | null {
    const value = TAMING_LEVELS[level.toLowerCase()];
    if (value == null) return null;
    return { value, color: TAMING_LEVEL_COLORS[value - 1] };
}

export function processAnimalTaming(buffer: AnsiAwareBuffer, level: string): AnsiAwareBuffer {
    const value = TAMING_LEVELS[level.toLowerCase()];
    if (value == null) return buffer;

    const color = COLORS[value - 1];
    const text = buffer.text;
    const matchIndex = text.indexOf(level);
    if (matchIndex === -1) return buffer;

    buffer.color([matchIndex, matchIndex + level.length], color);
    buffer.insert(matchIndex + level.length, ` [${value}/10]`, color);
    return buffer;
}

export default function initAnimalTaming(client: Client) {
    const pattern = /^Sadzac po zachowaniu zwierze jest (.+)\.$/;
    client.Triggers.registerTrigger(pattern, (line, matches) => {
        if (!matches || !matches[1]) return line;
        return processAnimalTaming(line, matches[1]);
    }, "animal-taming");
}
