import { afterEach, describe, expect, test, vi } from 'vitest';
import {
    getMainMenuItems,
    registerMainMenuItem,
    subscribeMainMenu,
    unregisterMainMenuItem,
    updateMainMenuItem,
    type MainMenuItem,
} from '@modules/core/mainMenuRegistry';
import { registerPopupMenuEntry, unregisterPopupMenuEntry, updatePopupMenuEntryLabel } from '@modules/core/pluginUiRegistry';

/** The ⋯ menu's entries: built-ins from the stock UI, plugins through api.ui. */

const registered = new Set<string>();

function add(id: string, order: number, extra: Partial<MainMenuItem> = {}): void {
    registered.add(id);
    registerMainMenuItem({ id, label: id, order, onSelect: () => {}, source: 'builtin', ...extra });
}

afterEach(() => {
    registered.forEach((id) => unregisterMainMenuItem(id));
    registered.clear();
});

const ids = () => getMainMenuItems().map((item) => item.id);

describe('mainMenuRegistry', () => {
    test('lists the entries by order, whatever order they registered in', () => {
        add('c', 30);
        add('a', 10);
        add('b', 20);
        expect(ids()).toEqual(['a', 'b', 'c']);
    });

    test('keeps the same snapshot until something changes', () => {
        add('a', 10);
        const first = getMainMenuItems();
        expect(getMainMenuItems()).toBe(first);
        updateMainMenuItem('a', { disabled: true });
        expect(getMainMenuItems()).not.toBe(first);
    });

    test('an update merges into the entry and can move it', () => {
        add('a', 10, { group: 'gra', icon: 'zap' });
        add('b', 20);
        updateMainMenuItem('a', { label: 'Nowe', order: 30 });
        expect(ids()).toEqual(['b', 'a']);
        expect(getMainMenuItems()[1]).toMatchObject({ label: 'Nowe', group: 'gra', icon: 'zap' });
    });

    test('an update can clear a field', () => {
        add('a', 10, { tone: 'danger' });
        updateMainMenuItem('a', { tone: undefined });
        expect(getMainMenuItems()[0].tone).toBeUndefined();
    });

    test('updating or removing an unknown entry changes nothing', () => {
        add('a', 10);
        const listener = vi.fn();
        const off = subscribeMainMenu(listener);
        updateMainMenuItem('missing', { label: 'x' });
        unregisterMainMenuItem('missing');
        expect(listener).not.toHaveBeenCalled();
        off();
    });

    test('listeners hear registrations and removals until they unsubscribe', () => {
        const listener = vi.fn();
        const off = subscribeMainMenu(listener);
        add('a', 10);
        unregisterMainMenuItem('a');
        expect(listener).toHaveBeenCalledTimes(2);
        off();
        add('b', 10);
        expect(listener).toHaveBeenCalledTimes(2);
    });

    test('a plugin entry comes last, from a plugin, with no group (the menu puts it in Wtyczki)', () => {
        add('a', 910);
        registerPopupMenuEntry('plugin-1', 'Notatnik', () => {});
        try {
            const entry = getMainMenuItems().at(-1)!;
            expect(entry).toMatchObject({ id: 'plugin-1', label: 'Notatnik', source: 'plugin', order: 1000 });
            expect(entry.group).toBeUndefined();
            updatePopupMenuEntryLabel('plugin-1', 'Notes');
            expect(getMainMenuItems().at(-1)!.label).toBe('Notes');
        } finally {
            unregisterPopupMenuEntry('plugin-1');
        }
        expect(ids()).toEqual(['a']);
    });
});
