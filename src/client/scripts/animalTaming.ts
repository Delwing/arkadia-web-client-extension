import Client from "../Client";
import { createColorFormat } from "@modules/core/Colors";
import { AnsiAwareBuffer, FormatStateSnapshot } from "../ansi/FormatState";

const COLORS: FormatStateSnapshot[] = [
    createColorFormat("#ff0000"),
    createColorFormat("#ff0000"),
    createColorFormat("#ff0000"),
    createColorFormat("#ffa500"),
    createColorFormat("#ffa500"),
    createColorFormat("#ffff00"),
    createColorFormat("#ffff00"),
    createColorFormat("#00ff00"),
    createColorFormat("#00ff00"),
    createColorFormat("#87ceeb"),
];

const TAMING_LEVELS: Record<string, number> = {
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
