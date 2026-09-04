import Client from "../Client";
import { AnsiAwareBuffer } from "@client/ansi/FormatState";
import { createColorFormat } from "@modules/core/Colors";
import { getHerbManager } from "@modules/core/herbManagerProvider";

/**
 * Remedies module
 *
 * Prints the list of herbal cures next to a "Cierpisz na ..." style ailment
 * line. Herbs the character actually carries (per the herb counter) are shown
 * in green and are clickable - clicking sends the matching `/zi` command.
 */

const GRAY = createColorFormat("#808080");
const GREEN = createColorFormat("#00ff00");
const YELLOW = createColorFormat("#ffff00");
const CYAN = createColorFormat("#00ffff");

/** Remedy definition - describes how to cure an ailment */
interface Remedy {
    /** Herb ID (e.g. "chaber", "bez", "barwinek") */
    herb: string;
    /** Action to perform with the herb (e.g. "powachaj", "przezuj", "zjedz") */
    action: string;
    /** Display description for the remedy */
    description: string;
}

/** Ailment definition - text fragment to match and the available remedies */
interface Ailment {
    /** Fragment of the game text identifying the ailment */
    pattern: string;
    /** List of available remedies, ordered by preference */
    remedies: Remedy[];
}

/** All ailment definitions mapped by name */
const AILMENTS: Record<string, Ailment> = {
    "KAC": {
        pattern: "kaca",
        remedies: [
            {herb: "bulawinka", action: "przezuj", description: "przezuj bulawinke"}
        ]
    },
    "CHOROBA PLUC": {
        pattern: "chorobe pluc",
        remedies: [
            {herb: "chaber", action: "powachaj", description: "powachaj chaber"}
        ]
    },
    "CHOROBA SKORY": {
        pattern: "chorobe skory",
        remedies: [
            {herb: "ususzony_jaskier", action: "rozkrusz", description: "rozkrusz us.jaskier"},
            {herb: "lukrecja", action: "przyloz", description: "przyloz lukrecje"},
            {herb: "nawloc", action: "przyloz", description: "przyloz nawloc"},
            {herb: "ususzony_przelot", action: "sproszkuj", description: "sproszkuj us.przelot"},
            {herb: "ususzony_starzec", action: "sproszkuj", description: "sproszkuj us.starzec"},
            {herb: "rumianek", action: "przyloz", description: "przyloz rumianek"}
        ]
    },
    "CHOROBA ZAKAZNA": {
        pattern: "chorobe zakazna",
        remedies: [
            {herb: "bez", action: "wetrzyj", description: "wetrzyj bez"},
            {herb: "krzyzownica", action: "przezuj", description: "przezuj krzyzownice"},
            {herb: "siezygron", action: "rozgryz", description: "rozgryz siezygron"}
        ]
    },
    "JAD GADZI": {
        pattern: "gadzim jadem",
        remedies: [
            {herb: "barwinek", action: "zjedz", description: "zjedz barwinka"},
            {herb: "rdest_wezownik", action: "przezuj", description: "przezuj rdest wezownik"},
            {herb: "krzyzownica", action: "przezuj", description: "przezuj krzyzownice"},
            {herb: "pieciornik", action: "przezuj", description: "przezuj pieciornik"},
            {herb: "siezygron", action: "rozgryz", description: "rozgryz siezygron"},
            {herb: "ususzona_boldoa", action: "rozkrusz", description: "rozkrusz us.boldoe"}
        ]
    },
    "JAD INSEKTA": {
        pattern: "jadem insekta",
        remedies: [
            {herb: "barwinek", action: "zjedz", description: "zjedz barwinka"},
            {herb: "ususzona_boldoa", action: "rozkrusz", description: "rozkrusz us.boldoe"},
            {herb: "chaber", action: "przezuj", description: "przezuj chabra"},
            {herb: "ususzona_mandragora", action: "przezuj", description: "przezuj us.mandragore"},
            {herb: "pieciornik", action: "przezuj", description: "przezuj pieciornik"},
            {herb: "ususzony_ranog", action: "przezuj", description: "przezuj us.ranog"},
            {herb: "siezygron", action: "rozgryz", description: "rozgryz siezygron"}
        ]
    },
    "JAD WIJA": {
        pattern: "jadem wija",
        remedies: []
    },
    "PASOZYTY": {
        pattern: "pchly",
        remedies: [
            {herb: "bagno", action: "przyloz", description: "przyloz bagno"},
            {herb: "bylica_cytwarowa", action: "wetrzyj", description: "wetrzyj bylice cytwarowa"},
            {herb: "bylica_piolun", action: "wetrzyj", description: "wetrzyj bylice piolun"}
        ]
    },
    "ROSLINNA": {
        pattern: "toksyna roslinna",
        remedies: [
            {herb: "chaber", action: "przezuj", description: "przezuj chabra"},
            {herb: "pieciornik", action: "przezuj", description: "przezuj pieciornik"},
            {herb: "siezygron", action: "rozgryz", description: "rozgryz siezygron"},
            {herb: "ususzona_boldoa", action: "rozkrusz", description: "rozkrusz us.boldoe"}
        ]
    },
    "POKARMOWY": {
        pattern: "chorobe ukladu pokarmowego",
        remedies: [
            {herb: "bez", action: "przezuj", description: "przezuj bez"},
            {herb: "ususzona_boldoa", action: "rozkrusz", description: "rozkrusz us.boldoe"},
            {herb: "centurie", action: "zjedz", description: "zjedz centurie"},
            {herb: "nawloc", action: "rozgryz", description: "rozgryz nawloc"},
            {herb: "nostrzyk", action: "przezuj", description: "przezuj nostrzyk"},
            {herb: "rumianek", action: "powachaj", description: "powachaj rumianek"}
        ]
    },
    "TRAD": {
        pattern: "trad",
        remedies: [
            {herb: "bylica_piolun", action: "wetrzyj", description: "wetrzyj bylice piolun"},
            {herb: "ususzony_jaskier", action: "rozkrusz", description: "rozkrusz us.jaskier"},
            {herb: "ususzony_przelot", action: "sproszkuj", description: "sproszkuj us.przelot"}
        ]
    }
};

/** Build the command that takes the herb out of a bag and uses it */
function createHerbCommand(action: string, herb: string): string {
    return `/zi ${action} ${herb}`;
}

/** Check whether the character carries the herb in any of the counted bags */
function hasHerb(herbId: string): boolean {
    const manager = getHerbManager();
    if (!manager) return false;
    return Object.values(manager.getBags()).some(bag => (bag?.herbs?.[herbId] ?? 0) > 0);
}

/** Append the remedies of a single ailment to the buffer */
function appendRemedies(client: Client, buffer: AnsiAwareBuffer, ailmentName: string): void {
    const ailment = AILMENTS[ailmentName];
    if (!ailment) return;

    for (const remedy of ailment.remedies) {
        buffer.append(" [", GRAY);

        if (hasHerb(remedy.herb)) {
            // Carried herbs are green and clickable
            const start = buffer.length;
            buffer.append(remedy.description, GREEN);
            buffer.createLink([start, buffer.length], {
                onClick: () => {
                    client.sendCommand(createHerbCommand(remedy.action, remedy.herb));
                },
                title: remedy.description
            });
        } else {
            buffer.append(remedy.description, GRAY);
        }

        buffer.append("]", GRAY);
    }
}

/** Print the remedies of a single ailment, if it has any */
function printRemedies(client: Client, ailmentName: string): void {
    const ailment = AILMENTS[ailmentName];
    if (!ailment || ailment.remedies.length === 0) return;

    const buffer = new AnsiAwareBuffer();
    appendRemedies(client, buffer, ailmentName);
    client.print(buffer);
}

/** Print remedies for every ailment named in the given game text */
function printMatchingRemedies(client: Client, text: string | undefined): void {
    if (!text) return;
    for (const [name, ailment] of Object.entries(AILMENTS)) {
        if (text.includes(ailment.pattern)) {
            printRemedies(client, name);
        }
    }
}

export default function initRemedies(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const tag = "remedies";

    // "Cierpisz na chorobe pluc i trad." and friends
    client.Triggers.registerTrigger(
        /^[ >]*(?:Cierpisz na|Jestes zatrut[ay]|Jestes chor[ay] na|Doskwieraja ci) (?<poison1>.+?)(?: i (?<poison2>.+))?\.$/,
        (line, matches) => {
            printMatchingRemedies(client, matches.groups?.poison1);
            printMatchingRemedies(client, matches.groups?.poison2);
            return line;
        },
        tag
    );

    // "Jestes trzezwy, ale masz potwornego kaca."
    client.Triggers.registerTrigger(
        /^[ >]*Jestes trzezw[ay], ale masz .* kaca\.$/,
        (line) => {
            printRemedies(client, "KAC");
            return line;
        },
        tag
    );

    // /leczenie - list every ailment with its remedies
    aliases?.push({
        pattern: /^\/leczenie$/i,
        callback: () => {
            const buffer = new AnsiAwareBuffer();
            buffer.append("=== Leczenie ===\n", YELLOW);

            for (const name of Object.keys(AILMENTS)) {
                buffer.append(`${name}:`, CYAN);
                appendRemedies(client, buffer, name);
                buffer.append("\n");
            }

            client.print(buffer);
        }
    });
}
