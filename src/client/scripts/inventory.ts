import Client from "../Client";
import eventBus from "@modules/core/eventBus";
import { characterStorage } from "@modules/core/storage";
import { onContainerListing, parseItems, splitItemList, type ContainerItem, type ParsedContainer } from "./prettyContainers";
import { getAssignedBags, setCarriedBagOrdinals } from "./bagManager";
import { normalizeHerbBagsState } from "../types/herbs";
import { getZlomSnapshot, iLineEntries, type ZlomSnapshot } from "@modules/data/zlomStore";

/**
 * Tracks what the character carries for the inventory window.
 *
 * The `i` reply is the source of truth. Between replies, the game's own
 * messages keep the list current: they name the item in the same case as the
 * `Masz przy sobie` list. Only the number differs ("Odkladasz woreczek" takes
 * one of "dwa woreczki"), so items are matched word by word on their stems and
 * the count goes up or down. What still cannot be matched only marks the list
 * stale. A hidden `i` goes out when the player refreshes the window, or opens
 * it for a character never checked, never by itself.
 *
 * The state is kept per character (`inventory`), which also syncs it between
 * devices with the other character keys, newest wins.
 */

export interface ContainerContents {
    items: ContainerItem[];
    at: number;
    /** Something was put in or taken out since the listing */
    stale: boolean;
}

export interface InventoryEntry {
    /** As the game lists it, count word included: "dwa zamkniete woreczki" */
    text: string;
    /** Accusative, as commands take it: "zamkniety skorzany woreczek z herbem" */
    name: string;
    /** For display: the name without the open/closed word, which `state` carries */
    label: string;
    count: string | number;
    /** Stays the same when a bag is opened, closed or emptied */
    key: string;
    state?: "open" | "closed";
    /** Bag noun in the accusative ("woreczek", "torbe"), for a single bag */
    noun?: string;
    /** On the back or at the belt, where a bag answers to "zalozony" */
    worn?: boolean;
    /** The bag's number in the game among all of its kind, checked with `ocen` */
    ordinal?: number;
    /** Types this bag holds in /pojemnik ("money", "gems", ...), when it is one of those bags */
    assigned?: { id: string; label: string }[];
    /**
     * A woreczek's herbs as the herb manager counted them (its bag of the same
     * number), or null when it has not counted this bag. Woreczki are the herb
     * manager's: their listings are its to read.
     */
    herbs?: { id: string; count: number }[] | null;
    /** A sheath or sling, with the weapon in it, if any */
    holder?: { held: string[] };
    /** A single bag the client can look into, with what was last seen in it */
    container?: {
        contents: ContainerContents | null;
        inspecting: boolean;
    };
}

export interface InventorySection {
    label: string;
    entries: InventoryEntry[];
}

export interface InventoryState {
    sections: InventorySection[];
    updatedAt: number | null;
    stale: boolean;
    refreshing: boolean;
    /**
     * Bags whose number in the game is not known: worn and carried ones of the
     * same kind, where "swoj" may well mean the worn one. `ocen` tells, when the
     * player asks for it ("inventory.verify").
     */
    unsure: { noun: string; label: string }[];
    /** Asking `ocen` right now */
    verifying: boolean;
}

const STORAGE_KEY = "inventory";

/** Where new things land */
const CARRIED = "Przy sobie";
const IN_HANDS = "W rękach";

/** "... - symbol rozpoznawczy pocztylionow": whatever the item, it marks a role and is left out */
const SIGN = / - symbol rozpoznawcz/;

/** One listed item, and for a sheath or sling the weapon in it */
interface Listed {
    text: string;
    held?: string[];
}

/**
 * A weapon as a sheath holds it, "z tkwiacym w niej dlugim krwistym sztyletem",
 * named as it is anywhere else: "dlugi krwisty sztylet".
 */
function heldName(instrumental: string): string {
    return instrumental
        .split(/\s+/)
        .map(word => word.replace(/ym$/, "y").replace(/([kg])im$/, "$1i").replace(/(\w{3})em$/, "$1"))
        .join(" ");
}

/**
 * The items of one listed part, as the game writes them. Beyond the plain
 * "a, b i c" list: a sheath or sling holds a weapon ("pochwe z futrem,
 * zawierajaca dlugi sztylet", "pochwe z tkwiacym w niej sztyletem"), which
 * stays inside it, and relative clauses are description, not items ("obrozy
 * z runa, ktorej ostre cwieki ...", "pancerza, na ktorego naramiennikach ...").
 */
function listedItems(content: string): Listed[] {
    // "pochwe i temblak z tkwiacymi w nich bastardem i mlotem": holders, then what they hold, in order
    const [holding, holdingWhat] = content.split(/ z tkwiacym(?:i)? w (?:niej|nim|nich) /);
    if (holdingWhat !== undefined) {
        const holders = listedItems(holding);
        const weapons = splitItemList(holdingWhat.replace(/\.$/, "")).map(heldName);
        if (holders.length === weapons.length) holders.forEach((holder, i) => { holder.held = [weapons[i]]; });
        else if (holders.length) holders[holders.length - 1].held = weapons;
        return holders;
    }
    // One item described in sentences: "doskonale dopasowana, ciemna bretonska zbroje plytowa,
    // chroniaca cialo od szyi az do stop. Jej prawa, pozbawiona ozdob strona ..." - the first
    // sentence, without its participle clause, is the item; its commas join adjectives
    if (/\. [A-Z]/.test(content)) {
        const first = content.split(/\. (?=[A-Z])/)[0].replace(/, \S+ac[aey] .*$/, "");
        return [{ text: first.replace(/,/g, "") }];
    }
    const parts = splitItemList(content.replace(/\.$/, ""));
    // A relative or participle clause runs to the end, commas and all: "maske, ktorej wyraz ...,
    // wscieklosc, wrogosc ...", "przylbice z klami, nadajac groznego, zwierzecego wygladu"
    // Only "-ac" ("nadajac", "trzymajac"): "lsniaca tarcze" is an item, adjective and all
    const clause = parts.findIndex((part, i) =>
        /^(?:[a-z]+ )?ktor/.test(part) || (i > 0 && /^\S+ac\b/.test(part)));
    const listed: Listed[] = [];
    (clause < 0 ? parts : parts.slice(0, clause)).forEach(part => {
        // "krety rog - symbol rozpoznawczy pocztylionow": a sign of who you are, not something to manage
        if (SIGN.test(part)) return;
        // "temblak, zawierajacy czarnoblekitny morgenstern": the weapon goes in the item before
        const contained = part.match(/^zawierajac\S* (.+)$/);
        const previous = listed[listed.length - 1];
        if (contained && previous) previous.held = [...(previous.held ?? []), contained[1]];
        else listed.push({ text: (contained?.[1] ?? part).replace(/ - .+$/, "") });
    });
    return listed;
}

/** "Twe dlonie zakute sa w ...": an armour set that describes itself in prose, one piece per phrase */
const ARMOUR_PROSE: RegExp[] = [
    /zakute sa w (.+?), wprost/,
    /opada (.+?)\./,
    /dopelnia (.+?), zas/,
    /skrywa (.+?)\./,
];

// Patterns are ASCII-only: the game output is normalized before matching.
/**
 * `worn`: what the line lists answers to "zalozony" - on the back and at the
 * belt. Elsewhere (slung over a shoulder, ...) that is not known, so "swoj".
 */
const SECTIONS: { pattern: RegExp; label: string; worn?: true; items?: (match: RegExpMatchArray) => (string | Listed)[] }[] = [
    { pattern: /^(?:Trzymasz w rekach|W rekach trzymasz|Trzymasz oburacz) (.+)$/, label: IN_HANDS },
    { pattern: /^Trzymasz (.+?) w (?:prawej|lewej) rece/, label: IN_HANDS },
    // Part of the reply, so hidden with it, but listed nowhere: the pipe shows up with what is carried
    { pattern: /^Palisz trzyman\S* w ustach (.+)$/, label: "", items: () => [] },
    { pattern: /^(?:Jestes ubran[ya] w|Masz na sobie) (.+)$/, label: "Na sobie" },
    { pattern: /^Masz zalozon\S* (.+)$/, label: "Na sobie" },
    {
        // "Od stop do glow zakuty jestes w stalowe plyty ... pancerza, na ktorego ... Ponadto masz na sobie tarcze."
        pattern: /^Od stop do glow zakut\S* jestes w (.+?)(?:\. Ponadto masz na sobie (.+))?$/,
        label: "Na sobie",
        items: match => [...listedItems(match[1]), ...(match[2] ? listedItems(match[2]) : [])],
    },
    { pattern: /^Na zbroje masz narzucon\S* (.+)$/, label: "Na sobie" },
    // "Twoja szata / Twoje ubranie / Twoj calun jest spiety masywna zlocona spinka."
    { pattern: /^Tw(?:oj|oja|oje) \S+ jest spiet\S* (.+)$/, label: "Na sobie" },
    {
        // "Okrywa cie zwiewny, upiorny calun. Odzienie utkane jest z mgly ..."
        pattern: /^Okrywa cie (.+?)\.(?: .*)?$/,
        label: "Na sobie",
        items: match => [match[1].replace(/,/g, "")],
    },
    // "Twe upiorne oblicze jasnieje nienaturalnie, przyobleczone w maske, ktorej wyraz ..."
    { pattern: /^Tw\S+ .*\bprzyobleczon\S* w (.+)$/, label: "Na sobie" },
    {
        // "Nasuniety na serdeczny palec twej prawej dloni masywny sygnet z herbem ... jest oznaka nadanej ci pozycji ..."
        // "... dloni srebrny sygnet ... odznacza cie sposrod ...", "... dloni stalowy sygnet zdobi herb ..."
        pattern: /^Nasuniet\S* na \S+ palec twej (?:prawej|lewej) dloni (.+?) (?:jest oznaka|odznacza cie|zdobi) .+$/,
        label: "Na rękach",
        items: match => [match[1]],
    },
    {
        // "Mosiezna lampa z uchwytem u twojego pasa jest symbolem przynaleznosci do ..."
        pattern: /^(.+?) u twojego pasa jest symbolem .+$/,
        label: "Przy pasie",
        items: match => [match[1].charAt(0).toLowerCase() + match[1].slice(1)],
    },
    {
        pattern: /^Twe dlonie zakute sa w .+$/,
        label: "Na sobie",
        items: match => ARMOUR_PROSE
            .map(phrase => match[0].match(phrase)?.[1])
            .filter((piece): piece is string => !!piece)
            .map(piece => piece.replace(/,/g, "")),
    },
    {
        // "Na glowie masz garnczkowy helm zdobiony figura smoka. Z otaczajacego go zawoju ..."
        pattern: /^Na glowie masz (.+?)\.(?: .*)?$/,
        label: "Na głowie",
        items: match => [match[1]],
    },
    { pattern: /^Wokol szyi masz zacisniet\S* (.+)$/, label: "Na szyi" },
    { pattern: /^Na szyi masz (?:zawiazan\S* |zawieszon\S* |zapiet\S* |zacisniet\S* )?(.+)$/, label: "Na szyi" },
    {
        // "Noszony przez ciebie zloty pierscien jest symbolem przynaleznosci do ..."
        pattern: /^Noszon\S* przez ciebie (.+?) jest symbolem .+$/,
        label: "Na sobie",
        items: match => [match[1]],
    },
    { pattern: /^Na (?:lewym|prawym) nadgarstku nosisz (.+)$/, label: "Na rękach" },
    { pattern: /^Na palce masz nasuniet\S* (.+)$/, label: "Na rękach" },
    { pattern: /^Na plecach nosisz (.+)$/, label: "Na plecach", worn: true },
    { pattern: /^Na plecach masz przypiet\S* (.+)$/, label: "Na plecach" },
    { pattern: /^Na plecy masz zarzucon\S* (.+)$/, label: "Na plecach" },
    { pattern: /^Na (?:lewym|prawym) ramieniu nosisz (.+)$/, label: "Przez ramię" },
    { pattern: /^Masz przewieszon\S* (?:przez ramie )?(.+)$/, label: "Przez ramię" },
    { pattern: /^Na ramie zarzucon\S* masz (.+)$/, label: "Przez ramię" },
    { pattern: /^Ponad twoim (?:lewym|prawym) ramieniem widac przypiet\S* (.+)$/, label: "Przez ramię" },
    { pattern: /^Do pasa masz przytroczon\S* (.+)$/, label: "Przy pasie", worn: true },
    { pattern: /^Na biodrach nosisz (.+)$/, label: "Przy pasie" },
    { pattern: /^Przy (?:lewym|prawym) boku masz przypiet\S* (.+)$/, label: "Przy boku" },
    { pattern: /^Przy (?:lewej|prawej) nodze masz przypiet\S* (.+)$/, label: "Przy nodze" },
    {
        // "Nosisz przywiazane do pasa kawalkiem sznurka, zamkniete zawiniatko, pojemnik na mapy."
        pattern: /^Nosisz (?:przywiazan\S* do pasa kawalkiem sznurka, )?(.+)$/,
        label: "Noszone",
    },
    { pattern: /^Masz przy sobie (.+)$/, label: CARRIED },
    { pattern: /^Nie masz przy sobie niczego/, label: CARRIED },
];

/** The `i` reply ends with what is carried */
const LAST_LINE = /^(?:Masz przy sobie |Nie masz przy sobie niczego)/;

/** The złom pieces with an `i` line, compiled once per version of the list */
let iLinesOf: { snapshot: ZlomSnapshot; entries: ReturnType<typeof iLineEntries> } | null = null;
function iLines(): ReturnType<typeof iLineEntries> {
    const snapshot = getZlomSnapshot();
    if (iLinesOf?.snapshot !== snapshot) iLinesOf = { snapshot, entries: iLineEntries(snapshot) };
    return iLinesOf.entries;
}

type ActionKind = "take" | "drop" | "give" | "put" | "open" | "close" | "change";

/** Commands that change the inventory, and the reply confirming each */
/**
 * Commands that change the inventory, the reply confirming each, and the
 * reply saying it did not happen ("Zamkniety skorzany plecak nie chce wejsc.")
 */
const ACTIONS: { command: RegExp; reply: RegExp; fail?: RegExp; kind: ActionKind }[] = [
    { command: /^(?:wez|podnies)\s/, reply: /^(?:Bierzesz|Podnosisz|Wyjmujesz) (.+)\.$/, kind: "take" },
    { command: /^(?:odloz|upusc|poloz)\s/, reply: /^Odkladasz (.+)\.$/, kind: "drop" },
    { command: /^daj\s/, reply: /^Dajesz (.+)\.$/, kind: "give" },
    { command: /^(?:wloz|schowaj)\s/, reply: /^Wkladasz (.+)\.$/, fail: /^.+ nie chce wejsc\.$/, kind: "put" },
    { command: /^otworz\s/, reply: /^Otwierasz (.+)\.$/, kind: "open" },
    { command: /^zamknij\s/, reply: /^Zamykasz (.+)\.$/, kind: "close" },
    { command: /^zaloz\s/, reply: /^Zakladasz /, kind: "change" },
    { command: /^zdejmij\s/, reply: /^Zdejmujesz /, kind: "change" },
];

const GIVEN = /^[A-Z][A-Za-z !()-]* daje ci (.+)\.$/;

/** How long after a command its reply is still expected */
const ACTION_WINDOW_MS = 5000;
const REPLY_TIMEOUT_MS = 4000;
/** Lines of one `i` reply come together; older ones belong to something else */
const BLOCK_GAP_MS = 1500;

/**
 * Bags the client can look into: accusative noun -> what follows `zajrzyj do`,
 * and the plurals that follow a count ("dwa woreczki", "piec woreczkow").
 * Not zawiniatko: that one is a club item.
 */
export const BAG_NOUNS: Record<string, { pronoun: "swojego" | "swojej"; genitive: string; plural: string[] }> = {
    plecak: { pronoun: "swojego", genitive: "plecaka", plural: ["plecaki", "plecakow"] },
    torbe: { pronoun: "swojej", genitive: "torby", plural: ["torby", "toreb"] },
    sakwe: { pronoun: "swojej", genitive: "sakwy", plural: ["sakwy", "sakw"] },
    sakiewke: { pronoun: "swojej", genitive: "sakiewki", plural: ["sakiewki", "sakiewek"] },
    szkatulke: { pronoun: "swojej", genitive: "szkatulki", plural: ["szkatulki", "szkatulek"] },
    wor: { pronoun: "swojego", genitive: "wora", plural: ["wory", "worow"] },
    worek: { pronoun: "swojego", genitive: "worka", plural: ["worki", "workow"] },
    woreczek: { pronoun: "swojego", genitive: "woreczka", plural: ["woreczki", "woreczkow"] },
    mieszek: { pronoun: "swojego", genitive: "mieszka", plural: ["mieszki", "mieszkow"] },
    kaletke: { pronoun: "swojej", genitive: "kaletki", plural: ["kaletki", "kaletek"] },
};

/** /pojemnik names bags in the nominative; the inventory lists them in the accusative */
const BAG_ACCUSATIVE: Record<string, string> = {
    plecak: "plecak", torba: "torbe", sakwa: "sakwe", sakiewka: "sakiewke", szkatulka: "szkatulke",
    wor: "wor", worek: "worek", woreczek: "woreczek", mieszek: "mieszek", kaletka: "kaletke",
};

const BAG_NOMINATIVE: Record<string, string> = Object.fromEntries(
    Object.entries(BAG_ACCUSATIVE).map(([nominative, accusative]) => [accusative, nominative]),
);

const BAG_PLURALS: Record<string, string> = Object.fromEntries(
    Object.entries(BAG_NOUNS).flatMap(([noun, { plural }]) => plural.map(form => [form, noun])),
);

/**
 * An adjective before a plural bag noun, as it reads before one bag in the
 * accusative: "zamkniete"/"zamknietych" -> "zamkniety" (or "zamknieta").
 */
function singularAdjective(word: string, feminine: boolean): string {
    const ending = feminine ? "a" : "y";
    if (/[kg]ie$/.test(word)) return word.replace(/ie$/, feminine ? "a" : "i");
    if (/[kg]ich$/.test(word)) return word.replace(/ich$/, feminine ? "a" : "i");
    if (/ych$/.test(word)) return word.replace(/ych$/, ending);
    if (/e$/.test(word)) return word.replace(/e$/, ending);
    return word;
}

const OPEN_WORDS = new Set(["otwarty", "otwarta", "otwarte"]);
const CLOSED_WORDS = new Set(["zamkniety", "zamknieta", "zamkniete"]);

/** Words that change with the bag's state, not its identity */
const STATE_WORDS = new Set([
    "otwarty", "otwarta", "otwarte", "zamkniety", "zamknieta", "zamkniete",
    "prawie", "pusty", "pusta", "puste", "pelny", "pelna", "pelne",
    "swoj", "swoja", "swoje", "swojego", "swojej",
]);

/**
 * Case-tolerant identity of an item: state words dropped and the last letter of
 * each word cut, so "skorzana torba" (a listing) meets "skorzana torbe" (the list).
 */
export function stemKey(name: string): string {
    return name
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word && !STATE_WORDS.has(word))
        .map(word => (word.length > 3 ? word.slice(0, -1) : word))
        .join(" ");
}

interface Entry {
    text: string;
    name: string;
    count: string | number;
    key: string;
    /** Bag noun, for a single bag */
    noun?: string;
    /** The weapon in a sheath or sling */
    held?: string[];
    /** On the back or at the belt: a bag there is "zalozony" */
    worn?: boolean;
}

/** Things the window leaves out: a zawiniatko is a club item, not something to manage */
const IGNORED = /(?:^|\s)zawiniatk/;

function isIgnored(text: string): boolean {
    return IGNORED.test(text);
}

/** Sheaths and slings: each made for one weapon */
const HOLDER = /(?:^|\s)(?:pochw|temblak)/;

interface Section {
    label: string;
    entries: Entry[];
}

function toEntry(text: string): Entry {
    const [item] = parseItems(text);
    const name = item?.name ?? text;
    const count = item?.count ?? 1;
    const noun = count === 1 ? name.toLowerCase().split(/\s+/).find(word => word in BAG_NOUNS) : undefined;
    return { text, name, count, key: stemKey(name), ...(noun && { noun }) };
}

/**
 * Entries for one listed item. Several bags of a kind become one entry each,
 * named in the singular, since each one is looked into on its own
 * ("zajrzyj do 2. swojego woreczka").
 */
function toEntries(text: string): Entry[] {
    const entry = toEntry(text);
    if (typeof entry.count !== "number" || entry.count < 2) return [entry];
    const words = entry.name.split(/\s+/);
    const at = words.findIndex(word => word.toLowerCase() in BAG_PLURALS);
    if (at < 0) return [entry];
    const noun = BAG_PLURALS[words[at].toLowerCase()];
    const feminine = BAG_NOUNS[noun].pronoun === "swojej";
    const single = [
        ...words.slice(0, at).map(word => singularAdjective(word, feminine)),
        noun,
        ...words.slice(at + 1),
    ].join(" ");
    return Array.from({ length: entry.count }, () => toEntry(single));
}

/** Gives the entry a key no other entry has: "#2", "#3", ... after the first */
function uniqueKey(entry: Entry, taken: Set<string>) {
    const base = stemKey(entry.name);
    entry.key = base;
    for (let n = 2; taken.has(entry.key); n++) entry.key = `${base}#${n}`;
    taken.add(entry.key);
}

/** Sections of an `i` reply, in the game's order */
export function parseInventory(lines: string[]): Section[] {
    const sections: Section[] = [];
    lines.forEach(line => {
        const rule = SECTIONS.find(({ pattern }) => pattern.test(line));
        if (!rule) return;
        if (!rule.label) return;
        const match = line.match(rule.pattern)!;
        const listed = rule.items ? rule.items(match) : match[1] ? listedItems(match[1]) : [];
        // "Nie masz przy sobie niczego" still has its (empty) section
        let section = sections.find(s => s.label === rule.label);
        if (!section && (listed.length > 0 || !match[1])) {
            section = { label: rule.label, entries: [] };
            sections.push(section);
        }
        listed.forEach(item => {
            const { text, held } = typeof item === "string" ? { text: item, held: undefined } : item;
            if (isIgnored(text)) return;
            const added = toEntries(text);
            if (held && added.length === 1) added[0].held = held;
            if (rule.worn) added.forEach(entry => { entry.worn = true; });
            section!.entries.push(...added);
        });
        // A part with only ignored things in it, such as "Nosisz zamkniete zawiniatko."
        if (section && section.entries.length === 0 && match[1]) sections.splice(sections.indexOf(section), 1);
    });
    // Two identical names, e.g. split bags, still get their own keys
    const taken = new Set<string>();
    sections.forEach(section => section.entries.forEach(entry => uniqueKey(entry, taken)));
    return sections;
}

let sections: Section[] = [];
let updatedAt: number | null = null;
let stale = false;
let refreshing = false;
const contents = new Map<string, ContainerContents>();
let inspecting: { key: string; until: number } | null = null;

function entries(): Entry[] {
    return sections.flatMap(section => section.entries);
}

export interface BagCommandForms {
    /** After otworz / zamknij: "2. swoj woreczek", "zalozony plecak" */
    biernik: string;
    /** After do / z: "2. swojego woreczka", "zalozonego plecaka" */
    dopelniacz: string;
    /** "ze swojego", but "z 2. swojego" and "z zalozonego" */
    from: "z" | "ze";
}

/**
 * A carried bag in commands. A worn one (on the back, at the belt) is
 * "zalozony", any other "swoj". Each is numbered only among bags of its own
 * kind - worn or not - and only when there are several: where a worn bag falls
 * in the game's count of all of them is not known, so it is never counted in.
 */
export function bagCommandForms(key: string): BagCommandForms | null {
    const entry = entries().find(e => e.key === key);
    if (!entry?.noun) return null;
    const { pronoun, genitive } = BAG_NOUNS[entry.noun];
    const feminine = pronoun === "swojej";
    const same = entries().filter(e => e.noun === entry.noun && !!e.worn === !!entry.worn);
    // Checked with `ocen`: the game's own number, among all of its kind
    const known = entry.worn ? undefined : verifiedOrdinal(entry);
    const ordinal = known ? `${known}. ` : same.length > 1 ? `${same.indexOf(entry) + 1}. ` : "";
    if (entry.worn) {
        return {
            biernik: `${ordinal}${feminine ? "zalozona" : "zalozony"} ${entry.noun}`,
            dopelniacz: `${ordinal}${feminine ? "zalozonej" : "zalozonego"} ${genitive}`,
            from: "z",
        };
    }
    return {
        biernik: `${ordinal}${feminine ? "swoja" : "swoj"} ${entry.noun}`,
        dopelniacz: `${ordinal}${pronoun} ${genitive}`,
        from: ordinal ? "z" : "ze",
    };
}

/**
 * Game numbers learned with `ocen`, per bag noun. A bag is told apart by what it
 * is - its words, state words aside, and whether it is worn: "worn:zolt podrozn
 * pleca". That holds across refreshes, opening and filling it; the numbers stand
 * while the same bags of the noun are carried the same way (`bags`, sorted).
 */
export interface CheckedBags {
    bags: string;
    numbers: { bag: string; ordinal: number }[];
}

let ordinals: Record<string, CheckedBags> = {};
/** Asking `ocen` for the window right now */
let verifying = false;

function bagsOf(noun: string): Entry[] {
    return entries().filter(e => e.noun === noun);
}

function bagIdentity(entry: Entry): string {
    return `${entry.worn ? "worn" : "carried"}:${stemKey(entry.name)}`;
}

function signature(noun: string): string {
    return bagsOf(noun).map(bagIdentity).sort().join("|");
}

function checked(noun: string): CheckedBags | undefined {
    const known = ordinals[noun];
    // An older store kept numbers by entry key: not usable, check again
    return known && Array.isArray(known.numbers) && known.bags === signature(noun) ? known : undefined;
}

function verifiedOrdinal(entry: Entry): number | undefined {
    const known = entry.noun ? checked(entry.noun) : undefined;
    if (!known) return undefined;
    // Identical bags take the numbers given to their identity in turn
    const identity = bagIdentity(entry);
    const twins = bagsOf(entry.noun!).filter(e => bagIdentity(e) === identity);
    const numbers = known.numbers.filter(n => n.bag === identity).map(n => n.ordinal).sort((a, b) => a - b);
    return numbers[twins.indexOf(entry)];
}

/** Nouns with both worn and carried bags, not checked since they last changed */
function unsureNouns(): string[] {
    const nouns = new Set(entries().filter(e => e.noun).map(e => e.noun!));
    return [...nouns].filter(noun => {
        const bags = bagsOf(noun);
        if (!bags.some(e => e.worn) || !bags.some(e => !e.worn)) return false;
        return !checked(noun);
    });
}

/**
 * The carried bag /pojemnik calls "2. plecak" (the second carried one), as the
 * game numbers it among all of its kind - once checked with `ocen`.
 */
function carriedBagOrdinal(noun: string, index: number): number | undefined {
    const entry = bagsOf(noun).filter(e => !e.worn)[index - 1];
    return entry ? verifiedOrdinal(entry) : undefined;
}

/** `zajrzyj do` target of a bag */
function inspectTarget(entry: Entry): string | null {
    return bagCommandForms(entry.key)?.dopelniacz ?? null;
}

/** "zamkniety skorzany plecak" -> label "skorzany plecak", state "closed" */
function describe(name: string): Pick<InventoryEntry, "label" | "state"> {
    const words = name.split(/\s+/);
    const state = words.some(w => CLOSED_WORDS.has(w)) ? "closed"
        : words.some(w => OPEN_WORDS.has(w)) ? "open"
        : undefined;
    const label = words.filter(w => !CLOSED_WORDS.has(w) && !OPEN_WORDS.has(w)).join(" ");
    return { label: label || name, ...(state && { state }) };
}

/** Bag key -> the /pojemnik types it holds: "2. sakiewka" is the second sakiewka carried */
function assignedBags(): Map<string, { id: string; label: string }[]> {
    const result = new Map<string, { id: string; label: string }[]>();
    getAssignedBags().forEach(({ bag, types }) => {
        // "2. zalozona sakiewka" is the second worn one, "2. sakiewka" the second not worn
        const match = bag.match(/^(?:(\d+)\.\s*)?(zalozon[ya]\s+)?(\S+)$/);
        const noun = match && BAG_ACCUSATIVE[match[3]];
        if (!match || !noun) return;
        const worn = match[2] !== undefined;
        const entry = entries().filter(e => e.noun === noun && !!e.worn === worn)[Number(match[1] ?? 1) - 1];
        if (entry) result.set(entry.key, types);
    });
    return result;
}

/**
 * Each woreczek's herbs from the herb manager, by entry key. It numbers bags
 * as "N. swojego woreczka", which is the order they are carried in here too.
 */
function herbBags(): Map<string, { id: string; count: number }[] | null> {
    const counted = normalizeHerbBagsState(characterStorage.get("herb_counts"));
    const result = new Map<string, { id: string; count: number }[] | null>();
    entries().filter(e => e.noun === "woreczek").forEach((entry, i) => {
        const bag = counted[i + 1];
        result.set(entry.key, bag ? Object.entries(bag.herbs).map(([id, count]) => ({ id, count })) : null);
    });
    return result;
}

export function getInventoryState(): InventoryState {
    const now = Date.now();
    const assigned = assignedBags();
    const herbs = herbBags();
    const numbers = new Map(entries().filter(e => e.noun).map(e => [e.key, verifiedOrdinal(e)]));
    return {
        sections: sections.map(section => ({
            label: section.label,
            entries: section.entries.map(({ text, name, count, key, noun, held, worn }) => ({
                text,
                name,
                ...describe(name),
                ...(worn && { worn }),
                count,
                key,
                ...(HOLDER.test(name) && { holder: { held: held ?? [] } }),
                ...(noun && {
                    noun,
                    ...(assigned.has(key) && { assigned: assigned.get(key) }),
                    ...(herbs.has(key) && { herbs: herbs.get(key) }),
                    ...(numbers.get(key) !== undefined && { ordinal: numbers.get(key) }),
                    container: {
                        contents: contents.get(key) ?? null,
                        inspecting: inspecting?.key === key && inspecting.until > now,
                    },
                }),
            })),
        })),
        updatedAt,
        stale,
        refreshing,
        unsure: unsureNouns().map(noun => ({ noun, label: BAG_NOMINATIVE[noun] ?? noun })),
        verifying,
    };
}

/** What is kept per character, and synced: enough to show the window without asking the game */
export interface StoredInventory {
    sections: Section[];
    updatedAt: number;
    stale: boolean;
    contents: Record<string, ContainerContents>;
    /** Game numbers of bags, checked with `ocen` */
    ordinals?: Record<string, CheckedBags>;
}

/** The last value written or loaded, so our own write echoing back is not a change */
let lastStored: string | null = null;

function save() {
    if (updatedAt === null) return;
    const value: StoredInventory = { sections, updatedAt, stale, contents: Object.fromEntries(contents), ordinals };
    const raw = JSON.stringify(value);
    if (raw === lastStored) return;
    lastStored = raw;
    characterStorage.set(STORAGE_KEY, value);
}

function load(value: StoredInventory | undefined) {
    lastStored = value ? JSON.stringify(value) : null;
    sections = value?.sections ?? [];
    updatedAt = value?.updatedAt ?? null;
    stale = value?.stale ?? false;
    contents.clear();
    Object.entries(value?.contents ?? {}).forEach(([key, listing]) => contents.set(key, listing));
    ordinals = value?.ordinals ?? {};
    inspecting = null;
}

/** Every change goes through here: the window hears of it and the character's copy is saved */
function emitUpdate() {
    save();
    eventBus.emit("inventory.updated");
}

/** One word in two inflections: "woreczek" / "woreczki" / "woreczkow", "skorzany" / "skorzanych" */
function sameWord(a: string, b: string): boolean {
    if (a === b) return true;
    let shared = 0;
    while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
    return shared >= Math.max(3, Math.min(a.length, b.length) - 2);
}

function sameItem(a: string, b: string): boolean {
    const wordsA = a.toLowerCase().split(/\s+/);
    const wordsB = b.toLowerCase().split(/\s+/);
    return wordsA.length === wordsB.length && wordsA.every((word, i) => sameWord(word, wordsB[i]));
}

/**
 * The entry an item phrase refers to: written the same way, or the same item
 * in another number, since "Odkladasz woreczek" takes one of "dwa woreczki".
 */
function findItem(text: string): Entry | undefined {
    const exact = entries().find(entry => entry.text === text);
    if (exact) return exact;
    const [item] = parseItems(text);
    return item && entries().find(entry => sameItem(entry.name, item.name));
}

function setCount(entry: Entry, count: number, name: string) {
    const noun = count === 1 ? name.toLowerCase().split(/\s+/).find(word => word in BAG_NOUNS) : undefined;
    Object.assign(entry, { count, name, text: count === 1 ? name : `${count} ${name}`, noun });
}

function removeEntry(entry: Entry) {
    sections.forEach(section => {
        section.entries = section.entries.filter(e => e !== entry);
    });
}

/** Takes the item off the list or lowers its count; false when it is not on the list */
function removeItem(text: string): boolean {
    if (isIgnored(text)) return true;
    const [item] = parseItems(text);
    let remaining = item.count;
    // "Odkladasz dwa woreczki" can take two entries: split bags are one each
    for (;;) {
        const entry = findItem(text);
        if (!entry) return false;
        if (entry.text === text || entry.count === remaining) {
            removeEntry(entry);
            return true;
        }
        if (typeof entry.count !== "number" || typeof remaining !== "number") return false;
        if (entry.count > remaining) {
            const left = entry.count - remaining;
            // The message names a single one in the singular, which is how one left is listed
            setCount(entry, left, left === 1 && item.count === 1 ? item.name : entry.name);
            return true;
        }
        removeEntry(entry);
        remaining -= entry.count;
    }
}

/** "Dajesz ciemna fajke Gandalfowi": the longest leading part that is on the list */
function removeLeadingItem(phrase: string): boolean {
    const words = phrase.split(/\s+/);
    for (let length = words.length - 1; length > 0; length--) {
        const candidate = words.slice(0, length).join(" ");
        if (findItem(candidate)) return removeItem(candidate);
    }
    return false;
}

/** Puts the item on the list or raises its count; false when the count cannot be added up */
function addItem(text: string): boolean {
    // Left out of the list, so nothing to add and nothing amiss
    if (isIgnored(text)) return true;
    const [item] = parseItems(text);
    if (!item) return false;
    const added = toEntries(text);
    const entry = !added[0].noun && findItem(text);
    if (entry) {
        if (typeof entry.count !== "number" || typeof item.count !== "number") return false;
        // Keep a plural name once there is one; one singular plus another has no known plural
        const name = entry.count === 1 && item.count > 1 ? item.name : entry.name;
        setCount(entry, entry.count + item.count, name);
        return true;
    }
    // A bag is always an entry of its own, so it can be looked into
    let section = sections.find(s => s.label === CARRIED);
    if (!section) {
        section = { label: CARRIED, entries: [] };
        sections.push(section);
    }
    const taken = new Set(entries().map(e => e.key));
    added.forEach(e => uniqueKey(e, taken));
    section.entries.push(...added);
    return true;
}

/** "lampe do plecaka" -> "lampe" */
function withoutTarget(phrase: string): string {
    const at = phrase.lastIndexOf(" do ");
    return at > 0 ? phrase.slice(0, at) : phrase;
}

/** "lampe z plecaka" -> "lampe": cut at the last "z"/"ze", item names may have their own */
function withoutSource(phrase: string): string {
    const at = Math.max(phrase.lastIndexOf(" z "), phrase.lastIndexOf(" ze "));
    return at > 0 ? phrase.slice(0, at) : phrase;
}

function markContentsStale() {
    contents.forEach(listing => { listing.stale = true; });
}

function withoutState(name: string): string {
    return name.split(/\s+/).filter(w => !OPEN_WORDS.has(w) && !CLOSED_WORDS.has(w)).join(" ");
}

/**
 * "Otwierasz skorzany plecak": the carried bag's name now says it is open.
 * False for anything not carried, such as a door.
 */
function setOpenState(phrase: string, open: boolean): boolean {
    const target = withoutState(phrase.replace(/^swo\S*\s+/, ""));
    const entry = entries().find(e => e.count === 1 && sameItem(withoutState(e.name), target));
    if (!entry) return false;
    const words = entry.name.split(/\s+/);
    const at = words.findIndex(w => OPEN_WORDS.has(w) || CLOSED_WORDS.has(w));
    const feminine = entry.noun ? BAG_NOUNS[entry.noun].pronoun === "swojej" : false;
    // "zamkniety" / "zamknieta" / "zamkniete" keep their ending as "otwarty" / ...
    const ending = at >= 0 ? words[at].slice(-1) : feminine ? "a" : "y";
    const word = `${open ? "otwart" : "zamkniet"}${ending}`;
    if (at >= 0) words[at] = word;
    else words.unshift(word);
    entry.name = words.join(" ");
    entry.text = entry.name;
    return true;
}

/** Items put into a bag join what was last seen in it */
function addToContents(key: string, texts: string[]) {
    // Never looked into: at least what went in is known, the rest is not
    if (!contents.has(key)) contents.set(key, { items: [], at: Date.now(), stale: true });
    const listing = contents.get(key)!;
    texts.forEach(text => {
        const [item] = parseItems(text);
        if (!item) return;
        const same = listing.items.find(i => sameItem(i.name, item.name));
        if (!same) listing.items.push({ ...item });
        else if (typeof same.count === "number" && typeof item.count === "number") {
            same.count += item.count;
            if (item.count > 1) same.name = item.name;
        } else listing.stale = true;
    });
}

/** Items taken out of a bag leave what was last seen in it */
function removeFromContents(key: string, texts: string[]) {
    const listing = contents.get(key);
    if (!listing) return;
    texts.forEach(text => {
        const [item] = parseItems(text);
        const same = item && listing.items.find(i => sameItem(i.name, item.name));
        if (!same) {
            listing.stale = true;
            return;
        }
        if (typeof same.count === "number" && typeof item.count === "number" && same.count > item.count) {
            same.count -= item.count;
            if (same.count === 1 && item.count === 1) same.name = item.name;
        } else {
            listing.items = listing.items.filter(i => i !== same);
        }
    });
}

/** Words that only say how a bag is now, in any case: "otwartego", "zamknietej" */
const STATE_STEM = /^(?:otwar|zamkni|prawie|pust|peln|swo)/;

/**
 * The carried bag a reply names: "do otwartego skorzanego plecaka", "z prostej
 * torby". Its words, state words aside, each match a word of the bag's name in
 * another case, in order. Undefined when no bag or more than one answers.
 */
function bagNamed(phrase: string): Entry | undefined {
    const words = phrase.toLowerCase().split(/\s+/).filter(w => w && !STATE_STEM.test(w));
    if (!words.length) return undefined;
    const answering = entries().filter(entry => {
        if (!entry.noun) return false;
        const name = entry.name.toLowerCase().split(/\s+/).filter(w => !STATE_STEM.test(w));
        let at = 0;
        return words.every(word => {
            while (at < name.length && !sameWord(word, name[at])) at++;
            return at++ < name.length;
        });
    });
    return answering.length === 1 ? answering[0] : undefined;
}

/** "lampe do plecaka" -> "plecaka" */
function putTarget(phrase: string): string {
    const at = phrase.lastIndexOf(" do ");
    return at > 0 ? phrase.slice(at + 4) : "";
}

/** "lampe z plecaka" -> "plecaka" */
function takeSource(phrase: string): string {
    const at = Math.max(phrase.lastIndexOf(" z "), phrase.lastIndexOf(" ze "));
    return at > 0 ? phrase.slice(at).replace(/^ ze? /, "") : "";
}

/** The bag the window's next `wloz` / `wez` goes to or comes from */
let transferBag: string | null = null;

/**
 * Tells the tracker which bag the next command moves things into or out of,
 * so its contents follow instead of going stale.
 */
export function expectTransfer(bagKey: string) {
    transferBag = bagKey;
}

export default function initInventory(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    load(characterStorage.get(STORAGE_KEY));
    // Another character, or this one updated from another device
    const removeStorageListener = characterStorage.onChange(STORAGE_KEY, (value) => {
        if ((value ? JSON.stringify(value) : null) === lastStored) return;
        load(value);
        eventBus.emit("inventory.updated");
    });

    let block: string[] = [];

    // ── Checking bag numbers with `ocen`, when the player asks ──────────────
    // "ocen 2. plecak" answers "Oceniasz starannie zamkniety zolty podrozny plecak."
    // and a description; the first line says which bag the game counts as 2.
    let ocenNoun: string | null = null;
    let ocenQueue: number[] = [];
    let ocenFound: Record<string, number> = {};
    /** Inside an `ocen` reply: its lines are hidden until it ends */
    let inOcen = false;
    /** The reply's last line came wrapped: its rest is still to hide */
    let ocenTail = false;
    let ocenTimer: ReturnType<typeof setTimeout> | undefined;

    const finishVerify = () => {
        clearTimeout(ocenTimer);
        // Only a full answer counts: every bag of the kind given its number
        if (ocenNoun && bagsOf(ocenNoun).every(bag => ocenFound[bag.key] !== undefined)) {
            const numbers = bagsOf(ocenNoun).map(bag => ({ bag: bagIdentity(bag), ordinal: ocenFound[bag.key] }));
            ordinals = { ...ordinals, [ocenNoun]: { bags: signature(ocenNoun), numbers } };
            // Said in the game window too: the check may have come from /pojemnik
            const numbered = bagsOf(ocenNoun)
                .sort((a, b) => ocenFound[a.key] - ocenFound[b.key])
                .map(bag => `${ocenFound[bag.key]}. ${describe(bag.name).label}${bag.worn ? " (zalozony)" : ""}`);
            client.print(`Numeracja (${ocenNoun}): ${numbered.join(", ")}`);
        } else if (ocenNoun) {
            client.print(`Nie udalo sie ustalic numeracji (${ocenNoun}).`);
        }
        verifying = false;
        ocenNoun = null;
        ocenQueue = [];
        inOcen = false;
        ocenTail = false;
        emitUpdate();
    };

    /** The bag "Oceniasz starannie <description>" is about gets the number that was asked for */
    const placeOcen = (description: string, number: number) => {
        if (!ocenNoun) return;
        const wanted = stemKey(description);
        const bag = bagsOf(ocenNoun).find(e => ocenFound[e.key] === undefined && stemKey(e.name) === wanted);
        if (bag) ocenFound[bag.key] = number;
    };

    /** Hides an `ocen` reply; true for a line that belongs to one */
    const ocenLine = (text: string): boolean => {
        if (!verifying) return false;
        const evaluated = text.match(/^Oceniasz starannie (.+)\.$/);
        if (evaluated) {
            const number = ocenQueue.shift();
            if (number !== undefined) placeOcen(evaluated[1], number);
            inOcen = true;
            return true;
        }
        if (ocenTail) {
            ocenTail = false;
            inOcen = false;
            if (!ocenQueue.length) finishVerify();
            return true;
        }
        if (!inOcen) return false;
        // "Ten element ekwipunku wyglada na calkiem nowy. [5/5]" closes it, maybe wrapped
        if (/^Ten element ekwipunku/.test(text)) {
            if (/[\].]$/.test(text)) {
                inOcen = false;
                if (!ocenQueue.length) finishVerify();
            } else {
                ocenTail = true;
            }
        }
        return true;
    };
    let blockAt = 0;
    let hiddenUntil = 0;
    // The player typed `i`: its reply may start with a line no pattern knows
    let typedUntil = 0;
    let replyTimer: ReturnType<typeof setTimeout> | undefined;
    const pendingActions: { kind: ActionKind; reply: RegExp; fail?: RegExp; until: number; fromSource: boolean; bag?: string }[] = [];

    const commit = () => {
        const lines = block;
        sections = parseInventory(block);
        block = [];
        updatedAt = Date.now();
        stale = false;
        refreshing = false;
        hiddenUntil = 0;
        typedUntil = 0;
        clearTimeout(replyTimer);
        emitUpdate();
        // A full reply, not a change followed from the game's messages, with the
        // lines of it nothing knows yet, so they can be told and learned
        const custom = iLines();
        const unknown = lines.filter(line =>
            !SECTIONS.some(({ pattern }) => pattern.test(line)) && !custom.some(({ matches }) => matches(line)));
        eventBus.emit("inventory.read", { lines, unknown });
    };

    const sendHidden = () => {
        if (hiddenUntil > Date.now()) return;
        hiddenUntil = Date.now() + REPLY_TIMEOUT_MS;
        refreshing = true;
        emitUpdate();
        client.sendCommand("i", false);
        clearTimeout(replyTimer);
        replyTimer = setTimeout(() => {
            hiddenUntil = 0;
            refreshing = false;
            if (block.length) commit();
            else emitUpdate();
        }, REPLY_TIMEOUT_MS);
    };

    /** Never asks the game by itself: the window offers a refresh */
    const markStale = () => {
        stale = true;
        emitUpdate();
    };

    const applyAction = (kind: ActionKind, phrase: string | undefined, fromSource = false, bag?: string) => {
        const moving = kind === "put" || (kind === "take" && fromSource);
        if (moving && phrase) {
            // The bag the window moved things with, or the one the reply names
            // ("Wkladasz kompasy do otwartego skorzanego plecaka"), for /wdp or a typed wloz
            bag ??= bagNamed(kind === "put" ? putTarget(phrase) : takeSource(phrase))?.key;
            // The game says it is done: whatever waited for it can stop waiting
            eventBus.emit("inventory.moved", { kind });
        }
        // Not knowing which bag, any of them may have changed
        if (moving && !bag) markContentsStale();
        if (updatedAt === null) return;
        // Opening a door is no change to the inventory
        if (kind === "open" || kind === "close") {
            if (phrase && setOpenState(phrase, kind === "open")) emitUpdate();
            return;
        }
        let applied = false;
        if (phrase) {
            // Every item is applied even after a miss: what matched is still right
            const all = (texts: string[], apply: (text: string) => boolean) =>
                texts.map(apply).every(Boolean);
            if (kind === "drop") applied = all(splitItemList(phrase), removeItem);
            else if (kind === "give") applied = removeLeadingItem(phrase);
            else if (kind === "put") {
                const texts = splitItemList(withoutTarget(phrase));
                applied = all(texts, removeItem);
                if (bag) addToContents(bag, texts);
            } else if (kind === "take") {
                const texts = splitItemList(fromSource ? withoutSource(phrase) : phrase);
                applied = all(texts, addItem);
                if (bag) removeFromContents(bag, texts);
            }
        }
        if (applied) emitUpdate();
        else markStale();
    };

    const removeCommandListener = client.on("command", (command = "") => {
        const normalized = command.trim().toLowerCase() + " ";
        if (normalized === "i ") typedUntil = Date.now() + REPLY_TIMEOUT_MS;
        const action = ACTIONS.find(a => a.command.test(normalized));
        // The window's transfer is the next `wloz` / `wez`: the bag manager opens the bag first
        const transfers = action?.kind === "put" || action?.kind === "take";
        const bag = transfers ? transferBag ?? undefined : undefined;
        if (transfers) transferBag = null;
        if (action) {
            pendingActions.push({
                kind: action.kind,
                reply: action.reply,
                fail: action.fail,
                until: Date.now() + ACTION_WINDOW_MS,
                // "wez lampe z plecaka": the reply names where it came from too
                fromSource: / ze? /.test(normalized.trim()),
                ...((action.kind === "put" || action.kind === "take") && bag && { bag }),
            });
        }
    });

    // Setting a bag in /pojemnik moves it to the window's bag column
    const removeAssignmentListener = characterStorage.onChange("containers", () => {
        // bagManager applies the change in its own listener; read after it
        setTimeout(() => eventBus.emit("inventory.updated"));
    });
    // The herb manager counted or moved herbs: the woreczki show what it knows
    const removeHerbListener = characterStorage.onChange("herb_counts", () => eventBus.emit("inventory.updated"));
    // The bag manager names carried bags by the numbers checked here
    setCarriedBagOrdinals(carriedBagOrdinal);

    // Drawing and lowering weapons moves them between sections; weaponState
    // knows every way the game words it, knock-offs included. Stale only when
    // the list disagrees: a report that merely settles an unknown state, with
    // the weapon already listed in hand, moved nothing.
    const removeWeaponListener = client.on("weapon_state", (drawn) => {
        if (updatedAt === null) return;
        const inHands = sections.some(section => section.label === IN_HANDS && section.entries.length > 0);
        if (inHands !== drawn) markStale();
    });

    client.Triggers.registerTrigger(
        (_line, _matches, type) => (type === "living.long" ? undefined : ([] as unknown as RegExpMatchArray)),
        (line) => {
            const text = line.text.replace(/^[> ]+/, "").trim();
            const hidden = hiddenUntil > Date.now();
            // A reply is on its way, so even its first line may be one no pattern knows
            const expected = hidden || typedUntil > Date.now();
            if (ocenLine(text)) return null;

            const now = Date.now();
            const fresh = block.length > 0 && now - blockAt <= BLOCK_GAP_MS;
            // A long line can come wrapped: "... kazdy promien" / "padajacego na nie swiatla ...".
            // What follows a line not yet ended with a full stop belongs to it.
            if (fresh && !block[block.length - 1].endsWith(".")) {
                block[block.length - 1] += ` ${text}`;
                blockAt = now;
                if (LAST_LINE.test(block[block.length - 1]) && text.endsWith(".")) commit();
                return hidden ? null : line;
            }
            // The start of a wrapped line no pattern knows yet in its half:
            // "Nasuniety na ... palec twej prawej dloni ... sygnet ... odznacza cie"
            if ((fresh || expected) && !text.endsWith(".")) {
                if (!fresh) block = [];
                block.push(text);
                blockAt = now;
                return hidden ? null : line;
            }
            // A line of the reply only the złom list knows, by the `i` line given to a piece,
            // tried only while a reply is being read
            const custom = (fresh || expected) && iLines().some(({ matches }) => matches(text));
            if (custom || SECTIONS.some(({ pattern }) => pattern.test(text))) {
                // A line the patterns do not know yet must not lose the rest of
                // the reply, so a block ends only when it gets old
                if (!fresh) block = [];
                block.push(text);
                blockAt = now;
                // "Masz przy sobie ... trzy" goes on in the next line
                if (LAST_LINE.test(text) && (text.endsWith(".") || /^Nie masz/.test(text))) commit();
                return hidden ? null : line;
            }

            while (pendingActions.length && pendingActions[0].until < now) pendingActions.shift();
            // Refused: nothing moved, and the window hears why
            const refused = pendingActions.find(a => a.fail?.test(text));
            if (refused) {
                pendingActions.splice(pendingActions.indexOf(refused), 1);
                eventBus.emit("inventory.failed", { text });
                return line;
            }
            const action = pendingActions.find(a => a.reply.test(text));
            if (action) {
                // One reply per command: a second `wez` must meet its own reply
                pendingActions.splice(pendingActions.indexOf(action), 1);
                applyAction(action.kind, text.match(action.reply)?.[1], action.fromSource, action.bag);
            } else {
                const given = text.match(GIVEN)?.[1];
                if (given && given !== "nowy zapal do walki" && !given.startsWith("sie ")) {
                    applyAction("take", given);
                } else if (text && (fresh || expected)) {
                    // A whole line of the reply no pattern knows: kept with it, so the
                    // windows can say what is still to be learned. Shown even when the
                    // reply is hidden, as it may be something else that came in meanwhile.
                    if (!fresh) block = [];
                    block.push(text);
                    blockAt = now;
                }
            }
            return line;
        },
        "inventory"
    );

    const removeListingObserver = onContainerListing((listing: ParsedContainer) => {
        const now = Date.now();
        if (inspecting && inspecting.until > now) {
            contents.set(inspecting.key, { items: listing.items, at: now, stale: false });
            inspecting = null;
            emitUpdate();
            return true;
        }
        // Looked into by hand: match the bag by its name
        const listed = stemKey(listing.container);
        const entry = listed && entries().find(e => e.noun && ` ${e.key} `.includes(` ${listed} `));
        if (entry) {
            contents.set(entry.key, { items: listing.items, at: now, stale: false });
            emitUpdate();
        }
        return false;
    });

    const unsubscribers = [
        // The stored state is shown as is; only a character never checked asks the game
        eventBus.on("inventory.popup.open", () => {
            if (updatedAt === null) sendHidden();
        }),
        eventBus.on("inventory.refresh", sendHidden),
        // Only on the player's word: one hidden `ocen` per bag of the kind
        eventBus.on("inventory.verify", ({ noun }) => {
            const bags = bagsOf(noun);
            if (verifying || bags.length < 2) return;
            verifying = true;
            ocenNoun = noun;
            ocenFound = {};
            ocenQueue = bags.map((_, i) => i + 1);
            emitUpdate();
            ocenQueue.forEach(number => client.sendCommand(`ocen ${number}. ${noun}`, false));
            ocenTimer = setTimeout(finishVerify, REPLY_TIMEOUT_MS + bags.length * 500);
        }),
        eventBus.on("inventory.inspect", ({ key }) => {
            const entry = entries().find(e => e.key === key);
            const target = entry && inspectTarget(entry);
            if (!target) return;
            inspecting = { key, until: Date.now() + REPLY_TIMEOUT_MS };
            emitUpdate();
            client.sendCommand(`zajrzyj do ${target}`, false);
            setTimeout(() => {
                if (inspecting?.key !== key) return;
                inspecting = null;
                emitUpdate();
            }, REPLY_TIMEOUT_MS);
        }),
    ];

    if (aliases) {
        aliases.push({ pattern: /^\/ekwipunek$/, callback: () => eventBus.emit("inventory.popup.open") });
    }

    return () => {
        unsubscribers.forEach(unsubscribe => unsubscribe());
        removeCommandListener();
        removeWeaponListener();
        removeListingObserver();
        removeStorageListener();
        removeAssignmentListener();
        removeHerbListener();
        setCarriedBagOrdinals(null);
        clearTimeout(ocenTimer);
        client.Triggers.removeByTag("inventory");
        clearTimeout(replyTimer);
        sections = [];
        updatedAt = null;
        stale = false;
        refreshing = false;
        inspecting = null;
        contents.clear();
        lastStored = null;
        transferBag = null;
        ordinals = {};
        verifying = false;
    };
}
