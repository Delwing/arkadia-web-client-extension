import { showTooltip, hideTooltip, type TooltipEntry } from '@shared/dom/tooltip';

export { hideTooltip as hideBookTooltip };

export function showBookTooltip(categories: string[], x: number, y: number): void {
    if (categories.length === 0) return;

    const entries: TooltipEntry[] = [{
        label: 'Kategorie:',
        content: categories.join(', '),
    }];

    showTooltip(entries, x, y);
}
