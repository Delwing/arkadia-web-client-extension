import { getBindableUses, isHerbSmokable, type HerbsData, type HerbUse } from '@modules/data/dataStores/herbsStore.ts';

/**
 * Herb effects grouped by what the player wants to achieve. The herb data
 * describes each use with short tokens (`+kon`, `-zmc`, `odtr`…); a group
 * collects the tokens that mean the same thing.
 */
export interface HerbEffectGroup {
    key: string;
    label: string;
    tokens: string[];
    /** Harmful group: listed, but never offered for a one-click use. */
    danger?: boolean;
}

export const HERB_EFFECT_GROUPS: HerbEffectGroup[] = [
    { key: 'heal', label: 'Leczenie', tokens: ['+kon'] },
    { key: 'fatigue', label: 'Zmęczenie', tokens: ['-zmc'] },
    { key: 'antidote', label: 'Odtrutki', tokens: ['odtr', 'odtr?'] },
    { key: 'resist', label: 'Odporność', tokens: ['+odp'] },
    { key: 'mana', label: 'Mana', tokens: ['+mana', '+man'] },
    { key: 'stats', label: 'Cechy', tokens: ['+sila', '+zrc', '+wyt', '+int', '+odw', '+spo'] },
    { key: 'sober', label: 'Kac i upicie', tokens: ['-kac', '-pij', '-upicie'] },
    { key: 'calm', label: 'Panika', tokens: ['-pan'] },
    { key: 'other', label: 'Inne', tokens: ['telepatia', 'rozpalenie', '+prg'] },
    { key: 'poison', label: 'Trucizny', tokens: ['tr'], danger: true },
];

/** Pseudo-group for herbs that are smoked in a pipe rather than used. */
export const SMOKE_GROUP_KEY = 'smoke';

const POISON_TOKEN = 'tr';
const SIDE_EFFECT_TOKENS = new Set(['+kac', '+glod', '+panika', '+pan', '-int', '-kon', '-mana', '-man', '+pij', '+zmc']);
const PLACEHOLDER_EFFECTS = new Set(['--', '---', '???']);

const TOKEN_TO_GROUP = new Map<string, string>();
HERB_EFFECT_GROUPS.forEach(group => group.tokens.forEach(token => TOKEN_TO_GROUP.set(token, group.key)));

export type HerbEffectTone = 'good' | 'side' | 'bad' | 'neutral';

/** The effect text without Mudlet colour tags, or '' for placeholder effects. */
export function cleanHerbEffect(effect: string | undefined): string {
    const text = typeof effect === 'string' ? effect.replace(/<[^>]+>/g, '').trim() : '';
    return PLACEHOLDER_EFFECTS.has(text) ? '' : text;
}

export function herbEffectTokens(effect: string | undefined): string[] {
    return cleanHerbEffect(effect).split(/\s+/).filter(Boolean);
}

export function herbEffectTone(token: string): HerbEffectTone {
    if (token === POISON_TOKEN) return 'bad';
    if (SIDE_EFFECT_TOKENS.has(token)) return 'side';
    return TOKEN_TO_GROUP.has(token) ? 'good' : 'neutral';
}

export function herbEffectGroupOf(token: string): string | undefined {
    return TOKEN_TO_GROUP.get(token);
}

/** Every group a herb belongs to (through any of its uses), plus `smoke` for pipe herbs. */
export function herbGroupKeys(uses: HerbUse[] | undefined): Set<string> {
    const keys = new Set<string>();
    getBindableUses(uses).forEach(use => herbEffectTokens(use.effect).forEach(token => {
        const group = TOKEN_TO_GROUP.get(token);
        if (group) keys.add(group);
    }));
    if (isHerbSmokable(uses)) keys.add(SMOKE_GROUP_KEY);
    return keys;
}

export interface HerbEffectEntry {
    herbId: string;
    action: string;
    effect: string;
    tokens: string[];
    sideEffects: string[];
    count: number;
}

/**
 * One entry per (herb, use) that has an effect in `groupKey`, for the herbs
 * held. Most held first; on a tie, fewer side effects first.
 */
export function herbEffectEntries(
    groupKey: string,
    herbsData: HerbsData | null,
    totals: Record<string, number>,
): HerbEffectEntry[] {
    const entries: HerbEffectEntry[] = [];
    Object.entries(totals).forEach(([herbId, count]) => {
        if (count <= 0) return;
        getBindableUses(herbsData?.herb_id_to_use[herbId]).forEach(use => {
            const tokens = herbEffectTokens(use.effect);
            if (!tokens.some(token => TOKEN_TO_GROUP.get(token) === groupKey)) return;
            entries.push({
                herbId,
                action: use.action,
                effect: cleanHerbEffect(use.effect),
                tokens,
                sideEffects: tokens.filter(token => herbEffectTone(token) === 'side' || herbEffectTone(token) === 'bad'),
                count,
            });
        });
    });
    return entries.sort((a, b) =>
        (b.count - a.count) || (a.sideEffects.length - b.sideEffects.length) || a.herbId.localeCompare(b.herbId));
}
