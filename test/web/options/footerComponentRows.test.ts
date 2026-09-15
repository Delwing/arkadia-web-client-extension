import { describe, expect, test } from 'vitest';
import { merge, toConfig, type FooterRow } from '@web/options/footerComponentRows';
import type { FooterComponentConfig } from '@web/defaultUiSettings';

/**
 * The footer settings panel lists the built-in chips and, since plugins joined
 * the same config, whatever they have registered. These cover the two joins
 * that makes: config plus live registry on the way in, and rows plus the
 * entries nothing is registered for on the way back out.
 */

const builtin = (id: string, order: number) => ({ id, order, source: 'builtin' });
const plugin = (id: string, order: number, label?: string) => ({ id, order, source: 'plugin', label });

describe('merge', () => {
    test('names a built-in from the panel and a plugin from its registration', () => {
        const rows = merge(
            [{ id: 'clock-display', visible: true, order: 0 }],
            [builtin('clock-display', 0), plugin('plugin:a:chip', 1000, 'Towarzysz')],
        );
        expect(rows.map((r) => [r.label, r.fromPlugin])).toEqual([
            ['Zegar', false],
            ['Towarzysz', true],
        ]);
    });

    test('falls back to the id when a plugin has not said what it is called', () => {
        const rows = merge([], [plugin('plugin:a:chip', 1000)]);
        expect(rows[0]?.label).toBe('plugin:a:chip');
    });

    test('puts an unconfigured plugin where it asked to be, not merely last', () => {
        const rows = merge(
            [
                { id: 'clock-display', visible: true, order: 0 },
                { id: 'lamp-timer', visible: true, order: 1 },
            ],
            [builtin('clock-display', 0), builtin('lamp-timer', 2), plugin('plugin:a:early', 0)],
        );
        // order 0 is "start", which is before every configured built-in.
        expect(rows.map((r) => r.id)).toEqual(['plugin:a:early', 'clock-display', 'lamp-timer']);
    });

    test('once configured, a plugin sits where the config puts it', () => {
        const rows = merge(
            [
                { id: 'clock-display', visible: true, order: 0 },
                { id: 'plugin:a:chip', visible: true, order: 1 },
                { id: 'lamp-timer', visible: true, order: 2 },
            ],
            [builtin('clock-display', 0), builtin('lamp-timer', 2), plugin('plugin:a:chip', 1000)],
        );
        expect(rows.map((r) => r.id)).toEqual(['clock-display', 'plugin:a:chip', 'lamp-timer']);
    });

    test('does not offer a row for a plugin that is not loaded', () => {
        // Nothing behind the switch to act on, and nothing to call it but its id.
        const rows = merge(
            [
                { id: 'clock-display', visible: true, order: 0 },
                { id: 'plugin:gone:chip', visible: true, order: 1 },
            ],
            [builtin('clock-display', 0)],
        );
        expect(rows.map((r) => r.id)).toEqual(['clock-display']);
    });

    test('keeps the built-ins even when nothing has registered them', () => {
        // The bug this is here for: only the forge HUD registers the built-in
        // chips, so requiring a registration emptied this panel in the stock UI
        // and left it showing the loaded plugins and nothing else.
        const rows = merge(
            [
                { id: 'clock-display', visible: true, order: 0 },
                { id: 'lamp-timer', visible: false, order: 1 },
            ],
            [],
        );
        expect(rows.map((r) => [r.id, r.label, r.fromPlugin])).toEqual([
            ['clock-display', 'Zegar', false],
            ['lamp-timer', 'Timer lampy', false],
        ]);
    });

    test('keeps a switched-off item in the list, so it can be switched back on', () => {
        const rows = merge(
            [{ id: 'plugin:a:chip', visible: false, order: 0 }],
            [plugin('plugin:a:chip', 1000, 'Towarzysz')],
        );
        expect(rows.map((r) => [r.id, r.visible])).toEqual([['plugin:a:chip', false]]);
    });
});

describe('toConfig', () => {
    const row = (id: string, order: number, visible = true): FooterRow => ({
        id,
        order,
        visible,
        label: id,
        fromPlugin: false,
    });

    test('writes the rows out in order, without the display-only fields', () => {
        const out = toConfig([row('a', 0), row('b', 1)], []);
        expect(out).toEqual([
            { id: 'a', visible: true, order: 0 },
            { id: 'b', visible: true, order: 1 },
        ]);
    });

    test('keeps an entry whose plugin is away, so its place survives a reorder', () => {
        // The bug this is here for: rewriting the config from the visible rows
        // alone would forget a disabled plugin's position the first time
        // anybody dragged a chip.
        const previous: FooterComponentConfig[] = [
            { id: 'a', visible: true, order: 0 },
            { id: 'plugin:away:chip', visible: false, order: 1 },
        ];
        const out = toConfig([row('a', 0)], previous);
        expect(out).toEqual([
            { id: 'a', visible: true, order: 0 },
            { id: 'plugin:away:chip', visible: false, order: 1 },
        ]);
    });

    test('parks the kept entries after the visible ones', () => {
        const previous: FooterComponentConfig[] = [{ id: 'plugin:away:chip', visible: true, order: 0 }];
        const out = toConfig([row('a', 0), row('b', 1)], previous);
        expect(out.map((c) => [c.id, c.order])).toEqual([
            ['a', 0],
            ['b', 1],
            ['plugin:away:chip', 2],
        ]);
    });
});
