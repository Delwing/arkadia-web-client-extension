import Client from "../Client";
import {colorTokenInLine, colorStringInLine} from "@modules/core/Colors";
import {AnsiAwareBuffer} from "@client/ansi/FormatState";
import {ORANGE_COLOR} from "../constants/colors";
export default function initTcolor(client: Client, aliases: Client['aliases']) {
    const tag = "tcolor";
    const phrases = new Set<string>();

    aliases.push({
        pattern: /^\/tcolor (.+)$/,
        callback: (matches: RegExpMatchArray) => {
            const phrase = matches[1].trim();
            phrases.add(phrase);
            const msg = new AnsiAwareBuffer(`Tymczasowe kolorowanie dodane: "${phrase}"`);
            client.print(colorStringInLine(msg, phrase, ORANGE_COLOR));
        }
    });

    const dummyMatch = [] as unknown as RegExpMatchArray;
    dummyMatch.index = 0;

    client.Triggers.registerTrigger(
        (line) => {
            const text = line.text.toLowerCase();
            for (const phrase of phrases) {
                if (text.includes(phrase.toLowerCase())) {
                    return dummyMatch;
                }
            }
            return undefined;
        },
        (line) => {
            for (const phrase of phrases) {
                line = colorTokenInLine(line, phrase, ORANGE_COLOR);
            }
            return line;
        },
        tag
    );
}
