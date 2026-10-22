import Client from "../Client";
import eventBus from "@modules/core/eventBus";
import { characterStorage } from "@modules/core/storage";
import { getZlomSnapshot, iLineEntries, updateZlomSnapshot, type ArmorEntry, type ShieldEntry } from "@modules/data/zlomStore";
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

export interface WornArmor {
    /** Slot -> what is on it, as the game names it ("stalowa dluga kolczuge") */
    slots: Record<string, string>;
    /** Worn in the last `i` reply, but on no slot: nothing yet says what it covers */
    unplaced: string[];
    /** Lines of the last `i` reply nothing knows: a way of wording it still to be learned */
    unknownLines: string[];
    updatedAt: number | null;
}

const WEAR = /^Zakladasz (.+) na (.+)\.$/;
const TAKE_OFF = /^Zdejmujesz z siebie (.+)\.$/;

const NOTHING: WornArmor = { slots: {}, unplaced: [], unknownLines: [], updatedAt: null };

let armor: WornArmor = NOTHING;

export function getWornArmor(): WornArmor {
    return { ...armor, slots: { ...armor.slots }, unplaced: [...armor.unplaced], unknownLines: [...armor.unknownLines] };
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

/** One word in two cases: "kolczuge" / "kolczuga", "dluga" / "dluga" */
function sameWord(a: string, b: string): boolean {
    if (a === b) return true;
    let shared = 0;
    while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
    return shared >= Math.max(3, Math.min(a.length, b.length) - 2);
}

/** "stalowa dluga kolczuge" (put on) is the złom entry "stalowa dluga kolczuga" */
function sameItem(a: string, b: string): boolean {
    const wordsA = a.toLowerCase().split(/\s+/);
    const wordsB = b.toLowerCase().split(/\s+/);
    return wordsA.length === wordsB.length && wordsA.every((word, i) => sameWord(word, wordsB[i]));
}

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
function isNotArmour(name: string): boolean {
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
export function slotsFromLines(
    lines: string[],
    known: { entry: { short: string; shortAlt?: string; oslona: string }; shield: boolean; matches: (line: string) => boolean }[],
): Record<string, string> {
    const slots: Record<string, string> = {};
    known.forEach(({ entry, shield, matches }) => {
        if (!lines.some(matches)) return;
        const covered = shield ? ["tarcza"] : parseSlots(entry.oslona);
        covered.forEach(slot => { slots[slot] = entry.shortAlt || entry.short; });
    });
    return slots;
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
        const { zbroje, tarcze } = getZlomSnapshot();
        const slots = {
            ...slotsFromWorn(worn, [...zbroje, ...tarcze.map(entry => ({ ...entry, shield: true }))]),
            ...slotsFromLines(lines, iLineEntries(getZlomSnapshot())),
        };
        const next = { slots, unplaced: unplacedPieces(worn, slots), unknownLines: unknown };
        if (JSON.stringify(next) === JSON.stringify({ slots: armor.slots, unplaced: armor.unplaced, unknownLines: armor.unknownLines })) return;
        store({ ...next, updatedAt: Date.now() });
    });

    if (aliases) {
        aliases.push({ pattern: /^\/zbroja$/, callback: () => eventBus.emit("armor.popup.open") });
    }

    return () => {
        removeStorageListener();
        removeReadListener();
        client.Triggers.removeByTag("armor");
        armor = NOTHING;
    };
}
