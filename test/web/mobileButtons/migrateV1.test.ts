import { describe, expect, it } from 'vitest';
import { canonical, modesFromLayouts } from '@web/mobileButtons/migrateV1.ts';
import { resolveMode } from '@web/mobileButtons/resolve.ts';
import { BUTTON_MODES, DEFAULT_ACTIVE_COLOR, type ButtonMode } from '@web/mobileButtons/model.ts';
import { createDefaultLayout, type LayoutSettings } from '@web/mobileButtonSettings.ts';
import type { MobileButtonSetting } from '@web/buttonSettings.ts';

function layouts(solo: LayoutSettings, team = clone(solo), leader = clone(team)): Record<ButtonMode, LayoutSettings> {
    return { solo, team, leader };
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

function withButton(layout: LayoutSettings, id: string, patch: Partial<MobileButtonSetting>): LayoutSettings {
    const next = clone(layout);
    next.buttons[id] = { ...next.buttons[id], ...patch } as MobileButtonSetting;
    return next;
}

const lower = (value?: string) => (value || '').toLowerCase().replace(/\s+/g, '');

/** What a v1 placed button looked like and did, colours as rendered. */
function shown(layout: LayoutSettings, id: string) {
    const { color, fontColor, activeColor, syncWithDirections, ...rest } = layout.buttons[id];
    let shownColor = color;
    let shownActive = activeColor;
    if (rest.macroType === 'specialExit' && syncWithDirections) {
        const dir = Object.values(layout.buttons).find(b => b.macroType === 'kierunek');
        if (dir) {
            shownColor = dir.color;
            shownActive = dir.activeColor;
        }
    }
    if (rest.macroType === 'empty') return canonical(rest);
    const isDirection = rest.macroType === 'kierunek' || rest.macroType === 'specialExit';
    return canonical({
        ...rest,
        color: lower(shownColor),
        fontColor: lower(fontColor || '#f1f5f9'),
        activeColor: isDirection ? lower(shownActive || DEFAULT_ACTIVE_COLOR) : undefined,
    });
}

function expectLossless(input: Record<ButtonMode, LayoutSettings>) {
    const data = modesFromLayouts(input);
    for (const mode of BUTTON_MODES) {
        const resolved = resolveMode(data, mode);
        const v1 = input[mode];
        expect(resolved.order).toEqual(v1.order);
        expect(resolved.cols).toBe(v1.cols);
        expect(resolved.background).toBe(v1.background);
        for (const id of v1.order) {
            const got = shown({ ...resolved, buttons: { ...resolved.buttons } }, id);
            expect(got, `${mode}/${id}`).toBe(shown(v1, id));
        }
    }
    return data;
}

describe('modesFromLayouts', () => {
    it('turns the stock layout into two styles and empty team/leader modes', () => {
        const data = expectLossless(layouts(createDefaultLayout()));

        expect(data.styleOrder.map(id => data.styles[id].name)).toEqual(['Podstawowy', 'Kierunki']);
        expect(data.modes.team).toEqual({ buttons: {} });
        expect(data.modes.leader).toEqual({ buttons: {} });
        expect(data.modes.solo.buttons['n-button']).not.toHaveProperty('color');
        expect(data.modes.solo.buttons['n-button'].style).toBe(data.styleOrder[1]);
    });

    it('stores one changed team button as the only override', () => {
        const solo = createDefaultLayout();
        const team = withButton(solo, 'button-2', { macroType: 'attackEnemy', label: 'atak 1' });

        const data = expectLossless(layouts(solo, team));

        expect(Object.keys(data.modes.team.buttons)).toEqual(['button-2']);
        expect(data.modes.team.layout).toBeUndefined();
        expect(data.modes.leader.buttons).toEqual({});
    });

    it('stores a change shared by team and leader once, in team', () => {
        const solo = createDefaultLayout();
        const team = withButton(solo, 'go-button', { label: '/prze', macroType: 'przeList' });

        const data = expectLossless(layouts(solo, team, clone(team)));

        expect(Object.keys(data.modes.team.buttons)).toEqual(['go-button']);
        expect(data.modes.leader.buttons).toEqual({});
    });

    it('gives a mode its own layout and background only when they differ', () => {
        const solo = createDefaultLayout();
        const leader = clone(solo);
        leader.cols = 5;
        leader.order = [...solo.order, 'button-9', 'button-10', 'button-11', 'button-12', 'button-13'];
        leader.background = 'rgba(0, 0, 0, 0.5)';
        for (const id of leader.order.slice(solo.order.length)) {
            leader.buttons[id] = { macroType: 'empty', label: '', color: 'transparent' };
        }

        const data = expectLossless(layouts(solo, clone(solo), leader));

        expect(data.modes.team.layout).toBeUndefined();
        expect(data.modes.team.background).toBeUndefined();
        expect(data.modes.leader.layout).toEqual({ cols: 5, order: leader.order });
        expect(data.modes.leader.background).toBe('rgba(0, 0, 0, 0.5)');
        expect(Object.keys(data.modes.leader.buttons)).toEqual(['button-9', 'button-10', 'button-11', 'button-12', 'button-13']);
    });

    it('splits a colour group whose direction buttons disagree on the active colour', () => {
        const solo = withButton(createDefaultLayout(), 'n-button', { activeColor: '#ff0000' });

        const data = expectLossless(layouts(solo));

        expect(data.modes.solo.buttons['n-button'].style).not.toBe(data.modes.solo.buttons['s-button'].style);
        expect(data.styles[data.modes.solo.buttons['n-button'].style!].activeColor).toBe('#ff0000');
    });

    it('bakes the synced direction colours into a special exit', () => {
        let solo = createDefaultLayout();
        for (const id of solo.order) {
            if (solo.buttons[id].macroType === 'kierunek') solo = withButton(solo, id, { color: '#123456', activeColor: '#abcdef' });
        }
        solo = withButton(solo, 'special-exit-button', { syncWithDirections: true, color: '#999999' });

        const data = expectLossless(layouts(solo));

        expect(data.modes.solo.buttons['special-exit-button'].style).toBe(data.modes.solo.buttons['n-button'].style);
        expect(data.modes.solo.buttons['special-exit-button']).not.toHaveProperty('syncWithDirections');
    });

    it('names styles and keeps the names unique', () => {
        const solo = withButton(withButton(createDefaultLayout(), 'button-1', { color: '#a8463e' }), 'button-2', { color: '#4b7f52' });

        const data = expectLossless(layouts(solo));

        expect(data.styleOrder.map(id => data.styles[id].name)).toEqual(['Podstawowy', 'Styl 1', 'Styl 2', 'Kierunki']);
    });

    it('drops buttons no layout placed', () => {
        const solo = createDefaultLayout();
        solo.order = solo.order.filter(id => id !== 'button-3');

        const data = modesFromLayouts(layouts(solo));

        expect(data.modes.solo.buttons).not.toHaveProperty('button-3');
    });

    it('reuses existing styles where the colours match and drops unused ones', () => {
        const first = modesFromLayouts(layouts(createDefaultLayout()));
        const renamed = clone(first);
        renamed.styles[renamed.styleOrder[1]].name = 'Moje kierunki';
        renamed.styles['style-9'] = { name: 'Nieużywany', color: '#000000', fontColor: '#ffffff', activeColor: '#2fa7c5' };
        renamed.styleOrder.push('style-9');

        const again = modesFromLayouts(layouts(createDefaultLayout()), renamed);

        expect(again.styleOrder).toEqual(first.styleOrder);
        expect(again.styles[again.styleOrder[1]].name).toBe('Moje kierunki');
        expect(again.styles).not.toHaveProperty('style-9');
    });

    it('treats a placed id without a button as an empty slot', () => {
        const solo = createDefaultLayout();
        solo.order = [...solo.order.slice(0, 19), 'ghost'];

        const data = modesFromLayouts(layouts(solo));

        expect(data.modes.solo.buttons.ghost.macroType).toBe('empty');
        expect(resolveMode(data, 'solo').buttons.ghost.macroType).toBe('empty');
    });
});
