import { beforeEach, describe, expect, test } from 'vitest';
import { globalStorage } from '@modules/core/storage';
import { getAllFooterItems, getFooterItems } from '@modules/core/footerRegistry';
import {
    registerFooterComponent,
    setFooterComponentVisible,
    unregisterFooterComponent,
    updateFooterComponent,
    updateFooterComponentPluginName,
} from '@modules/core/pluginFooterRegistry';

/**
 * Footer components registered by plugins. Most of this is the behaviour that
 * existed before they joined the footer settings config, pinned here because
 * they now pass through the same visibility/order machinery as the built-in
 * chips and must still work for a plugin that knows nothing about it.
 */

const ids = new Set<string>();

function register(id: string, content: string, position: 'start' | 'end' | number = 'end', owner?: { pluginId: string; localId: string }) {
    ids.add(id);
    return registerFooterComponent(id, content, position, owner);
}

const item = (id: string) => getAllFooterItems().find((i) => i.id === id);

beforeEach(() => {
    for (const id of ids) unregisterFooterComponent(id);
    ids.clear();
    localStorage.clear();
    globalStorage.set('uiSettings', { footerComponents: [] } as never);
});

describe('plugin footer components', () => {
    test('render their content into a span the plugin owns', () => {
        const record = register('plugin:p:chip', '<b>hi</b>');
        expect(record.element.tagName).toBe('SPAN');
        expect(record.element.innerHTML).toBe('<b>hi</b>');
        expect(record.element.dataset.pluginFooterId).toBe('plugin:p:chip');
    });

    test('keep the position they asked for when nothing has configured them', () => {
        register('plugin:p:first', 'a', 'start');
        register('plugin:p:last', 'b', 'end');
        register('plugin:p:exact', 'c', 500);
        expect(getFooterItems().map((i) => i.id)).toEqual([
            'plugin:p:first',
            'plugin:p:exact',
            'plugin:p:last',
        ]);
    });

    test('are shown by default - a plugin need not know the config exists', () => {
        register('plugin:p:chip', 'a');
        expect(getFooterItems().map((i) => i.id)).toEqual(['plugin:p:chip']);
    });

    test('updateFooterComponent replaces the content without re-registering', () => {
        const record = register('plugin:p:chip', 'one');
        const { element } = record;
        updateFooterComponent('plugin:p:chip', 'two');
        // The same span: plugins hold on to `handle.element` and write into it.
        expect(item('plugin:p:chip')?.node).toBe(element);
        expect(element.innerHTML).toBe('two');
    });

    test('setFooterComponentVisible still hides the plugin way, by display', () => {
        const record = register('plugin:p:chip', 'a');
        setFooterComponentVisible('plugin:p:chip', false);
        expect(record.element.style.display).toBe('none');
        setFooterComponentVisible('plugin:p:chip', true);
        expect(record.element.style.display).toBe('');
    });

    test('unregistering removes the item', () => {
        register('plugin:p:chip', 'a');
        unregisterFooterComponent('plugin:p:chip');
        expect(item('plugin:p:chip')).toBeUndefined();
    });

    test('re-registering the same id replaces rather than duplicates', () => {
        register('plugin:p:chip', 'one');
        register('plugin:p:chip', 'two');
        expect(getAllFooterItems().filter((i) => i.id === 'plugin:p:chip')).toHaveLength(1);
        expect(item('plugin:p:chip')?.node?.innerHTML).toBe('two');
    });
});

describe('what the settings panel calls them', () => {
    test('falls back to the id when the owner is unknown', () => {
        // How every caller looked before ownership was passed in.
        register('plugin:p:chip', 'a');
        expect(item('plugin:p:chip')?.label).toBe('plugin:p:chip');
    });

    test('uses the local id until the plugin name arrives', () => {
        register('plugin:p:chip', 'a', 'end', { pluginId: 'p', localId: 'chip' });
        expect(item('plugin:p:chip')?.label).toBe('chip');
    });

    test('uses the plugin name once it does', () => {
        // A plugin registers during init(), before the manager knows its name.
        register('plugin:p:chip', 'a', 'end', { pluginId: 'p', localId: 'chip' });
        updateFooterComponentPluginName('p', 'Towarzysz');
        expect(item('plugin:p:chip')?.label).toBe('Towarzysz');
    });

    test('names arriving before the component works too', () => {
        updateFooterComponentPluginName('p', 'Towarzysz');
        register('plugin:p:chip', 'a', 'end', { pluginId: 'p', localId: 'chip' });
        expect(item('plugin:p:chip')?.label).toBe('Towarzysz');
    });

    test('distinguishes two components of the same plugin, and stops when one goes', () => {
        register('plugin:p:one', 'a', 'end', { pluginId: 'p', localId: 'one' });
        updateFooterComponentPluginName('p', 'Towarzysz');
        expect(item('plugin:p:one')?.label).toBe('Towarzysz');

        register('plugin:p:two', 'b', 'end', { pluginId: 'p', localId: 'two' });
        expect(item('plugin:p:one')?.label).toBe('Towarzysz: one');
        expect(item('plugin:p:two')?.label).toBe('Towarzysz: two');

        unregisterFooterComponent('plugin:p:two');
        expect(item('plugin:p:one')?.label).toBe('Towarzysz');
    });

    test('a pluginId full of colons survives, because it is never parsed', () => {
        // The real shape: pluginId is the plugin's URL.
        const id = 'plugin:https://example.com/x.js:chip';
        register(id, 'a', 'end', { pluginId: 'https://example.com/x.js', localId: 'chip' });
        updateFooterComponentPluginName('https://example.com/x.js', 'Chip Test');
        expect(item(id)?.label).toBe('Chip Test');
    });
});
