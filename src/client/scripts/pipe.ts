import Client from "../Client";
import { characterStorage } from "@modules/core/storage";
import { getHerbManager } from "@modules/core/herbManagerProvider";
import loadHerbs, { isHerbSmokable } from "./lib/herbsLoader";
import { OTHER_OWNER_WORDS_ALT } from "./lib/otherOwner";

type AliasEntry = { pattern: RegExp; callback: Function };

// "Stara podniszczona fajka wypala sie i gasnie." — your own pipe only. A pipe
// burning out is shown to the whole room, so the negative lookahead drops lines
// naming another character as the owner (see otherOwner.ts).
const PIPE_BURN_OUT = new RegExp(
    `^(?!.*\\b(?:${OTHER_OWNER_WORDS_ALT})\\b)[A-Z][a-z]+(?: [a-z]+)* fajka(?: [a-z]+)* wypala sie i gasnie\\.$`,
);

/**
 * Pipe-smoking script.
 *
 * Tracks the pipe's lit state (drives the footer icon in src/web/pipeStatus.ts
 * via the `pipeLit` event) and its filled state (persisted per-character as
 * `pipe_filled`), and provides the `/zapal` and `/ziola_fajka` aliases.
 *
 * The pipe's description varies (e.g. "stara podniszczona fajka"), so the
 * patterns match the fixed phrasing around it and allow any lowercase
 * adjectives in between.
 */
export default function initPipe(client: Client, aliases?: AliasEntry[]) {
    const tag = "pipe";

    // Set while a /zapal "zapal fajke" is in flight. Cleared when the game either
    // confirms the pipe lit or reports it cannot be lit (which, mid-/zapal, means
    // it is already lit — e.g. the lit state was lost on a page reload).
    let zapalPending = false;

    // "Zapalasz stara podniszczona fajke kilkakrotnie pykajac przy tym, aby podtrzymac zar."
    client.Triggers.registerTrigger(
        /^Zapalasz [a-z]+(?: [a-z]+)* fajke(?: [a-z]+)* kilkakrotnie pykajac przy tym, aby podtrzymac zar\.$/,
        (line) => {
            client.sendEvent("pipeLit", true);
            zapalPending = false;
            return line;
        },
        tag,
    );

    // "Nie da sie jej zapalic." — if we just issued /zapal, the pipe could not be
    // lit because it is already lit; sync the (lost) lit state.
    client.Triggers.registerTrigger(
        /^Nie da sie jej zapalic\.?$/,
        (line) => {
            if (zapalPending) {
                client.sendEvent("pipeLit", true);
                zapalPending = false;
            }
            return line;
        },
        tag,
    );

    // "Nabijasz stara podniszczona fajke <zielem>." (you load the pipe — the
    // authoritative signal that it is now filled, however it was triggered)
    client.Triggers.registerTrigger(
        /^Nabijasz [a-z]+(?: [a-z]+)* fajke\b/,
        (line) => {
            characterStorage.set("pipe_filled", true);
            return line;
        },
        tag,
    );

    // "Stara podniszczona fajke musisz pierw wypalic, badz oproznic, nim bedziesz
    // mogl nabic ja nowym zielem." (you tried to fill an already-filled pipe)
    client.Triggers.registerTrigger(
        /^[A-Z][a-z]+(?: [a-z]+)* fajke(?: [a-z]+)* musisz pierw wypalic, badz oproznic, nim bedziesz mogl nabic ja nowym zielem\.$/,
        (line) => {
            characterStorage.set("pipe_filled", true);
            return line;
        },
        tag,
    );

    // "Stara podniszczona fajka wypala sie i gasnie." (burns out on its own —
    // the herb is consumed, so the pipe is no longer filled). Other players'
    // pipes are ignored via the owner-word exclusion in PIPE_BURN_OUT.
    client.Triggers.registerTrigger(
        PIPE_BURN_OUT,
        (line) => {
            client.sendEvent("pipeLit", false);
            characterStorage.set("pipe_filled", false);
            return line;
        },
        tag,
    );

    // "Gasisz stara podniszczona fajke." (you put it out)
    client.Triggers.registerTrigger(
        /^Gasisz [a-z]+(?: [a-z]+)* fajke(?: [a-z]+)*\.$/,
        (line) => {
            client.sendEvent("pipeLit", false);
            return line;
        },
        tag,
    );

    // "W starej podniszczonej fajce nie ma dostatecznie duzo ziela." (lighting
    // failed because the pipe is not (sufficiently) filled)
    client.Triggers.registerTrigger(
        /^W (?:[a-z]+ )*fajce(?: [a-z]+)* nie ma dostatecznie duzo ziela\.$/,
        (line) => {
            characterStorage.set("pipe_filled", false);
            zapalPending = false;
            return line;
        },
        tag,
    );

    // "Dokladnie ostukujac i czyszczac stara podniszczona fajke oprozniasz ja z
    // resztek znajdujacego sie w srodku ziela." (you empty the pipe)
    client.Triggers.registerTrigger(
        /^Dokladnie ostukujac i czyszczac (?:[a-z]+ )*fajke(?: [a-z]+)* oprozniasz ja z resztek znajdujacego sie w srodku ziela\.$/,
        (line) => {
            characterStorage.set("pipe_filled", false);
            return line;
        },
        tag,
    );

    if (!aliases) {
        return;
    }

    // Take one of the given herb out of a bag and load the pipe with it. The
    // "Nabijasz ... fajke" trigger above flips the filled flag once the game
    // confirms, so nothing is set optimistically here.
    const fillPipeWith = async (herb: string) => {
        const herbs = await loadHerbs();
        const manager = getHerbManager();
        if (!herbs || !manager) {
            return;
        }
        await manager.take(herb, 1);
        const narzednik = herbs.herb_id_to_odmiana[herb]?.narzednik;
        client.sendCommand(`nabij fajke ${narzednik}`);
    };

    // First smokable herb the character is holding (alphabetical, stable).
    const findSmokableHerb = async (): Promise<string | null> => {
        const herbs = await loadHerbs();
        const manager = getHerbManager();
        if (!herbs || !manager) {
            return null;
        }
        const totals: Record<string, number> = {};
        Object.values(manager.getBags()).forEach((bag) => {
            Object.entries(bag?.herbs ?? {}).forEach(([id, count]) => {
                totals[id] = (totals[id] || 0) + count;
            });
        });
        return Object.keys(totals)
            .filter((id) => totals[id] > 0 && isHerbSmokable(herbs.herb_id_to_use[id]))
            .sort()[0] ?? null;
    };

    // /zapal: fill the pipe (only if not already filled) and light it. The
    // filled flag is cleared by the burn-out / empty triggers above, so a relit
    // pipe that has not gone out just runs "zapal fajke".
    const lightPipe = async () => {
        if (characterStorage.get("pipe_filled") !== true) {
            const herb = await findSmokableHerb();
            if (!herb) {
                client.println("Nie masz ziol do palenia.");
                return;
            }
            await fillPipeWith(herb);
        }
        zapalPending = true;
        client.sendCommand("zapal fajke");
    };

    aliases.push({
        pattern: /^\/ziola_fajka (\w+)$/,
        callback: (m: RegExpMatchArray) => fillPipeWith(m[1].toLowerCase()),
    });
    aliases.push({ pattern: /^\/zapal$/, callback: lightPipe });
}
