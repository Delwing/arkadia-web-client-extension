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
const DEFAULT_NAME_COLOR = createColorFormat('#ffff5f');

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

    /**
     * Parse names from the kto response body.
     * Each person entry starts at a non-space character.
     * Lines starting with spaces are continuations of the previous entry.
     * The name is the first word, with leading/trailing * stripped.
     */
    function parseKtoNames(body: string): string[] {
        const names: string[] = [];
        const lines = body.split('\n');
        for (const line of lines) {
            if (line.length === 0 || line.startsWith(' ')) continue;
            const firstWord = line.split(/\s/)[0];
            const name = firstWord.replace(/^\*|\*$/g, '');
            if (name.length > 0) {
                names.push(name);
            }
        }
        return names;
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

        const body = matches[1];
        const currentNames = parseKtoNames(body);
        const currentSet = new Set(currentNames);
        const previousSet = new Set(previousNames);

        // Mark new names with green "+" (only if we had a previous set)
        if (previousNames.length > 0) {
            const newNames = currentNames.filter(n => !previousSet.has(n));

            // Insert green "+" before each new name, process in reverse to preserve positions
            const positions: { index: number; name: string }[] = [];
            for (const name of newNames) {
                // Find the name in the buffer text (after the header line)
                const headerEnd = line.text.indexOf('\n');
                if (headerEnd < 0) continue;
                let searchFrom = headerEnd;
                let idx = line.text.indexOf(name, searchFrom);
                // Handle *Name or Name* variants
                while (idx >= 0) {
                    const before = idx > 0 ? line.text[idx - 1] : '\n';
                    // Verify it's at the start of a person entry (preceded by newline or *)
                    if (before === '\n' || before === '*') {
                        positions.push({ index: before === '*' ? idx - 1 : idx, name });
                        break;
                    }
                    idx = line.text.indexOf(name, idx + 1);
                }
            }

            // Sort by position descending to insert from end to start
            positions.sort((a, b) => b.index - a.index);
            for (const { index } of positions) {
                line.insert(index, '+', GREEN);
            }
        }

        // Print disappeared names
        if (previousNames.length > 0) {
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
                client.print(output);
            }
        }

        // Update previous names for next comparison
        previousNames = currentNames;

        return line;
    }, TAG);
}
