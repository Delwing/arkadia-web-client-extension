import { beforeEach, describe, expect, test } from 'vitest';
import { globalStorage } from '@modules/core/storage';
import {
    CONFIG_ORDER_BASE,
    getFooterItems,
    registerFooterItem,
    unregisterFooterItem,
} from '@modules/core/footerRegistry';
import { apply, load } from '@web/uiSettingsCore';

/**
 * The stock footer lays out two kinds of item in one flex row: its built-in
 * chips, which are plain DOM under #char-state and are positioned by
 * `applyFooterComponents`, and the plugin components, which come from the
 * common registry and are positioned by the `order` the registry computed.
 *
 * Both are ordered from the same `uiSettings.footerComponents` list, so both
 * have to land in the same numeric band - otherwise the settings panel can put
 * a plugin component between two chips and the footer will not honour it (which
 * is exactly what happened while the chips used the raw config index and the
 * registry used CONFIG_ORDER_BASE + index).
 */
describe('footer ordering band', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = `
            <div id="char-state">
                <span id="char-state-text"></span>
                <span id="clock-display"></span>
                <span id="combat-timer"></span>
            </div>`;
    });

    function configure(components: Array<{ id: string; visible?: boolean; order: number }>) {
        const settings = load();
        settings.footerComponents = components.map((c) => ({ visible: true, ...c }));
        // apply() reads the DOM; the registry reads storage.
        globalStorage.set('uiSettings', {
            ...(globalStorage.get('uiSettings') as object ?? {}),
            footerComponents: settings.footerComponents,
        } as never);
        apply(settings);
        return settings;
    }

    test('a stock chip and a plugin component share one ordering space', () => {
        const node = document.createElement('span');
        registerFooterItem({ id: 'plugin:https://x/y.js:chip', order: 1000, source: 'plugin', node });

        // The user dragged the plugin component between the two chips.
        configure([
            { id: 'clock-display', order: 0 },
            { id: 'plugin:https://x/y.js:chip', order: 1 },
            { id: 'combat-timer', order: 2 },
        ]);

        const orderOf = (id: string) =>
            Number((document.getElementById(id) as HTMLElement).style.order);
        const pluginOrder = getFooterItems().find((i) => i.id.startsWith('plugin:'))!.order;

        expect(orderOf('clock-display')).toBeLessThan(pluginOrder);
        expect(pluginOrder).toBeLessThan(orderOf('combat-timer'));

        unregisterFooterItem('plugin:https://x/y.js:chip');
    });

    test('items the config says nothing about keep flex order 0 and stay in front', () => {
        configure([
            { id: 'clock-display', order: 0 },
            { id: 'combat-timer', order: 1 },
        ]);

        // The char state text is not a configurable chip; it must not end up
        // behind a chip that was merely dragged to the top of the list.
        const text = document.getElementById('char-state-text') as HTMLElement;
        expect(text.style.order).toBe('');
        expect(Number((document.getElementById('clock-display') as HTMLElement).style.order))
            .toBeGreaterThanOrEqual(CONFIG_ORDER_BASE);
    });

    test('an unmoved plugin component still sits where it asked, around the chips', () => {
        const start = document.createElement('span');
        const end = document.createElement('span');
        registerFooterItem({ id: 'plugin:a:start', order: 0, source: 'plugin', node: start });
        registerFooterItem({ id: 'plugin:a:end', order: 1000, source: 'plugin', node: end });

        configure([
            { id: 'clock-display', order: 0 },
            { id: 'combat-timer', order: 1 },
        ]);

        const byId = new Map(getFooterItems().map((i) => [i.id, i.order]));
        const clock = Number((document.getElementById('clock-display') as HTMLElement).style.order);
        const combat = Number((document.getElementById('combat-timer') as HTMLElement).style.order);

        expect(byId.get('plugin:a:start')!).toBeLessThan(clock);
        expect(byId.get('plugin:a:end')!).toBeGreaterThan(combat);

        unregisterFooterItem('plugin:a:start');
        unregisterFooterItem('plugin:a:end');
    });
});
