import { describe, expect, test, vi } from 'vitest';
import { buildObjectContextMenu } from '@web/objectList/objectContextMenu.ts';
import * as categories from '@web/settings/categories.ts';

const labels = (items: { label: unknown }[]) => items.map((item) => item.label);

describe('buildObjectContextMenu', () => {
    test('the commands aim at the object, then queueing and editing them', () => {
        const sent: string[] = [];
        const { items } = buildObjectContextMenu({ id: '48213' }, ['zabij', 'ob'], (c) => sent.push(c));

        expect(labels(items)).toEqual(['zabij', 'ob', 'Dodaj do kolejki ataku', 'Edytuj te komendy']);
        items[0].action();
        items[2].action();
        expect(sent).toEqual(['zabij ob_48213', '/q ob_48213']);
        expect(items[2].separator).toBe(true);
    });

    test('each verb gets its own icon; an unknown one a generic one', () => {
        const { items } = buildObjectContextMenu({ id: '1' }, ['zabij', 'wskaz', 'cmoknij'], () => {});

        expect(items[0].icon).not.toBe(items[1].icon);
        expect(items[2].icon).toBeDefined();
    });

    test('a teammate cannot be queued for an attack', () => {
        const { items, options } = buildObjectContextMenu(
            { id: '5', desc: 'Arel', teammate: true },
            ['ob'],
            () => {},
        );

        expect(labels(items)).toEqual(['ob', 'Edytuj te komendy']);
        expect(items[1].separator).toBe(true);
        expect(options.headerMeta).toBe('ob_5 · drużyna');
    });

    test('headed by the object name and id, or just the id', () => {
        expect(buildObjectContextMenu({ id: '9', desc: 'goblin' }, [], () => {}).options)
            .toMatchObject({ header: 'goblin', headerMeta: 'ob_9', width: 260 });
        expect(buildObjectContextMenu({ id: '9' }, [], () => {}).options).toMatchObject({ header: 'ob_9' });
        expect(buildObjectContextMenu({ id: '9' }, [], () => {}).options)
            .not.toHaveProperty('headerMeta');
    });

    test('"Edytuj te komendy" opens the settings page with the editor', () => {
        const open = vi.spyOn(categories, 'openSettingsPage').mockImplementation(() => {});
        const { items } = buildObjectContextMenu({ id: '9' }, [], () => {});

        items.at(-1)!.action();
        expect(open).toHaveBeenCalledWith('ui-windows', 'ui-object-context-menu-container');
        expect(items.at(-1)!.opensWindow).toBe(true);
        open.mockRestore();
    });
});
