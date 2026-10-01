import { describe, expect, it, vi } from 'vitest';
import {
    buildBookContextMenuItems,
    getBookCategoryStates,
    getBookOverallStatus,
} from '@client/bookProgress.ts';

describe('bookProgress', () => {
    it('reports each category on its own', () => {
        const states = getBookCategoryStates(
            { wampiry: true, Nieumarli: 'in_progress' },
            ['wampiry', 'nieumarli', 'smoki i smokowate'],
        );
        expect(states).toEqual([
            { category: 'wampiry', status: 'completed' },
            { category: 'nieumarli', status: 'in_progress' },
            { category: 'smoki i smokowate', status: 'not_started' },
        ]);
    });

    it('treats a book with no progress as not started', () => {
        const states = getBookCategoryStates(undefined, ['wampiry']);
        expect(states).toEqual([{ category: 'wampiry', status: 'not_started' }]);
        expect(getBookOverallStatus(states)).toBe('not_started');
    });

    it('calls a book done only when every category is', () => {
        expect(getBookOverallStatus([
            { category: 'a', status: 'completed' },
            { category: 'b', status: 'not_started' },
        ])).toBe('in_progress');
        expect(getBookOverallStatus([
            { category: 'a', status: 'completed' },
            { category: 'b', status: 'completed' },
        ])).toBe('completed');
    });

    it('ticks completed categories in the context menu', () => {
        const send = vi.fn();
        const items = buildBookContextMenuItems(
            [
                { category: 'wampiry', status: 'completed' },
                { category: 'nieumarli', status: 'not_started' },
            ],
            { dopelniacz: 'ksiegi', biernik: 'ksiege' },
            send,
        );
        expect(items.map((i) => i.checked)).toEqual([true, false]);
        items[1].action();
        expect(send).toHaveBeenCalledWith('otworz ksiege;zglebiaj wiedze o nieumarlych z ksiegi');
    });
});
