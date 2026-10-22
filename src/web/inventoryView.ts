import { getGroupDefinitions } from '@client/scripts/prettyContainers';
import { splitName } from '@client/scripts/inventoryActions';
import { sameItem } from '@client/scripts/armor';
import { iLineMatcher, type ZlomSnapshot } from '@modules/data/zlomStore';

export { splitName, type NameParts } from '@client/scripts/inventoryActions';

/** An `i` line that is a whole name, "garnczkowy helm zdobiony majestatycznym jelenim porozem", or a /regexp/ */
function namedBy(iLine: string | undefined, name: string): boolean {
    const raw = iLine?.trim();
    if (!raw) return false;
    if (/^\/.+\/[a-z]*$/.test(raw)) return iLineMatcher(raw)?.(name) ?? false;
    return sameItem(raw.replace(/\.$/, ''), name);
}

/**
 * The złom name of a piece `i` names its own way: "garnczkowy helm z jelenim
 * porozem" for "garnczkowy helm zdobiony majestatycznym jelenim porozem",
 * through the entry's `i` line or other name. Null for anything else.
 */
export function zlomName(name: string, zlom: ZlomSnapshot): string | null {
    const entries = [...zlom.zbroje, ...zlom.tarcze];
    const entry = entries.find(e => !sameItem(e.short, name)
        && ((e.shortAlt && sameItem(e.shortAlt, name)) || namedBy(e.iLine, name)));
    return entry?.short ?? null;
}

export type ItemCategory =
    | 'bag' | 'coins' | 'light'
    | 'bronie' | 'korpus' | 'tarcze' | 'glowa' | 'rece' | 'nogi' | 'ubrania' | 'bizuteria' | 'kamienie' | 'ryby'
    | 'other';

const LIGHT = /(?:^|\s)(?:lamp|latarni|latarn|pochodni|swiec|kaganek|kaganc)/;
const COINS = /(?:^|\s)monet/;

/** What kind of thing an item is, for its icon: the pretty-container groups, plus bags, coins and lights */
export function itemCategory(name: string, isBag: boolean): ItemCategory {
    if (isBag) return 'bag';
    if (COINS.test(name)) return 'coins';
    if (LIGHT.test(name)) return 'light';
    // The thing itself, not its detail: "plaszcz z kapturem" is a cloak, not headgear
    const { before, noun } = splitName(name);
    const head = before ? `${before} ${noun}` : noun;
    const group = getGroupDefinitions().find(g => g.filter(head));
    return (group?.name as ItemCategory | undefined) ?? 'other';
}

/** Polish names of the built-in /pojemnik types; plugin types bring their own label */
const TYPE_LABELS: Record<string, string> = {
    money: 'monety',
    gems: 'kamienie',
    food: 'jedzenie',
    other: 'inne',
};

export function containerTypeLabel(type: { id: string; label: string }): string {
    return TYPE_LABELS[type.id] ?? type.label;
}
