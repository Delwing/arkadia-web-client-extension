import type { HerbBagsState } from '@client/types/herbs.ts';
import { getBindableUses, isHerbSmokable, type HerbsData } from '@modules/data/dataStores/herbsStore.ts';
import { HERB_EFFECT_GROUPS, cleanHerbEffect, herbGroupKeys } from '@modules/data/herbEffects.ts';

export type HerbWindowMode = 'bags' | 'list' | 'effects';

export const HERB_USE_AMOUNTS = [1, 3, 5];

/** Totals per herb across all bags. */
export function herbTotals(bags: HerbBagsState): Record<string, number> {
    const totals: Record<string, number> = {};
    Object.values(bags).forEach(bag => {
        Object.entries(bag?.herbs ?? {}).forEach(([herbId, count]) => {
            totals[herbId] = (totals[herbId] ?? 0) + count;
        });
    });
    return totals;
}

/** The amount buttons worth showing for a stack of `count` (never more than held). */
export function amountsFor(count: number): number[] {
    return HERB_USE_AMOUNTS.filter(amount => amount <= Math.max(1, count));
}

export interface HerbFilter {
    query: string;
    /** One effect group key (see HERB_EFFECT_GROUPS, or `smoke`), or null for all. */
    group: string | null;
}

export function isHerbFilterActive(filter: HerbFilter): boolean {
    return filter.query.trim() !== '' || filter.group !== null;
}

/**
 * What the search box looks at: the herb id, its description, its effects
 * (so `kac` finds both `+kac` and `-kac`) and the names of its effect groups
 * (so `odtrut` finds the antidotes).
 */
function searchTexts(herbId: string, herbsData: HerbsData | null): string[] {
    const uses = herbsData?.herb_id_to_use[herbId];
    const groups = herbGroupKeys(uses);
    return [
        herbId,
        herbsData?.herb_id_to_odmiana[herbId]?.mianownik ?? '',
        ...getBindableUses(uses).map(use => cleanHerbEffect(use.effect)),
        ...HERB_EFFECT_GROUPS.filter(group => groups.has(group.key)).map(group => group.label.toLowerCase()),
    ];
}

export function matchesHerbFilter(herbId: string, herbsData: HerbsData | null, filter: HerbFilter): boolean {
    const query = filter.query.trim().toLowerCase();
    if (query && !searchTexts(herbId, herbsData).some(text => text.includes(query))) {
        return false;
    }
    if (filter.group !== null) {
        return herbGroupKeys(herbsData?.herb_id_to_use[herbId]).has(filter.group);
    }
    return true;
}

export type HerbCopyFormat = 'list' | 'effects' | 'bags';

/** Plain-text inventory for the clipboard, limited to `herbIds`. */
export function formatHerbInventory(
    format: HerbCopyFormat,
    herbIds: string[],
    bags: HerbBagsState,
    herbsData: HerbsData | null,
): string {
    const ids = [...herbIds].sort((a, b) => a.localeCompare(b));
    const totals = herbTotals(bags);
    if (format === 'bags') {
        const wanted = new Set(ids);
        return Object.entries(bags)
            .map(([bagNumber, bag]) => [Number(bagNumber), bag] as const)
            .sort((a, b) => a[0] - b[0])
            .map(([bagNumber, bag]) => {
                const items = Object.entries(bag?.herbs ?? {})
                    .filter(([herbId, count]) => count > 0 && wanted.has(herbId))
                    .sort((a, b) => a[0].localeCompare(b[0]));
                if (items.length === 0) return '';
                const condition = typeof bag?.condition === 'number' ? ` (${bag.condition}/5)` : '';
                return `Woreczek ${bagNumber}${condition}: ${items.map(([herbId, count]) => `${count} ${herbId}`).join(', ')}`;
            })
            .filter(Boolean)
            .join('\n');
    }
    if (format === 'effects') {
        const width = Math.max(0, ...ids.map(id => id.length));
        return ids.map(herbId => {
            const uses = herbsData?.herb_id_to_use[herbId];
            const described = getBindableUses(uses)
                .map(use => `${use.action} ${cleanHerbEffect(use.effect) || '--'}`)
                .join(' | ');
            const text = described || (isHerbSmokable(uses) ? 'do palenia' : '--');
            return `${String(totals[herbId] ?? 0).padStart(3)} ${herbId.padEnd(width)}  ${text}`;
        }).join('\n');
    }
    const total = ids.reduce((sum, herbId) => sum + (totals[herbId] ?? 0), 0);
    return [`Zioła (${total} szt.):`, ...ids.map(herbId => `${String(totals[herbId] ?? 0).padStart(3)} ${herbId}`)].join('\n');
}
