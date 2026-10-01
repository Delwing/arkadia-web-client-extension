import type { KnowledgeBookCategoryProgress } from '@modules/data/dataStores/knowledgeStore';
import type { BookCategoryState, BookCategoryStatus, ContextMenuEntry } from './ports/uiPort';
import { getDativeCategoryName } from './knowledgeCategories';

function findProgress(progress: KnowledgeBookCategoryProgress, category: string): true | 'in_progress' | undefined {
    if (progress[category] != null) return progress[category];
    const lower = category.toLowerCase();
    for (const [key, value] of Object.entries(progress)) {
        if (key.toLowerCase() === lower) return value;
    }
    return undefined;
}

/** The character's progress in each category the book teaches. */
export function getBookCategoryStates(
    progress: KnowledgeBookCategoryProgress | undefined,
    categories: string[],
): BookCategoryState[] {
    return categories.map((category) => {
        const value = progress ? findProgress(progress, category) : undefined;
        const status: BookCategoryStatus =
            value === true ? 'completed' : value != null ? 'in_progress' : 'not_started';
        return { category, status };
    });
}

/** The whole book: done when every category is, started when any is. */
export function getBookOverallStatus(states: BookCategoryState[]): BookCategoryStatus {
    if (states.length > 0 && states.every((s) => s.status === 'completed')) return 'completed';
    if (states.some((s) => s.status !== 'not_started')) return 'in_progress';
    return 'not_started';
}

/** One "zglebiaj wiedze" row per category, ticked where the category is done. */
export function buildBookContextMenuItems(
    states: BookCategoryState[],
    book: { dopelniacz: string; biernik?: string },
    send: (command: string) => void,
): ContextMenuEntry[] {
    return states.map(({ category, status }) => {
        const zglebiaj = `zglebiaj wiedze o ${getDativeCategoryName(category)} z ${book.dopelniacz}`;
        const biernik = book.biernik?.trim();
        const cmd = biernik ? `otworz ${biernik};${zglebiaj}` : zglebiaj;
        return {
            label: zglebiaj,
            checked: status === 'completed',
            action: () => send(cmd),
        };
    });
}
