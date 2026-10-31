import Client from "../Client";
import { createColorFormat } from "@modules/core/Colors";

const TAG = "spell-scrolls";

const NAME_FORMAT = { ...createColorFormat("#ffd700"), bold: true };

// Hardest first; "bardzo ..." before its shorter form so the longer phrase wins.
const DIFFICULTY: { phrase: RegExp; level: number; color: string }[] = [
    { phrase: /bardzo duzo trudnosci/, level: 1, color: "#ff4040" },
    { phrase: /duzo trudnosci/, level: 2, color: "#ff8c00" },
    { phrase: /troche trudnosci/, level: 3, color: "#ffd700" },
    { phrase: /bardzo niewiele trudnosci/, level: 5, color: "#7fff00" },
    { phrase: /niewiele trudnosci/, level: 4, color: "#adff2f" },
    { phrase: /nie mial(?:a)?bys najmniejszych trudnosci/, level: 6, color: "#00ff7f" },
];
const MAX_LEVEL = 6;

export function findScrollDifficulty(text: string) {
    for (const d of DIFFICULTY) {
        const m = d.phrase.exec(text);
        if (m) return { ...d, start: m.index, end: m.index + m[0].length };
    }
    return undefined;
}

export default function initSpellScrolls(client: Client) {
    // "...rytual inkantacji czaru nekromanckiej magii smierci 'klatwa dusz'."
    client.Triggers.registerTrigger(
        /rytual inkantacji czaru .*?'([^']+)'/,
        (line, matches) => {
            if (!matches) return line;
            const name = matches[1];
            const start = line.text.indexOf(`'${name}'`, matches.index ?? 0) + 1;
            if (start > 0) line.applyFormat([start, start + name.length], NAME_FORMAT);
            return line;
        },
        TAG,
    );

    // "Wydaje ci sie, ze odczytanie tego zwoju sprawiloby ci niewiele trudnosci."
    client.Triggers.registerTrigger(
        /^Wydaje ci sie, ze .*(?:zwoj|odczyta)/,
        (line) => {
            const d = findScrollDifficulty(line.text);
            if (!d) return line;
            const format = createColorFormat(d.color);
            line.applyFormat([d.start, d.end], format);
            line.suffix(` [${d.level}/${MAX_LEVEL}]`, format);
            return line;
        },
        TAG,
    );
}
