import type { BookCategoryState } from '@client/ports';
import { showTooltip, hideTooltip, type TooltipEntry } from '@shared/dom/tooltip';

export { hideTooltip as hideBookTooltip };

function categoryRow({ category, status }: BookCategoryState): Node {
    const row = document.createElement('span');
    row.className = `book-tooltip__category book-tooltip__category--${status}`;

    const mark = document.createElement('span');
    mark.className = 'book-tooltip__mark';
    mark.textContent = status === 'completed' ? '✓' : '';

    const name = document.createElement('span');
    name.textContent = category;

    row.append(mark, name);
    return row;
}

export function showBookTooltip(categories: BookCategoryState[], x: number, y: number): void {
    if (categories.length === 0) return;

    const entries: TooltipEntry[] = categories.map((state) => ({ label: '', content: categoryRow(state) }));

    showTooltip(entries, x, y, 'Kategorie');
}
