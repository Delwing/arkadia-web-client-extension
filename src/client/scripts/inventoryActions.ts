import Client from "../Client";
import eventBus from "@modules/core/eventBus";
import { characterStorage } from "@modules/core/storage";
import { bagCommandForms, expectTransfer, getInventoryState, type InventoryEntry } from "./inventory";
import { containerAction } from "./bagManager";
import type { ContainerItem } from "./prettyContainers";

/**
 * Commands for what the inventory window does: right-click actions and drag
 * and drop between the carried list and bags. The window only names entries;
 * the commands are built here, in the forms the bag manager and herbs use:
 * "odloz 2. skorzany woreczek", "wloz lampe do swojego plecaka",
 * "wez 2 noze z 2. swojego woreczka".
 */

/** Words that start what comes after the noun: "plaszcz z kapturem", "pojemnik na mapy" */
const TAIL_WORDS = new Set(["z", "ze", "na", "do", "w", "we", "od", "dla", "po", "przy", "bez", "o"]);

/** Words describing a bag's state, not the item: no good for picking it out */
const STATE_WORDS = new Set([
    "otwarty", "otwarta", "otwarte", "zamkniety", "zamknieta", "zamkniete",
    "prawie", "pusty", "pusta", "puste", "pelny", "pelna", "pelne",
]);

export interface NameParts {
    /** Adjectives before the noun: "szarawy skorzany" */
    before: string;
    noun: string;
    /** What follows the noun: "z herbem" */
    after: string;
}

/**
 * Splits a name around its noun: adjectives first, then the noun, then
 * prepositional detail, as in "szarawy skorzany woreczek z herbem".
 */
export function splitName(label: string): NameParts {
    const words = label.split(/\s+/).filter(Boolean);
    const tail = words.findIndex((word, i) => i > 0 && TAIL_WORDS.has(word));
    const end = tail < 0 ? words.length : tail;
    return {
        before: words.slice(0, end - 1).join(" "),
        noun: words[end - 1] ?? label,
        after: words.slice(end).join(" "),
    };
}

/** The words a command picks an item out by: its last real adjective and its noun */
function shortName(name: string): string[] {
    const { before, noun } = splitName(name);
    const adjective = before.split(/\s+/).filter(w => w && !STATE_WORDS.has(w)).pop();
    return adjective ? [adjective, noun] : [noun];
}

function headWords(name: string): string[] {
    const { before, noun } = splitName(name);
    return [...before.split(/\s+/).filter(Boolean), noun];
}

/** Coins by their metal, as commands take them all: "zlote monety" */
const COINS: [RegExp, string][] = [
    [/\bmiedzian\S* monet/, "miedziane monety"],
    [/\bsrebrn\S* monet/, "srebrne monety"],
    [/\bzlot\S* monet/, "zlote monety"],
    [/\bmithryl\S* monet/, "mithrylowe monety"],
];

/** The plural of a coin in any of its forms ("zlotych monet", "zlota monete"), or null for anything else */
export function coinName(name: string): string | null {
    return COINS.find(([pattern]) => pattern.test(name))?.[1] ?? null;
}

/**
 * How a command names one item among others: "skorzany woreczek", numbered
 * ("2. skorzany woreczek") when other items answer to the same words, and
 * with its count for several ("23 zlote monety").
 */
export function itemTarget(item: { name: string; count: string | number }, among: { name: string }[]): string {
    const words = shortName(item.name);
    const short = words.join(" ");
    // "wiele zlotych monet" is listed in the genitive; coins have fixed names,
    // and with no count they are taken all: "wez zlote monety"
    const coin = item.count === "wie" ? coinName(item.name) : null;
    if (coin) return coin;
    if (item.count === "wie") return `wszystkie ${short}`;
    if (item.count !== 1) return `${item.count} ${short}`;
    const answering = among.filter(other => {
        const head = headWords(other.name);
        return words.every(word => head.includes(word));
    });
    const index = answering.indexOf(item as { name: string }) + 1;
    return answering.length > 1 && index > 0 ? `${index}. ${short}` : short;
}

export type InventoryAction =
    | { kind: "drop"; key: string }
    | { kind: "evaluate"; key: string }
    | { kind: "open" | "close"; key: string }
    | { kind: "put"; key: string; bag: string }
    | { kind: "take"; bag: string; item: number }
    | { kind: "move"; from: string; item: number; bag: string };

export default function initInventoryActions(client: Client) {
    const carried = () => getInventoryState().sections.flatMap(section => section.entries);

/**
     * Puts into or takes out of a bag. A bag from /pojemnik goes through the bag
     * manager, as /wdp and /wzp do, which opens and closes it as set there; any
     * other bag is opened first and closed after when it is closed, by the same settings.
     */
    const transfer = async (bag: InventoryEntry, kind: "put" | "take", what: string) => {
        expectTransfer(bag.key);
        const type = bag.assigned?.[0]?.id;
        if (type) {
            containerAction(client, type, kind, what);
            return;
        }
        const forms = bagCommandForms(bag.key);
        if (!forms) return;
        const settings = characterStorage.get("settings");
        const reopen = bag.state === "closed" && settings?.containerOpen !== false;
        if (reopen) await client.sendCommand(`otworz ${forms.biernik}`);
        await client.sendCommand(kind === "put" ? `wloz ${what} do ${forms.dopelniacz}` : `wez ${what} ${forms.from} ${forms.dopelniacz}`);
        if (reopen && settings?.containerClose !== false) await client.sendCommand(`zamknij ${forms.biernik}`);
    };

    const contentsOf = (bag: InventoryEntry): ContainerItem[] => bag.container?.contents?.items ?? [];

    return eventBus.on("inventory.action", async (action) => {
        const all = carried();
        const find = (key: string) => all.find(e => e.key === key);
        switch (action.kind) {
            case "drop": {
                const entry = find(action.key);
                if (entry) await client.sendCommand(`odloz ${itemTarget(entry, all)}`);
                break;
            }
            case "evaluate": {
                // Shown, not hidden: the player asked to see it. A bag goes by its own
                // form ("zalozony plecak", "1. swoj plecak"), anything else as for odloz
                const entry = find(action.key);
                const target = entry && (bagCommandForms(entry.key)?.biernik ?? itemTarget(entry, all));
                if (target) await client.sendCommand(`ocen ${target}`);
                break;
            }
            case "open":
            case "close": {
                const bag = find(action.key);
                const forms = bag && bagCommandForms(bag.key);
                if (forms) await client.sendCommand(`${action.kind === "open" ? "otworz" : "zamknij"} ${forms.biernik}`);
                break;
            }
            case "put": {
                const entry = find(action.key);
                const bag = find(action.bag);
                if (!entry || !bag?.noun || entry === bag) break;
                const what = itemTarget(entry, all);
                await transfer(bag, "put", what);
                break;
            }
            case "take": {
                const bag = find(action.bag);
                const items = bag ? contentsOf(bag) : [];
                const item = items[action.item];
                if (!bag?.noun || !item) break;
                const what = itemTarget(item, items);
                await transfer(bag, "take", what);
                break;
            }
            case "move": {
                const from = find(action.from);
                const to = find(action.bag);
                const items = from ? contentsOf(from) : [];
                const item = items[action.item];
                if (!from?.noun || !to?.noun || !item || from === to) break;
                const what = itemTarget(item, items);
                await transfer(from, "take", what);
                // Now carried: picked out by its words alone, any of identical ones will do
                const carriedWhat = item.count === 1 ? shortName(item.name).join(" ") : what;
                await transfer(to, "put", carriedWhat);
                break;
            }
        }
    });
}
