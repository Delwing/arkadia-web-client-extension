import { describe, expect, test } from 'vitest';
import { groupEntries } from '@web/contextMenu/contextMenuBlocks.ts';
import type { ContextMenuEntry } from '@web/contextMenu';

const entry = (label: string, extra: Partial<ContextMenuEntry> = {}): ContextMenuEntry => ({
    label,
    action: () => {},
    ...extra,
});

const shape = (items: ContextMenuEntry[]) =>
    groupEntries(items).map((block) => ({
        labels: block.items.map((item) => item.label),
        caption: block.caption,
        separatorBefore: block.separatorBefore,
        variant: block.variant,
    }));

describe('groupEntries', () => {
    test('plain entries are one block, with no separator or caption', () => {
        expect(shape([entry('a'), entry('b')])).toEqual([
            { labels: ['a', 'b'], caption: undefined, separatorBefore: false, variant: undefined },
        ]);
    });

    test('a new section starts with a separator and its caption', () => {
        expect(shape([entry('a', { section: 'Zaznaczenie' }), entry('b', { section: 'Widok' })])).toEqual([
            { labels: ['a'], caption: 'Zaznaczenie', separatorBefore: false, variant: undefined },
            { labels: ['b'], caption: 'Widok', separatorBefore: true, variant: undefined },
        ]);
    });

    test('an entry can ask for a separator within its section, without repeating the caption', () => {
        expect(shape([entry('a', { section: 'S' }), entry('b', { section: 'S', separator: true })])).toEqual([
            { labels: ['a'], caption: 'S', separatorBefore: false, variant: undefined },
            { labels: ['b'], caption: undefined, separatorBefore: true, variant: undefined },
        ]);
    });

    test('tiles of a section gather into one grid', () => {
        const blocks = shape([
            entry('Widok', { section: 'Widok' }),
            entry('Wiedza', { section: 'Okna', variant: 'tile' }),
            entry('Chat', { section: 'Okna', variant: 'tile' }),
            entry('Notatnik', { section: 'Wtyczki' }),
        ]);
        expect(blocks.map((block) => [block.caption, block.variant, block.labels])).toEqual([
            ['Widok', undefined, ['Widok']],
            ['Okna', 'tile', ['Wiedza', 'Chat']],
            ['Wtyczki', undefined, ['Notatnik']],
        ]);
    });

    test('quick buttons then rows of no section need an explicit separator', () => {
        const blocks = shape([
            entry('Idz', { variant: 'quick' }),
            entry('Prowadz', { variant: 'quick' }),
            entry('extra', { separator: true }),
        ]);
        expect(blocks.map((block) => [block.variant, block.separatorBefore])).toEqual([
            ['quick', false],
            [undefined, true],
        ]);
    });
});
