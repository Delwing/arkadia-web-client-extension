import Client from "../Client";
import {colorString, createColorFormat} from "@modules/core/Colors";
import {AnsiAwareBuffer, FormatStateSnapshot} from "@client/ansi/FormatState";
import { characterStorage } from "@modules/core/storage";

const STORAGE_KEY = "containers";

const HEADER_COLOR = createColorFormat("#7cfc00");
const TYPE_COLOR = createColorFormat("#cfb530");
const BAG_COLOR = createColorFormat("#87ceeb");

const builtInTypes = ["money", "gems", "food", "other"] as const;

const bagInBiernik: Record<string, string> = {
    plecak: "plecak",
    torba: "torbe",
    worek: "worek",
    sakiewka: "sakiewke",
    mieszek: "mieszek",
    sakwa: "sakwe",
    wor: "wor",
    szkatulka: "szkatulke",
    kaletka: "kaletke",
};

const bagInDopelniacz: Record<string, string> = {
    plecak: "plecaka",
    torba: "torby",
    worek: "worka",
    sakiewka: "sakiewki",
    mieszek: "mieszka",
    sakwa: "sakwy",
    wor: "wora",
    szkatulka: "szkatulki",
    kaletka: "kaletki",
};

const bagPronouns: Record<string, { biernik: string; dopelniacz: string }> = {
    plecak: { biernik: "swoj", dopelniacz: "swojego" },
    torba: { biernik: "swoja", dopelniacz: "swojej" },
    worek: { biernik: "swoj", dopelniacz: "swojego" },
    sakiewka: { biernik: "swoja", dopelniacz: "swojej" },
    mieszek: { biernik: "swoj", dopelniacz: "swojego" },
    sakwa: { biernik: "swoja", dopelniacz: "swojej" },
    wor: { biernik: "swoj", dopelniacz: "swojego" },
    szkatulka: { biernik: "swoja", dopelniacz: "swojej" },
    kaletka: { biernik: "swoja", dopelniacz: "swojej" },
};

/** Plural forms as they follow a numeral in the inventory: "dwie sakiewki", "piec sakiewek" */
const bagPlural: Record<string, string[]> = {
    plecak: ["plecaki", "plecakow"],
    torba: ["torby", "toreb"],
    worek: ["worki", "workow"],
    sakiewka: ["sakiewki", "sakiewek"],
    mieszek: ["mieszki", "mieszkow"],
    sakwa: ["sakwy", "sakw"],
    wor: ["wory", "worow"],
    szkatulka: ["szkatulki", "szkatulek"],
    kaletka: ["kaletki", "kaletek"],
};

const numerals: Record<string, number> = {
    dwa: 2, dwie: 2, trzy: 3, cztery: 4, piec: 5,
    szesc: 6, siedem: 7, osiem: 8, dziewiec: 9, dziesiec: 10,
};

/** Words that end an item description when walking back from the bag noun */
const descriptionStops = new Set(["i", "oraz", "masz", "nosisz", "sobie", "na", "w", "z", "ze", "przy", "do"]);

/**
 * A stored bag is its noun, optionally prefixed with which of several same-named
 * bags it is: "sakiewka" (the first one) or "2. sakiewka".
 */
function parseBag(bag: string): { noun: string; index?: number } {
    const match = bag.match(/^(\d+)\.\s*(\S+)$/);
    return match ? { noun: match[2], index: Number(match[1]) } : { noun: bag };
}

export type BuiltInContainerType = (typeof builtInTypes)[number];
/** Built-in types plus types registered by plugins (registerContainerType) */
export type ContainerType = BuiltInContainerType | (string & {});

/**
 * Bag per type. Built-in types always have one; a plugin type only once the player
 * picks a bag for it - until then it uses its fallback type's bag.
 */
const containerConfig: Record<string, string> = {
    money: "plecak",
    gems: "plecak",
    food: "plecak",
    other: "plecak",
};

export interface ContainerTypeOptions {
    /** Name shown in /pojemnik and /pojemniki (defaults to the type id) */
    label?: string;
    /** Type whose bag is used until the player sets one for this type (default "other") */
    fallback?: ContainerType;
}

const customTypes = new Map<string, Required<ContainerTypeOptions>>();

function isBuiltIn(type: string): type is BuiltInContainerType {
    return (builtInTypes as readonly string[]).includes(type);
}

/** All known types: built-in first, then plugin types in registration order */
function allTypes(): string[] {
    return [...builtInTypes, ...customTypes.keys()];
}

function typeLabel(type: string): string {
    return customTypes.get(type)?.label ?? type;
}

/**
 * Registers a plugin container type. Its bag follows the fallback type until the player
 * assigns one in /pojemnik; that choice is stored and survives reloads.
 */
export function registerContainerType(type: string, options: ContainerTypeOptions = {}) {
    if (isBuiltIn(type)) throw new Error(`Container type '${type}' is built-in`);
    const fallback = options.fallback ?? "other";
    if (fallback === type) throw new Error(`Container type '${type}' cannot fall back to itself`);
    customTypes.set(type, { label: options.label ?? type, fallback });
}

/** Forgets a plugin type; its stored bag stays for when it is registered again */
export function unregisterContainerType(type: string) {
    customTypes.delete(type);
}

/** Plugin type without a bag of its own - it uses its fallback type's bag */
function isInherited(type: string): boolean {
    return !isBuiltIn(type) && !containerConfig[type];
}

/** Bag for a type, following fallbacks of plugin types without their own bag */
function resolveBag(type: string): string | undefined {
    const seen = new Set<string>();
    let current: string | undefined = type;
    while (current && !seen.has(current)) {
        seen.add(current);
        if (containerConfig[current]) return containerConfig[current];
        current = customTypes.get(current)?.fallback;
    }
    return undefined;
}

export interface ContainerForms {
    mianownik: string;
    dopelniacz: string;
    biernik: string;
    /** Which of several same-named bags; absent means the first one */
    index?: number;
}

export function getContainer(type: ContainerType): string {
    return resolveBag(type) ?? "";
}

export function getContainerForms(type: ContainerType): ContainerForms | null {
    const bag = resolveBag(type);
    if (!bag) return null;
    const { noun, index } = parseBag(bag);
    if (!bagInBiernik[noun]) return null;
    return {
        mianownik: noun,
        dopelniacz: bagInDopelniacz[noun],
        biernik: bagInBiernik[noun],
        ...(index !== undefined && { index }),
    };
}

/** Command forms of a known bag, with the ordinal of the chosen one ("2. swoja sakiewke") */
function getBagForms(bag: string) {
    const { noun, index } = parseBag(bag);
    if (!bagPronouns[noun]) return null;
    const ordinal = index !== undefined ? `${index}. ` : "";
    return {
        noun,
        biernik: `${ordinal}${bagPronouns[noun].biernik} ${bagInBiernik[noun]}`,
        dopelniacz: `${ordinal}${bagPronouns[noun].dopelniacz} ${bagInDopelniacz[noun]}`,
        // "ze swojej", but "z 2. swojej"
        from: ordinal ? "z" : "ze",
    };
}

function saveConfig(_client: Client) {
    characterStorage.set(STORAGE_KEY, containerConfig);
}

function setContainer(type: ContainerType, bag: string, client: Client) {
    containerConfig[type] = bag;
    client.print(`Ustawiono ${bag} jako pojemnik na '${typeLabel(type)}'.`);
    saveConfig(client);
}

/** Plugin type goes back to its fallback type's bag */
function resetContainer(type: string, client: Client) {
    delete containerConfig[type];
    const fallback = customTypes.get(type)?.fallback ?? "other";
    client.print(`'${typeLabel(type)}' uzywa pojemnika na '${typeLabel(fallback)}'.`);
    saveConfig(client);
}

/** Built-in types get the bag; plugin types drop their own bag and follow their fallbacks */
function setAll(bag: string, client: Client) {
    builtInTypes.forEach((t) => (containerConfig[t] = bag));
    customTypes.forEach((_, t) => delete containerConfig[t]);
    client.print(`Ustawiono ${bag} jako pojemnik na wszystkie typy.`);
    saveConfig(client);
}

export function containerAction(
    client: Client,
    type: ContainerType,
    action: "put" | "take",
    item: string
) {
    const bag = resolveBag(type);
    const forms = bag ? getBagForms(bag) : null;
    if (!forms) {
        client.print(`Brak pojemnika dla typu '${typeLabel(type)}'.`);
        return;
    }
    const settings = characterStorage.get("settings");
    const shouldOpen = settings?.containerOpen !== false;
    const shouldClose = settings?.containerClose !== false;
    const items = item
        .split(",")
        .map((i) => i.trim())
        .filter((i) => i.length);
    if (shouldOpen) client.sendCommand(`otworz ${forms.biernik}`);
    items.forEach((it) =>
        client.sendCommand(
            action === "put"
                ? `wloz ${it} do ${forms.dopelniacz}`
                : `wez ${it} ${forms.from} ${forms.dopelniacz}`
        )
    );
    if (shouldClose) client.sendCommand(`zamknij ${forms.biernik}`);
}

export type ContainerListing = {
    container: string;
    items: { name: string; count: string | number }[];
};

type PendingInspection = {
    forms: string[];
    silent: boolean;
    resolve: (items: ContainerListing["items"] | null) => void;
    timer: ReturnType<typeof setTimeout>;
};

const pendingInspections: PendingInspection[] = [];

/**
 * Looks into the bag assigned to a type and resolves with its parsed contents,
 * or null when no listing arrives in time (e.g. empty bag, bag not carried).
 * With silent, the command echo and the listing line are hidden.
 */
export function inspectContainer(
    client: Client,
    type: ContainerType,
    options: { silent?: boolean; timeout?: number } = {}
): Promise<ContainerListing["items"] | null> {
    const bag = resolveBag(type);
    const forms = bag ? getBagForms(bag) : null;
    if (!forms) return Promise.resolve(null);
    const silent = !!options.silent;
    return new Promise((resolve) => {
        const pending: PendingInspection = {
            forms: [forms.noun, bagInBiernik[forms.noun], bagInDopelniacz[forms.noun]],
            silent,
            resolve,
            timer: setTimeout(() => {
                const idx = pendingInspections.indexOf(pending);
                if (idx >= 0) pendingInspections.splice(idx, 1);
                resolve(null);
            }, options.timeout ?? 5000),
        };
        pendingInspections.push(pending);
        client.sendCommand(`zajrzyj do ${forms.dopelniacz}`, !silent);
    });
}

/**
 * Called for every container listing seen in game output. Resolves the oldest pending
 * inspection of that bag; returns true when the listing line should be hidden.
 */
export function handleContainerListing(listing: ContainerListing): boolean {
    const noun = listing.container.trim().toLowerCase().split(/\s+/).pop() ?? "";
    const idx = pendingInspections.findIndex((p) => p.forms.includes(noun));
    if (idx < 0) return false;
    const [pending] = pendingInspections.splice(idx, 1);
    clearTimeout(pending.timer);
    pending.resolve(listing.items);
    return pending.silent;
}

export function takeFromBag(
    client: Client,
    item: string,
    type: ContainerType = "other"
) {
    containerAction(client, type, "take", item);
}

function showConfig(client: Client) {
    const pairs = allTypes().map((t) => {
        const bag = resolveBag(t) ?? "-";
        return [typeLabel(t), isInherited(t) ? `${bag} (jak ${typeLabel(customTypes.get(t)!.fallback)})` : bag];
    });

    const headers = ["typ", "pojemnik"];
    const col1Width = Math.max(...pairs.map(([t]) => t.length), headers[0].length);
    const col2Width = Math.max(...pairs.map(([, b]) => b.length), headers[1].length);

    const pad = (buf: AnsiAwareBuffer, len: number) => {
        const spaces = Math.max(0, len - buf.length);
        buf.append(" ".repeat(spaces), {});
        return buf;
    };

    const center = (text: string, len: number, color?: FormatStateSnapshot) => {
        const buf = new AnsiAwareBuffer();
        const l = text.length;
        const left = Math.floor((len - l) / 2);
        buf.append(" ".repeat(left), {});
        buf.appendBuffer(colorString(text, color));
        buf.append(" ".repeat(len - l - left), {});
        return buf;
    };

    const padSize = 3;
    const width = col1Width + col2Width + (padSize * 4) + 3;
    const horiz1 = "-".repeat(col1Width + padSize * 2);
    const horiz2 = "-".repeat(col2Width + padSize * 2);

    const lines: AnsiAwareBuffer[] = [];

    // Top border
    lines.push(new AnsiAwareBuffer(`/${"-".repeat(width - 2)}\\`));

    // Header with title
    const headerLine = new AnsiAwareBuffer("|");
    headerLine.appendBuffer(center("POJEMNIKI", width - 2, HEADER_COLOR));
    headerLine.append("|", {});
    lines.push(headerLine);

    // Separator
    lines.push(new AnsiAwareBuffer(`+${horiz1}+${horiz2}+`));

    // Column headers
    const headerRow = new AnsiAwareBuffer("|");
    headerRow.append(" ".repeat(padSize), {});
    headerRow.append(headers[0]);
    headerRow.append(" ".repeat(col1Width - headers[0].length + padSize), {});
    headerRow.append("|", {});
    headerRow.append(" ".repeat(padSize), {});
    headerRow.append(headers[1]);
    headerRow.append(" ".repeat(col2Width - headers[1].length + padSize), {});
    headerRow.append("|", {});
    lines.push(headerRow);

    // Separator
    lines.push(new AnsiAwareBuffer(`+${horiz1}+${horiz2}+`));

    // Data rows
    pairs.forEach(([t, b]) => {
        const row = new AnsiAwareBuffer("|");
        row.append(" ".repeat(padSize), {});
        const typeBuf = colorString(t, TYPE_COLOR);
        pad(typeBuf, col1Width);
        row.appendBuffer(typeBuf);
        row.append(" ".repeat(padSize), {});
        row.append("|");
        row.append(" ".repeat(padSize), {});
        const bagBuf = colorString(b, BAG_COLOR);
        pad(bagBuf, col2Width);
        row.appendBuffer(bagBuf);
        row.append(" ".repeat(padSize));
        row.append("|");
        lines.push(row);
    });

    // Bottom border
    lines.push(new AnsiAwareBuffer(`\\${"-".repeat(width - 2)}/`));

    // Plugin types with their own bag can go back to their fallback's bag
    customTypes.forEach(({ fallback }, type) => {
        if (isInherited(type)) return;
        const line = new AnsiAwareBuffer(`${typeLabel(type)}: `);
        const text = `uzyj pojemnika na '${typeLabel(fallback)}'`;
        const textBuffer = colorString(text, TYPE_COLOR);
        textBuffer.createLink([0, text.length], {
            onClick: () => resetContainer(type, client),
            title: `Przywroc domyslny pojemnik dla ${typeLabel(type)}`
        });
        line.append("[ ", {});
        line.appendBuffer(textBuffer);
        line.append(" ]", {});
        lines.push(line);
    });

    // Combine all lines
    const output = new AnsiAwareBuffer();
    lines.forEach((line, i) => {
        if (i > 0) output.append("\n");
        output.appendBuffer(line);
    });

    client.println(output);
}

type FoundBag = { noun: string; description: string };

/** Last few words before the bag noun, within its own item of the inventory list */
function describeBefore(text: string): string {
    const words = text.split(",").pop()!.trim().split(/\s+/).filter(Boolean);
    let start = words.length;
    while (start > 0 && !descriptionStops.has(words[start - 1]) && !(words[start - 1] in numerals)) start--;
    return words.slice(Math.max(start, words.length - 3)).join(" ");
}

/** Bags named in an inventory line, in order; "dwie runiczne sakiewki" counts as two */
function findBags(line: string): FoundBag[] {
    const found: { at: number; bag: FoundBag }[] = [];
    Object.keys(bagInBiernik).forEach((noun) => {
        const singular = new RegExp(`\\b${bagInBiernik[noun]}\\b`, "g");
        for (const match of line.matchAll(singular)) {
            found.push({ at: match.index!, bag: { noun, description: describeBefore(line.slice(0, match.index)) } });
        }
        const plural = new RegExp(`\\b(${Object.keys(numerals).join("|")})\\s+((?:[a-z-]+\\s+){0,4})(?:${bagPlural[noun].join("|")})\\b`, "g");
        for (const match of line.matchAll(plural)) {
            const bag = { noun, description: match[2].trim() };
            for (let i = 0; i < numerals[match[1]]; i++) found.push({ at: match.index!, bag });
        }
    });
    return found.sort((a, b) => a.at - b.at).map(({ bag }) => bag);
}

/** Bags to offer: the bare noun when only one is carried, numbered when there are several */
function bagChoices(found: FoundBag[]): { bag: string; label: string }[] {
    const counts = new Map<string, number>();
    found.forEach(({ noun }) => counts.set(noun, (counts.get(noun) ?? 0) + 1));
    const seen = new Map<string, number>();
    return found.map(({ noun, description }) => {
        if (counts.get(noun) === 1) return { bag: noun, label: noun };
        const index = (seen.get(noun) ?? 0) + 1;
        seen.set(noun, index);
        const bag = `${index}. ${noun}`;
        return { bag, label: description ? `${bag} (${description})` : bag };
    });
}

function showInterface(client: Client, bags: { bag: string; label: string }[]) {
    const lines: AnsiAwareBuffer[] = [];
    bags.forEach(({ bag, label }) => {
        const line = new AnsiAwareBuffer(`Ustaw ${label} jako:`);
        allTypes().forEach((type) => {
            const text = typeLabel(type);
            const textBuffer = colorString(text, TYPE_COLOR);
            textBuffer.createLink([0, text.length], {
                onClick: () => setContainer(type, bag, client),
                title: `Ustaw ${bag} jako ${text}`
            });
            line.append(" [ ", {});  // Explicitly use default (no color/link)
            line.appendBuffer(textBuffer);
            line.append(" ]", {});  // Explicitly use default (no color/link)
        });
        const allText = `wszystkie`;
        const allBuffer = colorString(allText, TYPE_COLOR);
        allBuffer.createLink([0, allText.length], {
            onClick: () => setAll(bag, client),
            title: `Ustaw wszystkie jako ${bag}`
        });
        line.append(" [ ", {});  // Explicitly use default (no color/link)
        line.appendBuffer(allBuffer);
        line.append(" ]", {});  // Explicitly use default (no color/link)
        lines.push(line);
    });

    const output = new AnsiAwareBuffer();
    lines.forEach((line, i) => {
        if (i > 0) output.append("\n");
        output.appendBuffer(line);
    });
    client.println(output);
}

function configure(client: Client) {
    const found: FoundBag[] = [];
    const tag = "bag-config";
    client.Triggers.registerTrigger(/.*/, (line) => {
        const rawLine = line.text.toLowerCase();
        found.push(...findBags(rawLine));
        // "Masz przy sobie" closes the inventory but lists carried bags too
        if (rawLine.startsWith("masz przy sobie")) {
            client.Triggers.removeByTag(tag);
            showInterface(client, bagChoices(found));
        }
        return line;
    }, tag);
    client.sendCommand("i");
}

export default function initBagManager(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const initialContainers = characterStorage.get(STORAGE_KEY);
    if (initialContainers) Object.assign(containerConfig, initialContainers);

    characterStorage.onChange(STORAGE_KEY, (newValue) => {
        if (!newValue) return;
        // Plugin types without a bag of their own are absent - drop overrides reset elsewhere
        Object.keys(containerConfig).forEach((type) => {
            if (!isBuiltIn(type) && !(type in newValue)) delete containerConfig[type];
        });
        Object.assign(containerConfig, newValue);
    });
    window.addEventListener("beforeunload", () => saveConfig(client));

    client.Triggers.registerTrigger(
        "Nie masz wystarczajacej ilosci pieniedzy, zeby zaplacic.",
        (line) => {
            client.FunctionalBind.set("wez monety z pojemnika", () => {
                containerAction(client, "money", "take", "monety");
            });
            return line;
        },
        "bagManager"
    );

    if (aliases) {
        aliases.push({ pattern: /^\/pojemnik$/, callback: () => configure(client) });
        aliases.push({ pattern: /^\/pojemniki$/, callback: () => showConfig(client) });
        aliases.push({ pattern: /^\/wdp (.*)/, callback: (m: RegExpMatchArray) => containerAction(client, "other", "put", m[1]) });
        aliases.push({ pattern: /^\/wzp (.*)/, callback: (m: RegExpMatchArray) => containerAction(client, "other", "take", m[1]) });
        aliases.push({ pattern: /^\/wlp$/, callback: () => containerAction(client, "other", "put", "pocztowa paczke") });
        aliases.push({ pattern: /^\/wep$/, callback: () => containerAction(client, "other", "take", "pocztowa paczke") });
        aliases.push({ pattern: /^\/?wem$/, callback: () => containerAction(client, "money", "take", "monety") });
        aliases.push({ pattern: /^\/?wlm$/, callback: () => containerAction(client, "money", "put", "monety") });
    }
}
