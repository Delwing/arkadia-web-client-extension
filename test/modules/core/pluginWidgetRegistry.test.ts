import { afterEach, describe, expect, test } from 'vitest';
import { getWidgetType, getWidgetTypes, resolveWidgetSettings } from '@modules/core/widgetRegistry';
import {
    registerPluginWidget,
    unregisterPluginWidget,
    updatePluginWidget,
    updateWidgetPluginName,
} from '@modules/core/pluginWidgetRegistry';

const ids = new Set<string>();

function register(id: string, content: string, options = {}, owner?: { pluginId: string; localId: string }) {
    ids.add(id);
    return registerPluginWidget(id, content, options, owner);
}

afterEach(() => {
    for (const id of ids) unregisterPluginWidget(id);
    ids.clear();
});

describe('plugin widgets', () => {
    test('registering offers a node widget type with the plugin content', () => {
        const record = register('plugin:p:licznik', '<b>3</b>', { corner: 'bl' });
        const type = getWidgetType('plugin:p:licznik');
        expect(type?.source).toBe('plugin');
        expect(type?.defaultCorner).toBe('bl');
        expect(type?.node).toBe(record.element);
        expect(record.element.innerHTML).toBe('<b>3</b>');
    });

    test('content updates in place', () => {
        const record = register('plugin:p:licznik', 'a');
        updatePluginWidget('plugin:p:licznik', 'b');
        expect(record.element.textContent).toBe('b');
        expect(getWidgetType('plugin:p:licznik')?.node).toBe(record.element);
    });

    test('named after its plugin once the name is known, unless it chose a label', () => {
        register('plugin:p1:a', 'x', {}, { pluginId: 'p1', localId: 'a' });
        register('plugin:p2:b', 'x', { label: 'Licznik' }, { pluginId: 'p2', localId: 'b' });
        expect(getWidgetType('plugin:p1:a')?.label).toBe('a');
        updateWidgetPluginName('p1', 'Moja wtyczka');
        updateWidgetPluginName('p2', 'Inna');
        expect(getWidgetType('plugin:p1:a')?.label).toBe('Moja wtyczka');
        expect(getWidgetType('plugin:p2:b')?.label).toBe('Licznik');
    });

    test('unregistering withdraws the type', () => {
        register('plugin:p:gone', 'x');
        unregisterPluginWidget('plugin:p:gone');
        expect(getWidgetTypes().some(t => t.id === 'plugin:p:gone')).toBe(false);
    });

    test('settings fall back to each option default', () => {
        const type = {
            id: 't',
            label: 'T',
            options: [{ key: 'view', label: 'V', default: 'current', choices: [] }],
        };
        expect(resolveWidgetSettings(type, undefined)).toEqual({ view: 'current' });
        expect(resolveWidgetSettings(type, { view: 'both' })).toEqual({ view: 'both' });
    });
});
