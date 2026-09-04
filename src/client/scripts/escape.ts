import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";
import {printArrow} from "./printArrow";

const COLOR = createColorFormat('#6a5acd');
const PANIC_COLOR = createColorFormat('#ff8c00');
const SUCCESS_COLOR = createColorFormat('#ff0000');
const PREFIX_COLOR = createColorFormat('#ffa500');
const ELFKA_COLOR = createColorFormat('#ff0000');

function normalizeSubject(subject: string): string {
    return subject.replace(/^(?:\s*(?:>+|\[[^\]]*\]))*\s*/, '').trim().toLowerCase();
}

export default function initEscape(client: Client) {
    const tag = 'escape';
    let escapee: string | null = null;

    // Same guard as the Mudlet client (skrypty/misc.lua, trigger_func_skrypty_misc_gonienie):
    // the mover has to be the character that escaped, matched case-insensitively as a substring.
    const isEscapee = (subject: string) => {
        if (!escapee) {
            return false;
        }
        return normalizeSubject(subject).includes(escapee);
    };

    const parent = client.Triggers.registerTrigger(
        /(.*) uciekl.* ci\.$/,
        (line, matches) => {
            escapee = normalizeSubject(matches[1]);
            return line.color([0, line.length], COLOR)
        },
        tag,
        {stayOpenLines: 20}
    );

    parent.registerChild(/(.*) podaza(?:ja)? na ([a-z-]+)\.$/, (line, matches) => {
        if (!isEscapee(matches[1])) {
            return line;
        }
        const dir = matches[2];
        printArrow(client, dir, COLOR);
        return line.color([0, line.length], COLOR);
    });

    parent.registerChild(/(.*) w panice .* na ([a-z-]+)\.$/, (line, matches) => {
        if (!isEscapee(matches[1])) {
            return line;
        }
        const dir = matches[2];
        printArrow(client, dir, PANIC_COLOR);
        return line.color([0, line.length], PANIC_COLOR);
    });

    client.Triggers.registerTrigger(
        /^Kolorowowlosa rozesmiana elfka wybiega (?:smiejac sie na caly glos|chichoczac) na (.*)\.$/,
        (line, matches) => {
            printArrow(client, matches[1], ELFKA_COLOR);
            return line;
        },
        tag
    );

    client.Triggers.registerTrigger(
        /^Udalo ci sie gdzies uciec!$/,
        (line) => {
            return line.color([0, line.length], SUCCESS_COLOR).prefix('--- ', PREFIX_COLOR);
        },
        tag
    );
}
