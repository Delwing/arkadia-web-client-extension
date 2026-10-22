import { getGroupDefinitions } from '@client/scripts/prettyContainers';
import { splitName } from '@client/scripts/inventoryActions';

export { splitName, type NameParts } from '@client/scripts/inventoryActions';

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
