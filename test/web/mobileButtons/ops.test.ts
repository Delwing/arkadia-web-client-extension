import { describe, expect, it } from 'vitest';
import { modesFromLayouts } from '@web/mobileButtons/migrateV1.ts';
import {
    addLine,
    addStyle,
    assignStyle,
    clearSlots,
    deleteStyle,
    newButtonIds,
    newStyleForButton,
    overrideButtons,
    placeHidden,
    removeLine,
    restoreBackground,
    restoreButton,
    restoreButtons,
    setBackground,
    setButton,
    setOwnLayout,
    swapSlots,
} from '@web/mobileButtons/ops.ts';
import { hiddenIds, isOwnButton, ownCount, resolveButton, resolveLayout, resolveMode, selectableIds, styleUsage } from '@web/mobileButtons/resolve.ts';
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

    it('assigns a style to several buttons, forking only the inherited ones', () => {
        const data = setButton(stock(), 'team', 'n-button', { label: 'N' }).data;
        const target = data.styleOrder[0];

        const result = assignStyle(data, 'team', ['n-button', 's-button', 'button-1'], target);

        expect(result.changed).toBe(2);
        expect(result.forked).toBe(1);
        expect(result.data.modes.team.buttons['n-button']).toMatchObject({ label: 'N', style: target });
        expect(result.data.modes.team.buttons['s-button'].style).toBe(target);
        expect(result.data.modes.team.buttons['button-1']).toBeUndefined();
        expect(result.data.modes.solo.buttons['s-button'].style).not.toBe(target);
    });

    it('leaves the data alone when no button changes style', () => {
        const data = stock();
        const own = data.modes.solo.buttons['button-1'].style!;
        const result = assignStyle(data, 'solo', ['button-1'], own);
        expect(result).toEqual({ data, changed: 0, forked: 0 });
        expect(assignStyle(data, 'solo', ['button-1'], 'missing').changed).toBe(0);
    });

    it('overrides and restores several buttons at once', () => {
        const data = stock();

        const overridden = overrideButtons(data, 'leader', ['n-button', 's-button']);
        expect(overridden.forked).toBe(2);
        expect(ownCount(overridden.data, 'leader')).toBe(2);
        expect(overrideButtons(overridden.data, 'leader', ['n-button']).forked).toBe(0);
        expect(overrideButtons(data, 'solo', ['n-button']).data).toBe(data);

        const restored = restoreButtons(overridden.data, 'leader', ['n-button', 's-button', 'e-button']);
        expect(restored.restored).toBe(2);
        expect(restored.data.modes.leader.buttons).toEqual({});
    });

    it('clears slots as empty overrides in the mode', () => {
        const data = clearSlots(stock(), 'team', ['button-1', 'button-2']);
        expect(data.modes.team.buttons['button-1']).toEqual({ macroType: 'empty', label: '' });
        expect(resolveMode(data, 'leader').buttons['button-2'].macroType).toBe('empty');
        expect(resolveMode(data, 'solo').buttons['button-2'].macroType).not.toBe('empty');
        expect(selectableIds(data, 'team')).not.toContain('button-1');
    });

    it('adds a fresh style or a copy at the end of the palette', () => {
        const data = stock();
        const fresh = addStyle(data);
        expect(fresh.data.styleOrder.at(-1)).toBe(fresh.styleId);
        expect(fresh.data.styles[fresh.styleId].name).toBe(`Styl ${data.styleOrder.length + 1}`);

        const source = data.styleOrder[0];
        const copy = addStyle(fresh.data, source);
        expect(copy.styleId).not.toBe(fresh.styleId);
        expect(copy.data.styles[copy.styleId]).toEqual({ ...data.styles[source], name: `${data.styles[source].name} (kopia)` });
        expect(addStyle(copy.data, source).data.styles[`style-${Number(copy.styleId.slice(6)) + 1}`].name).toBe(`${data.styles[source].name} (kopia 2)`);
    });

    it('moves the buttons of a deleted style to the first remaining one, in every mode', () => {
        const [first, second] = stock().styleOrder;
        const data = assignStyle(stock(), 'team', ['button-1'], second).data;

        const next = deleteStyle(data, second);

        expect(next.styleOrder).not.toContain(second);
        expect(next.styles[second]).toBeUndefined();
        expect(next.modes.team.buttons['button-1'].style).toBe(first);
        expect(next.modes.solo.buttons['n-button'].style).toBe(first);
    });

    it('never deletes the last style', () => {
        let data = stock();
        while (data.styleOrder.length > 1) data = deleteStyle(data, data.styleOrder[0]);
        expect(deleteStyle(data, data.styleOrder[0])).toBe(data);
    });

    it('makes new button ids unique across all modes', () => {
        const data = addLine(stock(), 'leader', 'bottom').data;
        const [next] = newButtonIds(data, 1);
        const used = new Set(Object.values(data.modes).flatMap(m => [...Object.keys(m.buttons), ...(m.layout?.order ?? [])]));
        expect(used.has(next)).toBe(false);
    });
});
