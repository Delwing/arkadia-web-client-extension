import Client from "../Client";
import { colorString, createColorFormat } from "@modules/core/Colors";
import { AnsiAwareBuffer } from "../ansi/FormatState";
import { characterStorage } from "@modules/core/storage";
import { findTableRange, lineOffset } from "./skillTable";

const STORAGE_KEY = "language_max_levels";

/** A row of the `jezyki` table: a language name, a colon, then its proficiency. */
const LANGUAGE_ROW = /^(\s*[^:]+):\s+(.+?)\s*$/;

// Colors matching skill levels (10 levels)
const COLORS = [
    createColorFormat("#ff0000"),  // 1: znikoma
    createColorFormat("#ff0000"),  // 2: niewielka
    createColorFormat("#ff0000"),  // 3: czesciowa
    createColorFormat("#ffa500"),  // 4: niezla
    createColorFormat("#ffa500"),  // 5: dosc dobra
    createColorFormat("#ffff00"),  // 6: dobra
    createColorFormat("#ffff00"),  // 7: bardzo dobra
    createColorFormat("#00ff00"),  // 8: doskonala
    createColorFormat("#00ff00"),  // 9: prawie pelna
    createColorFormat("#87ceeb"),  // 10: pelna
];

// Language proficiency levels (matching knowledge.ts)
const languageLevels: Record<string, number> = {
    znikoma: 1,
    niewielka: 2,
    czesciowa: 3,
    niezla: 4,
    "dosc dobra": 5,
    dobra: 6,
    "bardzo dobra": 7,
    doskonala: 8,
    "prawie pelna": 9,
    pelna: 10,
};

/**
 * Whether a line is a row of the `jezyki` table. The proficiency vocabulary is what
 * decides it: the `nazwa: wartosc` shape alone would also accept "Zorlan mowi: czesc",
 * and a line the game flushed alongside the table must not be mistaken for part of it.
 */
function isLanguageRow(line: string): boolean {
    const match = line.match(LANGUAGE_ROW);
    return !!match && languageLevels[match[2].trim().toLowerCase()] !== undefined;
}

const dimColor = createColorFormat('#4a5568');

function appendGauge(result: AnsiAwareBuffer, current: number, max: number, levelColor: ReturnType<typeof createColorFormat>): void {
    const filled = current > 0 ? '='.repeat(current) : '';
    const empty = ' '.repeat(max - Math.max(0, current));
    result.appendBuffer(colorString(' [', dimColor));
    if (filled) {
        result.appendBuffer(colorString(filled, levelColor));
    }
    if (empty) {
        result.appendBuffer(colorString(empty, dimColor));
    }
    result.appendBuffer(colorString(']', dimColor));
}

function getMaxLevels(): Record<string, number> {
    return characterStorage.get(STORAGE_KEY) ?? {};
}

function setMaxLevels(levels: Record<string, number>) {
    characterStorage.set(STORAGE_KEY, levels);
}

export default function initLanguageSkills(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const tag = "language-skills";
    const maxTag = "language-skills-max";
    let timer: ReturnType<typeof setTimeout> | undefined;
    let maxTimer: ReturnType<typeof setTimeout> | undefined;

    function disable() {
        client.Triggers.removeByTag(tag);
        if (timer) {
            clearTimeout(timer);
            timer = undefined;
        }
    }

    function disableMax() {
        client.Triggers.removeByTag(maxTag);
        if (maxTimer) {
            clearTimeout(maxTimer);
            maxTimer = undefined;
        }
    }

    /**
     * Record the maximum proficiencies from a `jezyki maksymalne` table, or null when the
     * frame holds none. Lines outside the table are passed through untouched — see
     * {@link findTableRange}.
     */
    function processMax(line: AnsiAwareBuffer): AnsiAwareBuffer | null {
        const parts = line.splitLines();
        const lines = parts.map((p) => p.text);
        const range = findTableRange(lines, isLanguageRow);
        if (!range) return null;

        const originalFormatting = line.getStateAt(lineOffset(lines, range.start));
        const result = new AnsiAwareBuffer();
        const maxLevels: Record<string, number> = {};

        for (let i = 0; i < parts.length; i++) {
            if (i > 0) {
                result.append("\n", originalFormatting);
            }
            if (i < range.start || i >= range.end) {
                result.appendBuffer(parts[i]);
                continue;
            }

            const match = lines[i].match(LANGUAGE_ROW)!;
            const name = match[1].trim().toLowerCase();
            const level = match[2].trim().toLowerCase();
            const num = languageLevels[level];
            if (num) {
                maxLevels[name] = num;
            }
            result.append(match[0], originalFormatting);
        }

        if (Object.keys(maxLevels).length > 0) {
            setMaxLevels(maxLevels);
        }

        return result;
    }

    /**
     * Render the gauges for a `jezyki` table, or null when the frame holds none. Lines
     * outside the table are passed through untouched — see {@link findTableRange}.
     */
    function process(line: AnsiAwareBuffer): AnsiAwareBuffer | null {
        const parts = line.splitLines();
        const lines = parts.map((p) => p.text);
        const range = findTableRange(lines, isLanguageRow);
        if (!range) return null;

        const originalFormatting = line.getStateAt(lineOffset(lines, range.start));
        const result = new AnsiAwareBuffer();
        const maxLevels = getMaxLevels();

        for (let i = 0; i < parts.length; i++) {
            if (i > 0) {
                result.append("\n", originalFormatting);
            }
            if (i < range.start || i >= range.end) {
                result.appendBuffer(parts[i]);
                continue;
            }

            const match = lines[i].match(LANGUAGE_ROW)!;
            const prefix = match[1] + ": ";
            const name = match[1].trim().toLowerCase();
            const levelText = match[2].trim();
            const num = languageLevels[levelText.toLowerCase()];
            const max = maxLevels[name] ?? 10;

            // Preserve original spacing
            const originalSpacing = lines[i].match(/^(\s*[^:]+:\s+)/)?.[1] ?? prefix;
            result.append(originalSpacing, originalFormatting);

            if (num) {
                const color = COLORS[num - 1];
                // Pad level text so bars align (longest = "prawie pelna" = 12 chars)
                const paddedLevel = levelText + " ".repeat(Math.max(0, 12 - levelText.length));
                result.append(paddedLevel, originalFormatting);
                appendGauge(result, num, max, color);
            } else {
                result.append(levelText, originalFormatting);
            }
        }

        return result;
    }

    function runMax() {
        disableMax();
        client.Triggers.registerMultilineTrigger(
            /[^:]+:\s+\S+/,
            (line) => {
                const out = processMax(line);
                // Something colon-shaped that isn't the table beat the reply into the
                // frame; keep the one shot for the table itself (the timeout still ends it).
                if (!out) return line;
                disableMax();
                return out;
            },
            maxTag
        );
        maxTimer = setTimeout(disableMax, 1000);
        client.send("jezyki maksymalne");
    }

    function run() {
        disable();
        client.Triggers.registerMultilineTrigger(
            /[^:]+:\s+\S+/,
            (line) => {
                const out = process(line);
                // Something colon-shaped that isn't the table beat the reply into the
                // frame; keep the one shot for the table itself (the timeout still ends it).
                if (!out) return line;
                disable();
                return out;
            },
            tag
        );
        timer = setTimeout(disable, 1000);
        client.send("jezyki");
    }

    if (aliases) {
        aliases.push({ pattern: /^jezyki$/, callback: run });
        aliases.push({ pattern: /^jezyki maksymalne$/, callback: runMax });
    }
}
