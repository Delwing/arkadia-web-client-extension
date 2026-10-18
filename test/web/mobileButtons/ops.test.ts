import { describe, expect, it } from 'vitest';
import { modesFromLayouts } from '@web/mobileButtons/migrateV1.ts';
import {
    addLine,
    newButtonIds,
    newStyleForButton,
    placeHidden,
    removeLine,
    restoreBackground,
    restoreButton,
    setBackground,
    setButton,
    setOwnLayout,
    swapSlots,
} from '@web/mobileButtons/ops.ts';
import { hiddenIds, isOwnButton, ownCount, resolveButton, resolveLayout, resolveMode, styleUsage } from '@web/mobileButtons/resolve.ts';
import { createDefaultLayout } from '@web/mobileButtonSettings.ts';

function stock() {
    const layout = createDefaultLayout();
    return modesFromLayouts({ solo: layout, team: layout, leader: layout });
}

describe('mobile button ops', () => {
    it('forks an inherited button on edit and leaves the parent alone', () => {
        const data = stock();

        const { data: next, forked } = setButton(data, 'team', 'button-2', { label: 'atak' });

        expect(forked).toBe(true);
        expect(next.modes.team.buttons['button-2'].label).toBe('atak');
        expect(next.modes.solo.buttons['button-2'].label).toBe('/z cel');
        expect(resolveMode(next, 'leader').buttons['button-2'].label).toBe('atak');
        expect(isOwnButton(next, 'team', 'button-2')).toBe(true);
        expect(ownCount(next, 'team')).toBe(1);
        expect(data.modes.team.buttons).toEqual({});
    });

    it('does not report a fork when editing solo or an existing override', () => {
        const data = stock();
        expect(setButton(data, 'solo', 'button-2', { label: 'x' }).forked).toBe(false);
        const once = setButton(data, 'team', 'button-2', { label: 'x' }).data;
        expect(setButton(once, 'team', 'button-2', { label: 'y' }).forked).toBe(false);
    });

    it('restores an override, and never removes a solo button', () => {
        const edited = setButton(stock(), 'team', 'button-2', { label: 'atak' }).data;

        expect(restoreButton(edited, 'team', 'button-2').modes.team.buttons).toEqual({});
        expect(restoreButton(edited, 'solo', 'button-2')).toBe(edited);
    });

    it('clears a slot to empty and gives a filled slot a label and style', () => {
        const data = stock();
        const cleared = setButton(data, 'solo', 'button-1', { macroType: 'empty' }).data;
        expect(cleared.modes.solo.buttons['button-1']).toEqual({ macroType: 'empty', label: '' });

        const filled = setButton(cleared, 'solo', 'button-1', { macroType: 'kierunek' }).data.modes.solo.buttons['button-1'];
        expect(filled.label).toBe('↑');
        expect(filled.style).toBe(data.modes.solo.buttons['n-button'].style);
    });

    it('forks the layout on the first layout edit and swaps by index', () => {
        const { data, forked } = swapSlots(stock(), 'leader', 0, 1);

        expect(forked).toBe(true);
        expect(data.modes.leader.layout!.order.slice(0, 2)).toEqual(['zas-list-toggle', 'z-list-toggle']);
        expect(resolveLayout(data, 'team').source).toBe('solo');
    });

    it('adds and removes lines on every edge', () => {
        let data = stock();
        data = addLine(data, 'solo', 'left').data;
        expect(data.modes.solo.layout!.cols).toBe(5);
        const added = data.modes.solo.layout!.order[0];
        expect(data.modes.solo.buttons[added].macroType).toBe('empty');

        data = addLine(data, 'solo', 'top').data;
        expect(data.modes.solo.layout!.order).toHaveLength(30);

        data = removeLine(data, 'solo', 'top').data;
        data = removeLine(data, 'solo', 'left').data;
        expect(data.modes.solo.layout).toEqual(stock().modes.solo.layout);
        expect(data.modes.solo.buttons).not.toHaveProperty(added);
    });

    it('never goes below one row or column', () => {
        let data = stock();
        for (let i = 0; i < 10; i++) data = removeLine(data, 'solo', 'right').data;
        for (let i = 0; i < 10; i++) data = removeLine(data, 'solo', 'bottom').data;
        expect(data.modes.solo.layout).toEqual({ cols: 1, order: ['z-list-toggle'] });
    });

    it('keeps buttons a removed line held, as hidden, and places them back', () => {
        let data = removeLine(stock(), 'team', 'bottom').data;
        expect(hiddenIds(data, 'team')).toEqual(['sw-button', 's-button', 'se-button', 'special-exit-button']);

        // No empty slot in the stock layout: a new row, the rest of it empty.
        data = placeHidden(data, 'team', 's-button').data;
        const lastRow = data.modes.team.layout!.order.slice(-4);
        expect(lastRow[0]).toBe('s-button');
        expect(lastRow.slice(1).map(id => data.modes.team.buttons[id].macroType)).toEqual(['empty', 'empty', 'empty']);
        expect(resolveButton(data, 'team', 's-button')!.source).toBe('solo');
    });

    it('puts a hidden button into the first empty slot when there is one', () => {
        let data = setButton(stock(), 'team', 'go-button', { macroType: 'empty' }).data;
        data = removeLine(data, 'team', 'bottom').data;

        data = placeHidden(data, 'team', 'se-button').data;

        expect(data.modes.team.layout!.order[2]).toBe('se-button');
        expect(data.modes.team.layout!.order).toHaveLength(16);
    });

    it('drops an own layout back to the inherited one', () => {
        const own = setOwnLayout(stock(), 'team', true);
        expect(own.modes.team.layout).toBeDefined();
        expect(setOwnLayout(own, 'team', false).modes.team.layout).toBeUndefined();
        expect(setOwnLayout(stock(), 'solo', false)).toEqual(stock());
    });

    it('inherits the background until a mode sets its own', () => {
        const { data, forked } = setBackground(stock(), 'leader', 'rgba(0, 0, 0, 0.5)');

        expect(forked).toBe(true);
        expect(resolveMode(data, 'leader').background).toBe('rgba(0, 0, 0, 0.5)');
        expect(resolveMode(data, 'team').background).toBe(stock().modes.solo.background);
        expect(restoreBackground(data, 'leader').modes.leader.background).toBeUndefined();
    });

    it('gives one button a copy of its style', () => {
        const data = stock();
        const before = data.modes.solo.buttons['button-1'].style!;

        const result = newStyleForButton(data, 'team', 'button-1');

        expect(result.forked).toBe(true);
        expect(result.data.modes.team.buttons['button-1'].style).toBe(result.styleId);
        expect(result.data.styles[result.styleId]).toMatchObject({ name: 'Styl: wesprzyj', color: data.styles[before].color });
        expect(styleUsage(result.data, 'team', result.styleId)).toBe(1);
        expect(styleUsage(result.data, 'solo', result.styleId)).toBe(0);
    });

    it('makes new button ids unique across all modes', () => {
        const data = addLine(stock(), 'leader', 'bottom').data;
        const [next] = newButtonIds(data, 1);
        const used = new Set(Object.values(data.modes).flatMap(m => [...Object.keys(m.buttons), ...(m.layout?.order ?? [])]));
        expect(used.has(next)).toBe(false);
    });
});
