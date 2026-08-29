import Client from "../Client";
import { polishWordToNumber, polishNumberPattern } from "./polishNumberConverter";
import { createColorFormat } from "@modules/core/Colors";
import { AnsiAwareBuffer } from "@client/ansi/FormatState";
import { getMergedSnapshot } from "@modules/data/peopleLoader";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";
import type { FormatStateSnapshot } from "@client/ansi/FormatState";

const TAG = 'who-count';
const GREEN = createColorFormat('#00ff00');
const RED = createColorFormat('#ff0000');
const DEFAULT_NAME_COLOR = createColorFormat('#ffffff');

/**
 * Cut the captured body down to the part that actually belongs to the kto reply.
 *
 * The body capture has no terminator of its own, so whatever the game flushes into the
 * same frame — a carriage moving off, someone arriving — lands inside it. No line of the
 * reply itself ever contains a period: names have none, and neither do the long-format
 * descriptions. So the first line that does contain one marks where the reply ended and
 * unrelated output began, and everything from there on is neither parsed nor decorated.
 */
export function sliceKtoBody(body: string): string {
    const lines = body.split('\n');
    const end = lines.findIndex(l => l.includes('.'));
    return end === -1 ? body : lines.slice(0, end).join('\n');
}

/**
 * Parse names from the kto response body.
 * Supports two formats:
 * - Long format (kto / kto l): each person on a separate line with descriptions and commas
 * - Short format (kto k): names in columns separated by 2+ spaces, no commas
 * Leading/trailing * is stripped from names.
 */
export function parseKtoNames(body: string): string[] {
    const names: string[] = [];
    const lines = body.split('\n');

    // Detect format: long format has commas (descriptions), short format doesn't
    const isShortFormat = !body.includes(',');

    if (isShortFormat) {
        // Short/column format: names separated by 2+ spaces
        for (const l of lines) {
            const trimmed = l.trim();
            if (trimmed.length === 0) continue;
            const parts = trimmed.split(/\s{2,}/);
            for (const part of parts) {
                const name = part.trim().replace(/^\*|\*$/g, '');
                if (name.length > 0) {
                    names.push(name);
                }
            }
        }
    } else {
        // Long format: each person starts on a non-indented line
        for (const l of lines) {
            const trimmed = l.trimEnd();
            if (trimmed.length === 0 || l.startsWith(' ') || trimmed.endsWith('.') || !trimmed.includes(',')) continue;
            const firstWord = l.split(/\s/)[0];
            const name = firstWord.replace(/^\*|\*$/g, '').replace(/,+$/, '');
            if (name.length > 0) {
                names.push(name);
            }
        }
    }

    return names;
}

export default function initWhoCount(client: Client) {
    let lastCount: number | null = null;
    let previousNames: string[] = [];

    // Settings for guild/enemy coloring
    let enemyGuilds: string[] = [];
    let guildColors: Record<string, string | undefined> = {};

    const applySettings = (settings: any) => {
        const detail = (settings ?? defaultSettings) as {
            enemyGuilds?: string[];
            guildColors?: Record<string, string | undefined>;
        };
        enemyGuilds = detail.enemyGuilds || [];
        guildColors = detail.guildColors || {};
    };
    applySettings(characterStorage.get('settings'));
    characterStorage.onChange('settings', applySettings);

    // Reset state on character switch
    client.on("reset", () => {
        lastCount = null;
        previousNames = [];
    });

    /**
     * Look up a name in the people database and return an appropriate color.
     * Enemy guilds get red, guild members get their guild color, others get default.
     */
    function getColorForName(name: string): FormatStateSnapshot {
        const people = getMergedSnapshot();
        if (!people) return DEFAULT_NAME_COLOR;

        const entry = people.find(
            p => p.name.toLowerCase() === name.toLowerCase() && !p.ignored
        );
        if (!entry) return DEFAULT_NAME_COLOR;

        if (entry.isEnemy || enemyGuilds.includes(entry.guild)) {
            return RED;
        }
        if (entry.color) {
            return createColorFormat(entry.color);
        }
        const guildColorHex = guildColors[entry.guild];
        if (guildColorHex) {
            return createColorFormat(guildColorHex);
        }
        return DEFAULT_NAME_COLOR;
    }

    function isWordChar(ch: string | undefined): boolean {
        if (!ch) return false;
        if (ch >= 'a' && ch <= 'z') return true;
        if (ch >= 'A' && ch <= 'Z') return true;
        return ch >= '0' && ch <= '9';

    }

    /**
     * Find position of a name in the buffer text (within [bodyStart, bodyEnd)), respecting
     * word boundaries. Both the character before and after must be non-word characters to
     * prevent matching a shorter name inside a longer one (e.g. "Ana" inside "Anarion").
     * The end bound keeps a decoration from landing on unrelated output that shared the frame.
     * Returns the insert position (before * if present), or -1 if not found.
     */
    function findNamePosition(text: string, name: string, bodyStart: number, bodyEnd: number): number {
        let idx = text.indexOf(name, bodyStart);
        while (idx >= 0 && idx + name.length <= bodyEnd) {
            const before = idx > 0 ? text[idx - 1] : undefined;
            const afterIdx = idx + name.length;
            const after = afterIdx < text.length ? text[afterIdx] : undefined;
            if (!isWordChar(before) && !isWordChar(after)) {
                return before === '*' ? idx - 1 : idx;
            }
            idx = text.indexOf(name, idx + 1);
        }
        return -1;
    }

    // Single-line trigger for the count display (header line)
    const numberGroup = `(${polishNumberPattern}|\\d+)`;
    const pattern = new RegExp(
        `^Sposrod\\s+${numberGroup}\\s+osob przebywajacych obecnie w swiecie Arkadii, znane tobie to:`
    );

    client.Triggers.registerTrigger(pattern, (line, matches) => {
        if (!matches) return line;

        const count = polishWordToNumber(matches[1]);
        if (count === 0) return line;

        let suffix = '';
        if (lastCount !== null) {
            const diff = count - lastCount;
            if (diff > 0) {
                suffix = ` [+${diff}]`;
            } else if (diff < 0) {
                suffix = ` [${diff}]`;
            } else {
                suffix = ` [=]`;
            }
        }
        lastCount = count;

        if (suffix) {
            const text = line.text;
            const colonIndex = text.indexOf(':');
            if (colonIndex >= 0) {
                line = line.insert(colonIndex + 1, suffix, {});
            }
        }

        return line;
    }, TAG);

    // Multiline trigger to track names across kto calls
    const ktoMultilinePattern = /^Sposrod\s+.+\s+osob przebywajacych obecnie w swiecie Arkadii, znane tobie to:\n([\s\S]+)$/m;

    client.Triggers.registerMultilineTrigger(ktoMultilinePattern, (line, matches) => {
        if (!matches) return line;

        const body = sliceKtoBody(matches[1]);
        const currentNames = parseKtoNames(body);
        const currentSet = new Set(currentNames);
        const previousSet = new Set(previousNames);

        // Decorations only make sense once we have something to compare against
        if (previousNames.length > 0) {
            const headerEnd = line.text.indexOf('\n');
            if (headerEnd < 0) return line;
            const bodyEnd = Math.min(headerEnd + 1 + body.length, line.length);

            // Resolve the new arrivals up front, while no insertion has shifted anything yet
            const newNames = currentNames.filter(n => !previousSet.has(n));
            const positions: number[] = [];
            for (const name of newNames) {
                const pos = findNamePosition(line.text, name, headerEnd, bodyEnd);
                if (pos >= 0) {
                    positions.push(pos);
                }
            }

            // "Zakonczyli" belongs to the kto reply, so it goes at the end of the reply body
            // rather than after whatever else the game flushed into the same frame — printing
            // it separately would always have pushed it past those lines. Inserting it before
            // the markers is safe: every marker position sits before bodyEnd.
            const disappeared = previousNames.filter(n => !currentSet.has(n));
            if (disappeared.length > 0) {
                const output = new AnsiAwareBuffer("\nZakonczyli: ");
                for (let i = 0; i < disappeared.length; i++) {
                    const name = disappeared[i];
                    const color = getColorForName(name);
                    output.append(name, color);
                    if (i < disappeared.length - 1) {
                        output.append(", ", {});
                    }
                }
                line.insertBuffer(bodyEnd, output);
            }

            // Insert green "+" before each new name, from the end back so earlier positions stay valid
            positions.sort((a, b) => b - a);
            for (const pos of positions) {
                line.insert(pos, '+ ', GREEN);
            }
        }

        // Update previous names for next comparison
        previousNames = currentNames;

        return line;
    }, TAG);
}
