import Client from "../Client";
import { AnsiAwareBuffer } from "../ansi/FormatState";
import { getRenderSettings, onRenderSettingsChange } from "@modules/core/settings";

/**
 * Marks whole reply blocks so the UI can decorate them — a tinted background,
 * a left rail and a lucide icon in the gutter. The marker rides the buffer
 * (`AnsiAwareBuffer.flair`); the host turns it into a class when it builds the
 * message node. See `.msg-flair` in src/ui/web/messageFlair.css.
 *
 * `Client.onLine` merges every line of one packet into a single message, and
 * carries the flair across that merge, so matching any one line of a reply is
 * enough to decorate the block as a whole.
 */

export type FlairCategory = 'ekwipunek' | 'lup' | 'opis';

// Patterns are ASCII-only: the game output is normalized before matching, so
// Polish diacritics must never appear here.

// Bodies and remains — the same lines lootParser already colours and makes
// clickable. This script runs after it, so those survive.
const LUP_PATTERNS: RegExp[] = [
    /^Jest to martwe cialo /,
    /^Sa to smetne pozostalosci po jaki(?:ms|ejs) /,
    /^Zauwazasz przy (?:nim|niej|nich) /,
];

// Looking at somebody else: third-person forms. A fallback for descriptions
// that arrive without the `living.long` type.
const OPIS_PATTERNS: RegExp[] = [
    /^Nosi (?:na sobie )?/,
    /^Ma na sobie /,
    /^Ma przy sobie /,
    /^Ma przewieszon/,
    /^Ma zalozon/,
    /^(?:Trzyma w rekach|W rekach trzyma) /,
    /^Na plecach nosi /,
    /^Do pasa ma przytroczon/,
    /^Przy (?:lewym|prawym) boku ma przypiet/,
];

// Own inventory, as printed by `i`. Second person throughout.
const EKWIPUNEK_PATTERNS: RegExp[] = [
    /^Masz przy sobie /,
    /^Nie masz przy sobie niczego/,
    /^Przy (?:lewym|prawym) boku masz przypiet/,
    /^Na plecach nosisz /,
    /^Do pasa masz przytroczon/,
    /^Masz przewieszon/,
    /^Masz zalozon/,
    /^Nosisz /,
    /^(?:Trzymasz w rekach|W rekach trzymasz) /,
    /^Jestes ubran[ya] w /,
    /^Masz na sobie /,
];

/** GMCP message type carrying a long description of a living being. */
const LIVING_LONG = 'living.long';

/**
 * Order matters here, and the reason is `ob siebie`: your own description is
 * written in the second person — "Jestes ...", "Masz przy sobie ...", "Na
 * plecach nosisz ..." — which is the exact grammar of your own inventory. No
 * pattern can separate the two, so the GMCP type decides instead.
 */
export function matchFlairCategory(text: string, type?: string): FlairCategory | null {
    // Bodies first: these lines are specific enough to outrank any type rule,
    // so a corpse stays loot even if it arrives under a description type.
    if (LUP_PATTERNS.some(pattern => pattern.test(text))) {
        return 'lup';
    }
    // Authoritative: the game tags every long description of a living being.
    if (type === LIVING_LONG) {
        return 'opis';
    }
    if (OPIS_PATTERNS.some(pattern => pattern.test(text))) {
        return 'opis';
    }
    if (EKWIPUNEK_PATTERNS.some(pattern => pattern.test(text))) {
        return 'ekwipunek';
    }
    return null;
}

export default function initMessageFlair(client: Client) {
    const tag = 'messageFlair';
    let enabled = false;

    const register = () => {
        client.Triggers.removeByTag(tag);
        // One trigger with a function matcher rather than one per pattern: with
        // a trigger per pattern, a line matching two groups would be decided by
        // registration order (last write wins), which would not agree with
        // matchFlairCategory. Here both take the first matching rule.
        client.Triggers.registerTrigger(
            (line, _matches, type) =>
                matchFlairCategory(line.text.trim(), type)
                    ? ([] as unknown as RegExpMatchArray)
                    : undefined,
            (line, _matches, type) => {
                if (line instanceof AnsiAwareBuffer) {
                    line.flair = matchFlairCategory(line.text.trim(), type) ?? undefined;
                }
                return line;
            },
            tag,
        );
    };

    // A rendering preference, not a per-character one: it belongs to the UI
    // settings render slice, which is shared across characters and synced
    // between devices.
    const applySettings = (shouldEnable: boolean) => {
        if (shouldEnable && !enabled) {
            enabled = true;
            register();
        } else if (!shouldEnable && enabled) {
            client.Triggers.removeByTag(tag);
            enabled = false;
        }
    };

    applySettings(getRenderSettings().highlightMessageBlocks === true);
    onRenderSettingsChange((render) => {
        applySettings(render.highlightMessageBlocks === true);
    });
}
