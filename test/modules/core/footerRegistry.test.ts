import { beforeEach, describe, expect, test } from 'vitest';
import { globalStorage } from '@modules/core/storage';
import {
    getAllFooterItems,
    getFooterItems,
    registerFooterItem,
    unregisterFooterItem,
    type FooterItem,
} from '@modules/core/footerRegistry';

/**
 * The footer settings panel used to manage built-in chips only: a plugin's
 * footer component was always shown, ordered by the position it asked for, and
 * absent from the list the user reorders. These pin the widened contract - the
 * config reaches every item, and the panel can see the ones it is hiding.
 */

const ids = new Set<string>();

function register(item: FooterItem): void {
    ids.add(item.id);
    registerFooterItem(item);
}

function config(entries: Array<{ id: string; visible?: boolean; order?: number }>): void {
    globalStorage.set('uiSettings', { footerComponents: entries } as never);
}

beforeEach(() => {
    for (const id of ids) unregisterFooterItem(id);
    ids.clear();
    localStorage.clear();
    config([]);
});

describe('footer registry', () => {
    test('a plugin item nobody has configured keeps the position it asked for', () => {
        register({ id: 'clock-display', order: 0, source: 'builtin' });
        register({ id: 'plugin:a:early', order: 0, source: 'plugin' });
        register({ id: 'plugin:b:late', order: 1000, source: 'plugin' });
        config([{ id: 'clock-display', order: 0 }]);

        // "start" before the configured built-ins, "end" after them - exactly
        // where these two sat before the config learned about plugins at all.
        expect(getFooterItems().map((i) => i.id)).toEqual([
            'plugin:a:early',
            'clock-display',
            'plugin:b:late',
        ]);
    });

    test('the config orders a plugin item among the built-ins', () => {
        register({ id: 'clock-display', order: 0, source: 'builtin' });
        register({ id: 'lamp-timer', order: 2, source: 'builtin' });
        register({ id: 'plugin:a:chip', order: 1000, source: 'plugin' });
        config([
            { id: 'clock-display', order: 0 },
            { id: 'plugin:a:chip', order: 1 },
            { id: 'lamp-timer', order: 2 },
        ]);

        expect(getFooterItems().map((i) => i.id)).toEqual([
            'clock-display',
            'plugin:a:chip',
            'lamp-timer',
        ]);
    });

    test('the config can switch a plugin item off, as it always could a built-in', () => {
        register({ id: 'clock-display', order: 0, source: 'builtin' });
        register({ id: 'plugin:a:chip', order: 1000, source: 'plugin' });
        config([
            { id: 'clock-display', order: 0 },
            { id: 'plugin:a:chip', order: 1, visible: false },
        ]);

        expect(getFooterItems().map((i) => i.id)).toEqual(['clock-display']);
    });

    test('a switched-off item is still listed for the settings panel', () => {
        register({ id: 'clock-display', order: 0, source: 'builtin' });
        register({ id: 'plugin:a:chip', order: 1000, source: 'plugin' });
        config([
            { id: 'clock-display', order: 0, visible: false },
            { id: 'plugin:a:chip', order: 1, visible: false },
        ]);

        // Nothing renders, but both are offered - otherwise switching one back
        // on would mean editing storage by hand.
        expect(getFooterItems()).toEqual([]);
        expect(getAllFooterItems().map((i) => i.id)).toEqual(['clock-display', 'plugin:a:chip']);
    });

    test('both listings are ordered the same way', () => {
        register({ id: 'lamp-timer', order: 2, source: 'builtin' });
        register({ id: 'plugin:a:chip', order: 1000, source: 'plugin' });
        register({ id: 'clock-display', order: 0, source: 'builtin' });
        config([
            { id: 'clock-display', order: 0 },
            { id: 'plugin:a:chip', order: 1 },
            { id: 'lamp-timer', order: 2 },
        ]);

        expect(getAllFooterItems().map((i) => i.id)).toEqual(getFooterItems().map((i) => i.id));
    });

    test('a label survives into the listing, which is how a plugin gets a name', () => {
        register({ id: 'plugin:a:chip', order: 1000, source: 'plugin', label: 'Towarzysz' });
        expect(getAllFooterItems()[0]?.label).toBe('Towarzysz');
    });

    test('the snapshot is stable between changes, and replaced by one', () => {
        register({ id: 'clock-display', order: 0, source: 'builtin' });
        const first = getAllFooterItems();
        expect(getAllFooterItems()).toBe(first);
        register({ id: 'plugin:a:chip', order: 1000, source: 'plugin' });
        expect(getAllFooterItems()).not.toBe(first);
    });
});
