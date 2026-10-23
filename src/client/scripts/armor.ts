import Client from "../Client";
import eventBus from "@modules/core/eventBus";
import { characterStorage } from "@modules/core/storage";
import {
    getZlomSnapshot,
    iLineEntries,
    iLineMatcher,
    sameItem,
    sameWord,
    updateZlomSnapshot,
    type ArmorEntry,
    type ILineEntry,
    type ILineKind,
    type ShieldEntry,
    type WearableEntry,
    type WearableKind,
    type ZlomSnapshot,
} from "@modules/data/zlomStore";
import { setZlomILine } from "./zlom";
import { getZlomView } from "@modules/crowd/crowdView";
import { getCrowdSnapshot, subscribeCrowdSnapshot } from "@modules/crowd/crowdSnapshot";
import type { OdmianaSnapshot } from "@modules/data/odmianaStore";
import { getInventoryState } from "./inventory";
import { splitName } from "./inventoryActions";

/**
 * What the character wears as armour, slot by slot, for the armour window.
 *
 * Learned from the game's own words as things are put on and taken off:
 *   "Zakladasz stalowa dluga kolczuge na tulow, nogi i ramiona."
 *   "Zdejmujesz z siebie stalowa dluga kolczuge."
 * One piece can cover several slots. Until something is put on, nothing is
 * known: the `i` reply lists worn things without saying where.
 */

const STORAGE_KEY = "worn_armor";

/** Slot words as "na ..." names them (accusative) -> the slots they cover */
const SLOT_WORDS: Record<string, string[]> = {
    glowe: ["glowa"],
    // "tulow" in what you put on; "korpus" in what the game says it covers
    tulow: ["korpus"],
    korpus: ["korpus"],
    nogi: ["nogi"],
    // Both arms, each a slot of its own: a piece can cover just one
    ramiona: ["lewe ramie", "prawe ramie"],
    "lewe ramie": ["lewe ramie"],
    "prawe ramie": ["prawe ramie"],
    // A shield goes on an arm: "Zakladasz drewniana okuta tarcze na lewa reke."
    "lewa reke": ["tarcza"],
    "prawa reke": ["tarcza"],
    szyje: ["szyja"],
    dlonie: ["dlonie"],
    stopy: ["stopy"],
};

/** The slots the window shows for now */
export const ARMOR_SLOTS = ["glowa", "korpus", "lewe ramie", "prawe ramie", "dlonie", "nogi", "stopy", "tarcza"] as const;

/** Worn, but on no slot: clothes, add-ons, and what is plainly no armour */
export interface WornExtra {
    /** The złom name; as the `i` reply lists it when the złom list does not know it */
    name: string;
    /** As the `i` reply lists it, in whatever case: "mosieznej obrozy z runa Khorna" */
    worn?: string;
    /** What the złom list knows it as; null when it does not know it yet */
    kind: WearableKind | null;
    material?: string;
}

export interface WornArmor {
    /** Slot -> what is on it, as the game names it ("stalowa dluga kolczuge") */
    slots: Record<string, string>;
    /** Clothes and add-ons, shown apart from the slots */
    extras: WornExtra[];
    /** Worn in the last `i` reply, but on no slot: nothing yet says what it covers */
    unplaced: string[];
    /** Lines of the last `i` reply nothing knows: a way of wording it still to be learned */
    unknownLines: string[];
    /**
     * Pieces and lines the player said need no filling in: a guild or club
     * item, or anything else to leave alone. Kept across replies.
     */
    ignored: string[];
    /** Ignored only by other players (the crowd list), but wanted back on the list by this character */
    restored: string[];
    updatedAt: number | null;
}

const WEAR = /^Zakladasz (.+) na (.+)\.$/;
const TAKE_OFF = /^Zdejmujesz z siebie (.+)\.$/;

const NOTHING: WornArmor = { slots: {}, extras: [], unplaced: [], unknownLines: [], ignored: [], restored: [], updatedAt: null };

let armor: WornArmor = NOTHING;

export function getWornArmor(): WornArmor {
    return {
        ...armor,
        slots: { ...armor.slots },
        extras: [...armor.extras],
        unplaced: [...armor.unplaced],
        unknownLines: [...armor.unknownLines],
        ignored: [...armor.ignored],
        restored: [...armor.restored],
    };
}

/**
 * "tulow, nogi i ramiona" -> ["korpus", "nogi", "lewe ramie", "prawe ramie"];
 * "lewa reke" -> ["tarcza"]. Empty when a word is not a slot: "Zakladasz rece
 * na piersi" is no armour.
 */
export function parseSlots(text: string): string[] {
    const words = text.replace(/ i /g, ", ").split(/,\s*/).map(w => w.trim()).filter(Boolean);
    const slots = words.map(word => SLOT_WORDS[word]);
    return slots.every(Boolean) ? slots.flat() : [];
}

/**
 * What was put on, and where: "stalowa dluga kolczuge" on tulow, nogi and
 * ramiona. The slots follow the last " na ", as an item may have one of its own.
 */
export function parseWear(text: string): { item: string; slots: string[]; where: string } | null {
    const match = text.match(WEAR);
    if (!match) return null;
    const full = `${match[1]} na ${match[2]}`;
    const at = full.lastIndexOf(" na ");
    const where = full.slice(at + 4);
    const slots = parseSlots(where);
    return slots.length ? { item: full.slice(0, at), slots, where } : null;
}

export { sameItem };

/**
 * What a piece covers, in the złom list's words: "tulow, nogi i ramiona" from
 * putting it on is "korpus, nogi i ramiona" there.
 */
export function zlomCoverage(where: string): string {
    return where.replace(/\btulow\b/g, "korpus");
}

/**
 * Putting a piece on says what it covers: a złom entry of that name with no
 * cover yet ("Oslona" left empty) gets it. Entries that have one keep it.
 */
function fillZlomCoverage(item: string, where: string) {
    const oslona = zlomCoverage(where);
    const fill = <T extends ArmorEntry | ShieldEntry>(list: T[]): T[] => list.map(entry =>
        !entry.oslona && (sameItem(entry.short, item) || (entry.shortAlt && sameItem(entry.shortAlt, item)))
            ? { ...entry, oslona }
            : entry);
    updateZlomSnapshot(snapshot => {
        const zbroje = fill(snapshot.zbroje);
        const tarcze = fill(snapshot.tarcze);
        const changed = zbroje.some((e, i) => e !== snapshot.zbroje[i]) || tarcze.some((e, i) => e !== snapshot.tarcze[i]);
        return changed ? { ...snapshot, zbroje, tarcze } : snapshot;
    }).catch(() => {});
}

function store(next: WornArmor) {
    armor = next;
    characterStorage.set(STORAGE_KEY, armor);
    eventBus.emit("armor.updated");
}

/** Parts of the `i` reply that are worn as armour; the back and the belt only carry */
const WORN_SECTIONS = new Set(["Na sobie", "Na głowie", "Na rękach", "Na szyi", "Noszone"]);

/**
 * Slots from what an `i` reply lists as worn. Only a piece the złom list
 * knows by the name `i` gives it, with what it covers ("Oslona"), takes
 * slots. Anything else loses its slot, even one learned from putting it on:
 * `i` may name it differently ("garnczkowy helm zdobiony majestatycznym
 * jelenim porozem" for "garnczkowy helm z jelenim porozem"), and that is
 * for the złom list to learn, not to be guessed.
 */
export function slotsFromWorn(
    worn: string[],
    known: { short: string; shortAlt?: string; oslona: string; shield?: boolean }[],
): Record<string, string> {
    const slots: Record<string, string> = {};
    worn.forEach(name => {
        const entry = known.find(e => (e.oslona || e.shield) && (sameItem(e.short, name) || (e.shortAlt && sameItem(e.shortAlt, name))));
        if (!entry) return;
        // A shield is held on an arm, whatever its cover says ("jedno z ramion")
        const covered = entry.shield ? ["tarcza"] : parseSlots(entry.oslona);
        covered.forEach(slot => { slots[slot] = name; });
    });
    return slots;
}

/**
 * Worn, but never armour: clothes over it, jewellery, insignia, a map case.
 * No slot to fill. Any case or number of the noun counts ("pierscienie").
 */
const NOT_ARMOUR = [
    "plaszcz", "szata", "calun", "chusta", "maska",
    "pierscien", "sygnet", "bransoleta", "opaska", "amulet", "talizman", "broszka", "spinka",
    "mapnik",
];

/** "zwiewny upiorny calun", "masywny amulet z czarnym opalem (rozkazy)" */
export function isNotArmour(name: string): boolean {
    const noun = splitName(name).noun.toLowerCase();
    return NOT_ARMOUR.some(word => sameWord(noun, word));
}

/**
 * The worn pieces no slot holds: armour the złom list has no cover for yet,
 * or knows by another name. Listed so it is known what is still to be filled
 * in; a cloak or a ring is not.
 */
export function unplacedPieces(worn: string[], slots: Record<string, string>): string[] {
    const held = Object.values(slots);
    return worn.filter(name => !isNotArmour(name) && !held.some(item => sameItem(item, name)));
}

/**
 * Slots of the pieces an `i` reply words in its own way, which the złom list
 * knows by the line given to them ("Od stop do glow zakuty jestes w stalowe
 * plyty ..."). Each takes what it covers, under its name as the game lists it.
 */
export function slotsFromLines(lines: string[], known: ILineEntry[]): Record<string, string> {
    const slots: Record<string, string> = {};
    known.forEach(({ kind, entry, matches }) => {
        if (!lines.some(matches)) return;
        coveredBy(kind, entry).forEach(slot => { slots[slot] = entry.shortAlt || entry.short; });
    });
    return slots;
}

const isWearable = (kind: ILineKind): kind is WearableKind => kind === "ubrania" || kind === "dodatki";

/**
 * The clothes and add-ons an `i` reply shows: listed by a name the złom list
 * knows (or knows as its `i` line), or worded in a line of their own
 * ("Wokol szyi masz zacisnieta mosieznej obrozy ..."). A worn piece the list
 * does not know, but that is plainly no armour (a cloak, a ring), is shown too,
 * without a kind.
 */
export function wornExtras(
    worn: string[],
    lines: string[],
    snapshot: Pick<ZlomSnapshot, WearableKind>,
    byLine: ILineEntry[],
): WornExtra[] {
    const extras: WornExtra[] = [];
    const known = (["ubrania", "dodatki"] as const).flatMap(kind => snapshot[kind].map(entry => ({ kind, entry })));
    worn.forEach(name => {
        const match = known.find(({ entry }) =>
            sameItem(entry.short, name) || (entry.shortAlt && sameItem(entry.shortAlt, name)) || iLineMatcher(entry.iLine)?.(name));
        if (match) {
            if (extras.some(extra => extra.name === match.entry.short)) return;
            extras.push({ ...extraOf(match.kind, match.entry), worn: name });
        } else if (isNotArmour(name)) {
            extras.push({ name, worn: name, kind: null });
        }
    });
    byLine.forEach(({ kind, entry, matches }) => {
        if (!isWearable(kind) || !lines.some(matches)) return;
        if (extras.some(extra => extra.name === entry.short)) return;
        extras.push(extraOf(kind, entry as WearableEntry));
    });
    return extras;
}

export interface ILineCandidate {
    kind: ILineKind;
    entry: ArmorEntry | ShieldEntry | WearableEntry;
    /** Words of the line the entry's name or description shares, in any case */
    score: number;
}

function words(text: string): string[] {
    return text.toLowerCase().split(/[^a-z]+/).filter(word => word.length >= 3);
}

/**
 * The złom armour and shields an `i` line may be describing, likeliest first:
 * by how many of the line's words appear, in any case, in the entry's name or
 * description. "Twoje cialo spowija lsniaca mithrilowa luska" puts the
 * "lsniaca mithrilowa luska" first.
 */
export function rankILineCandidates(line: string, snapshot: ZlomSnapshot): ILineCandidate[] {
    const lineWords = words(line);
    const score = (entry: ArmorEntry | ShieldEntry | WearableEntry) => {
        const own = words(`${entry.short} ${entry.shortAlt ?? ""} ${entry.opis}`);
        return lineWords.filter(word => own.some(other => sameWord(word, other))).length;
    };
    const all: ILineCandidate[] = [
        ...snapshot.zbroje.map(entry => ({ kind: "zbroje" as const, entry, score: score(entry) })),
        ...snapshot.tarcze.map(entry => ({ kind: "tarcze" as const, entry, score: score(entry) })),
        ...snapshot.ubrania.map(entry => ({ kind: "ubrania" as const, entry, score: score(entry) })),
        ...snapshot.dodatki.map(entry => ({ kind: "dodatki" as const, entry, score: score(entry) })),
    ];
    return all.sort((a, b) => b.score - a.score || a.entry.short.localeCompare(b.entry.short));
}

export interface ILinePreview {
    /** False when the fragment is empty or a /regexp/ that does not compile */
    valid: boolean;
    /** Lines of the last reply it would match */
    matched: string[];
    /** Other entries whose own `i` line already matches one of those lines */
    clashes: string[];
    /** The slots the entry would take: none when its cover is not known yet */
    slots: string[];
}

/** What giving `entry` this fragment as its `i` line would do to the last reply */
export function previewILine(
    fragment: string,
    lines: string[],
    snapshot: ZlomSnapshot,
    kind: ILineKind,
    entry: ArmorEntry | ShieldEntry | WearableEntry,
): ILinePreview {
    const matches = iLineMatcher(fragment);
    const slots = coveredBy(kind, entry);
    if (!matches) return { valid: false, matched: [], clashes: [], slots };
    const matched = lines.filter(matches);
    const clashes = iLineEntries(snapshot)
        .filter(other => other.entry.opis !== entry.opis && matched.some(other.matches))
        .map(other => other.entry.shortAlt || other.entry.short);
    return { valid: true, matched, clashes, slots };
}

function findPiece(kind: ILineKind, opis: string): ArmorEntry | ShieldEntry | WearableEntry | undefined {
    return (getZlomSnapshot()[kind] as (ArmorEntry | ShieldEntry | WearableEntry)[]).find(e => e.opis === opis);
}

/**
 * The slots a złom piece takes. Only ever from what the game said about it
 * (`ocen`, or putting it on): a shield is held on an arm, armour covers what
 * its "Oslona" says. Empty when that is not known yet, and always for clothes
 * and add-ons, which take none.
 */
export function coveredBy(kind: ILineKind, entry: ArmorEntry | ShieldEntry | WearableEntry): string[] {
    if (isWearable(kind)) return [];
    return kind === "tarcze" ? ["tarcza"] : parseSlots((entry as ArmorEntry).oslona);
}

/** Shown apart from the slots, under the name the złom list gives it */
function extraOf(kind: WearableKind, entry: WearableEntry, worn?: string): WornExtra {
    return { name: entry.short, ...(worn ? { worn } : {}), kind, material: entry.material || undefined };
}

/**
 * Give a złom armour or shield the fragment of an `i` line that is how the
 * game describes it, and place it from the last reply straight away: the lines
 * it matches stop being unknown and it takes its slots, without waiting for the
 * next `i`.
 */
export async function assignILine(kind: ILineKind, opis: string, fragment: string): Promise<void> {
    await setZlomILine(kind, opis, fragment);
    const entry = findPiece(kind, opis);
    const matches = iLineMatcher(fragment);
    if (!entry || !matches || !armor.unknownLines.some(matches)) return;
    if (isWearable(kind)) {
        const extra = extraOf(kind, entry as WearableEntry);
        store({
            ...armor,
            extras: [...armor.extras.filter(e => e.name !== extra.name), extra],
            unknownLines: armor.unknownLines.filter(line => !matches(line)),
            updatedAt: Date.now(),
        });
        return;
    }
    const slots = { ...armor.slots };
    coveredBy(kind, entry).forEach(slot => { slots[slot] = entry.shortAlt || entry.short; });
    store({
        ...armor,
        slots,
        unknownLines: armor.unknownLines.filter(line => !matches(line)),
        updatedAt: Date.now(),
    });
}

/**
 * Tie a piece the `i` reply lists by name, but on no slot, to its złom entry.
 * When `i` names it differently from the entry ("garnczkowy helm zdobiony
 * majestatycznym jelenim porozem" for "garnczkowy helm z jelenim porozem"),
 * that name becomes the entry's `i` line, so the next reply knows it too.
 * The piece takes its slots straight away.
 */
export async function assignPiece(name: string, kind: ILineKind, opis: string): Promise<void> {
    const entry = findPiece(kind, opis);
    if (!entry) return;
    if (!sameItem(entry.short, name) && !(entry.shortAlt && sameItem(entry.shortAlt, name))) {
        await setZlomILine(kind, opis, name);
    }
    if (isWearable(kind)) {
        store({
            ...armor,
            extras: [...armor.extras.filter(e => e.name !== entry.short && e.worn !== name), extraOf(kind, entry as WearableEntry, name)],
            unplaced: armor.unplaced.filter(piece => piece !== name),
            updatedAt: Date.now(),
        });
        return;
    }
    const covered = coveredBy(kind, entry);
    if (!covered.length) return;
    const slots = { ...armor.slots };
    covered.forEach(slot => { slots[slot] = name; });
    store({
        ...armor,
        slots,
        unplaced: armor.unplaced.filter(piece => piece !== name),
        updatedAt: Date.now(),
    });
}

/** An ignored piece, in any case `i` or putting it on names it; an ignored line as it is */
function isIgnored(ignored: string[], text: string): boolean {
    return ignored.some(item => item === text || sameItem(item, text));
}

export interface IgnoredTodo {
    text: string;
    /** Ignored by this character; otherwise only by other players, in the crowd list */
    own: boolean;
    /** How many players of the crowd list ignore it */
    confirmations?: number;
}

/**
 * What "Do uzupelnienia" leaves out: this character's own ignores, and those of
 * other players in the crowd list (a guild item is ignored by everyone who wears
 * it), less the ones this character brought back.
 */
export function ignoredTodos(): IgnoredTodo[] {
    const result: IgnoredTodo[] = armor.ignored.map(text => ({ text, own: true }));
    for (const { text, confirmations } of getCrowdSnapshot()?.ignorowane ?? []) {
        const mine = result.find(item => item.text.toLowerCase() === text.toLowerCase());
        if (mine) mine.confirmations = confirmations;
        else if (!armor.restored.some(item => item.toLowerCase() === text.toLowerCase())) {
            result.push({ text, own: false, confirmations });
        }
    }
    return result;
}

/** Every text "Do uzupelnienia" leaves out, own and the crowd's */
function ignoredTexts(): string[] {
    return ignoredTodos().map(item => item.text);
}

/**
 * Leave a piece or line of "Do uzupelnienia" alone for good: a guild or club
 * item, or anything else nothing needs to know about. It stays out of the list
 * in every later reply too, and goes to the crowd list for players who share.
 */
export function ignoreTodo(text: string): void {
    if (armor.ignored.includes(text)) return;
    store({
        ...armor,
        ignored: [...armor.ignored, text],
        restored: armor.restored.filter(item => item.toLowerCase() !== text.toLowerCase()),
        unplaced: armor.unplaced.filter(piece => !sameItem(piece, text)),
        unknownLines: armor.unknownLines.filter(line => line !== text),
        updatedAt: Date.now(),
    });
}

/**
 * Back on the list from the next `i`. One only other players ignore is brought
 * back for this character alone.
 */
export function unignoreTodo(text: string): void {
    // Ignored by others too: without this it would stay hidden by theirs
    const crowd = (getCrowdSnapshot()?.ignorowane ?? []).some(item => item.text.toLowerCase() === text.toLowerCase());
    store({
        ...armor,
        ignored: armor.ignored.filter(item => item !== text),
        restored: crowd && !armor.restored.includes(text) ? [...armor.restored, text] : armor.restored,
        updatedAt: Date.now(),
    });
}

/**
 * The złom names of worn pieces whose declension nobody has seen yet, ready to
 * be sent as `odmien <name>`: a slot holds the piece as `i` or putting it on
 * names it, its złom entry has the nominative the command wants.
 */
export function undeclinedPieces(slots: Record<string, string>, snapshot: ZlomSnapshot, odmiany: OdmianaSnapshot): string[] {
    const entries = [...snapshot.zbroje, ...snapshot.tarcze];
    const names = new Set<string>();
    new Set(Object.values(slots)).forEach(worn => {
        const entry = entries.find(e =>
            sameItem(e.short, worn) || (e.shortAlt && sameItem(e.shortAlt, worn)) || iLineMatcher(e.iLine)?.(worn));
        const name = entry?.short.trim().toLowerCase();
        if (name && !odmiany[name]) names.add(name);
    });
    return [...names];
}

export default function initArmor(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    const load = (value: WornArmor | undefined) => {
        // Stored before what is still to learn was kept: none of it known yet
        armor = value && typeof value === "object" && value.slots ? { ...NOTHING, ...value } : NOTHING;
        // Stored before the slots were "korpus" and one per arm
        const { tulow, ramiona, ...rest } = armor.slots;
        if (tulow || ramiona) {
            armor = {
                ...armor,
                slots: {
                    ...rest,
                    ...(tulow && { korpus: tulow }),
                    ...(ramiona && { "lewe ramie": ramiona, "prawe ramie": ramiona }),
                },
            };
        }
        eventBus.emit("armor.updated");
    };
    load(characterStorage.get(STORAGE_KEY));
    // Another character, or this one updated from another device
    const removeStorageListener = characterStorage.onChange(STORAGE_KEY, (value) => {
        if (value !== armor) load(value);
    });

    client.Triggers.registerTrigger(WEAR, (line) => {
        const worn = parseWear(line.text.trim());
        if (worn) {
            fillZlomCoverage(worn.item, worn.where);
            const slots = { ...armor.slots };
            worn.slots.forEach(slot => { slots[slot] = worn.item; });
            // Put on, so now it has its slots
            const unplaced = armor.unplaced.filter(name => !sameItem(name, worn.item));
            store({ ...armor, slots, unplaced, updatedAt: Date.now() });
        }
        return line;
    }, "armor");

    client.Triggers.registerTrigger(TAKE_OFF, (line, matches) => {
        const item = matches[1];
        const unplaced = armor.unplaced.filter(name => !sameItem(name, item));
        if (Object.values(armor.slots).includes(item) || unplaced.length !== armor.unplaced.length) {
            const slots = Object.fromEntries(Object.entries(armor.slots).filter(([, on]) => on !== item));
            store({ ...armor, slots, unplaced, updatedAt: Date.now() });
        }
        return line;
    }, "armor");

    // A full `i` reply: what is worn now, with the złom list saying what each piece covers,
    // and which of its lines are pieces it words in its own way. What it could not place
    // is kept too, as the list of what is still to be filled in.
    const removeReadListener = eventBus.on("inventory.read", ({ lines, unknown }) => {
        const worn = getInventoryState().sections
            .filter(section => WORN_SECTIONS.has(section.label))
            .flatMap(section => section.entries.map(entry => entry.name));
        // Other players' covers and i lines place pieces too; the list itself stays the player's
        const view = getZlomView();
        const { zbroje, tarcze } = view;
        const byLine = iLineEntries(view);
        const slots = {
            ...slotsFromWorn(worn, [...zbroje, ...tarcze.map(entry => ({ ...entry, shield: true }))]),
            ...slotsFromLines(lines, byLine),
        };
        const extras = wornExtras(worn, lines, view, byLine);
        // A piece listed by a name its złom entry knows as its i line is placed, under the entry's
        // name - when that entry has slots to take
        const placedByLine = byLine.filter(({ kind, entry, matches }) =>
            coveredBy(kind, entry).length > 0 && lines.some(matches));
        const ignored = ignoredTexts();
        const unplaced = unplacedPieces(worn, slots)
            .filter(name => !placedByLine.some(({ matches }) => matches(name)) && !extras.some(extra => extra.worn === name))
            .filter(name => !isIgnored(ignored, name));
        const unknownLines = unknown.filter(line => !ignored.some(text => text.toLowerCase() === line.toLowerCase()));
        const next = { slots, extras, unplaced, unknownLines };
        if (JSON.stringify(next) === JSON.stringify({ slots: armor.slots, extras: armor.extras, unplaced: armor.unplaced, unknownLines: armor.unknownLines })) return;
        store({ ...next, ignored: armor.ignored, restored: armor.restored, updatedAt: Date.now() });
    });

    if (aliases) {
        aliases.push({ pattern: /^\/zbroja$/, callback: () => eventBus.emit("armor.popup.open") });
    }

    // Other players' ignores arrive with the crowd list: the window lists them
    const removeCrowdListener = subscribeCrowdSnapshot(() => eventBus.emit("armor.updated"));

    return () => {
        removeStorageListener();
        removeReadListener();
        removeCrowdListener();
        client.Triggers.removeByTag("armor");
        armor = NOTHING;
    };
}
