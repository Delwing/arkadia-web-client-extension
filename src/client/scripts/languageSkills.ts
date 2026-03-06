import Client from "../Client";
import { colorString, createColorFormat } from "@modules/core/Colors";
import { AnsiAwareBuffer, FormatStateSnapshot } from "../ansi/FormatState";
import { characterStorage } from "@modules/core/storage";

const STORAGE_KEY = "language_max_levels";

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

function createGauge(current: number, max: number): string {
    const filled = "#".repeat(current);
    const empty = "-".repeat(max - current);
    return `[${filled}${empty}]`;
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

    function processMax(raw: string, originalFormatting?: FormatStateSnapshot): AnsiAwareBuffer {
        const lines = raw.split("\n");
        const result = new AnsiAwareBuffer();
        const maxLevels: Record<string, number> = {};
        let first = true;

        for (const line of lines) {
            const match = line.match(/^(\s*[^:]+):\s+(.+?)\s*$/);
            if (match) {
                const name = match[1].trim().toLowerCase();
                const level = match[2].trim().toLowerCase();
                const num = languageLevels[level];

                if (num) {
                    maxLevels[name] = num;
                }

                if (!first) {
                    result.append("\n", originalFormatting);
                }
                first = false;

                result.append(match[0], originalFormatting);
            } else if (line.trim()) {
                if (!first) {
                    result.append("\n", originalFormatting);
                }
                first = false;
                result.append(line, originalFormatting);
            }
        }

        if (Object.keys(maxLevels).length > 0) {
            setMaxLevels(maxLevels);
        }

        return result;
    }

    function process(raw: string, originalFormatting?: FormatStateSnapshot): AnsiAwareBuffer {
        const lines = raw.split("\n");
        const result = new AnsiAwareBuffer();
        const maxLevels = getMaxLevels();
        let first = true;

        for (const line of lines) {
            const match = line.match(/^(\s*[^:]+):\s+(.+?)\s*$/);
            if (match) {
                const prefix = match[1] + ": ";
                const name = match[1].trim().toLowerCase();
                const levelText = match[2].trim();
                const level = levelText.toLowerCase();
                const num = languageLevels[level];
                const max = maxLevels[name] ?? 10;

                if (!first) {
                    result.append("\n", originalFormatting);
                }
                first = false;

                // Preserve original spacing
                const originalSpacing = line.match(/^(\s*[^:]+:\s+)/)?.[1] ?? prefix;
                result.append(originalSpacing, originalFormatting);

                if (num) {
                    const color = COLORS[num - 1];
                    const gauge = createGauge(num, max);
                    // Pad level to max length (12 for "prawie pelna")
                    const paddedLevel = levelText + " ".repeat(Math.max(0, 12 - levelText.length));
                    result.appendBuffer(colorString(paddedLevel + gauge, color));
                } else {
                    result.append(levelText, originalFormatting);
                }
            } else if (line.trim()) {
                if (!first) {
                    result.append("\n", originalFormatting);
                }
                first = false;
                result.append(line, originalFormatting);
            }
        }

        return result;
    }

    function runMax() {
        disableMax();
        client.Triggers.registerMultilineTrigger(
            /[^:]+:\s+\S+/,
            (line) => {
                const raw = line.text;
                const originalFormatting = line.getStateAt(0);
                const out = processMax(raw, originalFormatting);
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
                const raw = line.text;
                const originalFormatting = line.getStateAt(0);
                const out = process(raw, originalFormatting);
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
