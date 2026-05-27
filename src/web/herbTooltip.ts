import type { HerbUse } from '@modules/data/dataStores/herbsStore';
import { mudletColorLine } from '@modules/core/Colors';
import { showTooltip, hideTooltip, type TooltipEntry } from '@shared/dom/tooltip';

export { hideTooltip as hideHerbTooltip };

export function showHerbTooltip(herbId: string, actions: HerbUse[] | undefined, x: number, y: number): void {
    if (!actions || actions.length === 0) return;

    const displayable = actions.filter(action => !action.smokable);
    if (displayable.length === 0) return;

    const entries: TooltipEntry[] = displayable.map(action => {
        const rawEffect = typeof action.effect === 'string' ? action.effect.trim() : '';
        const content = rawEffect ? mudletColorLine(rawEffect).toDom() : '--';
        return {
            label: `${action.action}:`,
            content,
        };
    });

    showTooltip(entries, x, y, herbId);
}
