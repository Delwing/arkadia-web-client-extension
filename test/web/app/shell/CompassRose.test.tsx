import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import eventBus from '@modules/core/eventBus';
import { CompassRose } from '@web/app/shell/CompassRose';
import { AppProviders } from '@web/app/AppProviders';
import type { AppServices } from '@web/app/appServices';
import type { CompassRoseBox } from '@shared/events/clientEvents';

// React 19 requires this flag for act() outside a test framework integration.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const box = (patch: Partial<CompassRoseBox>): CompassRoseBox => ({
    view: 'grid', exits: [], backDirs: [], specialExits: [], backSpecialExits: [], ...patch,
});

/** The drawing as text, from the template the client script used to fill in itself. */
function asciiText(exits: string[]): string {
    const has = (dir: string) => exits.includes(dir);
    const o = (dir: string) => has(dir) ? 'O' : ' ';
    const c = (dir: string, ch: string) => has(dir) ? ch : ' '.repeat(ch.length);
    const udPivot = (has('u') || has('d')) ? 'O' : ' ';
    return [
        `${o('nw')} ${o('n')} ${o('ne')}   ${o('u')}`,
        ` ${c('nw', '\\')}${c('n', '|')}${c('ne', '/')}    ${c('u', '|')}`,
        `${o('w')}${c('w', '-')}O${c('e', '-')}${o('e')}   ${udPivot}`,
        ` ${c('sw', '/')}${c('s', '|')}${c('se', '\\')}    ${c('d', '|')}`,
        `${o('sw')} ${o('s')} ${o('se')}   ${o('d')}`,
    ].join('\n');
}

describe('CompassRose', () => {
    let container: HTMLElement;
    let root: Root;
    const client = { sendCommand: vi.fn() };

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
        client.sendCommand.mockClear();
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    const render = () => act(() => root.render(
        <AppProviders services={{ client } as unknown as AppServices}><CompassRose /></AppProviders>,
    ));
    const send = (next: CompassRoseBox) => act(() => { eventBus.emit('compassRose.box', next); });
    const el = () => document.getElementById('compass-rose-box')!;

    it('asks for the current box when it mounts, and is hidden until told otherwise', () => {
        const asked = vi.fn();
        const off = eventBus.on('requestCompassRose', asked);
        render();
        expect(asked).toHaveBeenCalledTimes(1);
        expect(el().style.display).toBe('none');
        off();
    });

    it('draws the grid: open exits active and clickable, the way back marked, special exits on top', () => {
        render();
        send(box({ exits: ['n', 'u'], backDirs: ['n'], specialExits: ['w bramie'], backSpecialExits: [] }));
        expect(el().style.display).toBe('flex');
        expect(el().querySelector('[data-dir="n"]')!.className).toBe('cr-dir active cr-clickable cr-back');
        expect(el().querySelector('[data-dir="u"]')!.className).toBe('cr-dir cr-ud active cr-clickable');
        expect(el().querySelector('[data-dir="s"]')!.className).toBe('cr-dir');
        expect(el().querySelector('.cr-special')!.textContent).toBe('W BRAMIE');
        expect(el().querySelector('.compass-rose-ascii')).toBeNull();
    });

    it('walks an exit on click, but not a closed one', () => {
        render();
        send(box({ exits: ['n'], specialExits: ['w bramie'] }));
        act(() => (el().querySelector('[data-dir="n"]') as HTMLElement).click());
        act(() => (el().querySelector('[data-dir="s"]') as HTMLElement).click());
        act(() => (el().querySelector('[data-exit="w bramie"]') as HTMLElement).click());
        expect(client.sendCommand.mock.calls).toEqual([['n'], ['w bramie']]);
    });

    it('draws the ASCII rose in place of the grid', () => {
        render();
        send(box({ view: 'ascii', exits: ['n', 'e', 'd'] }));
        expect((el().querySelector('.compass-rose-grid') as HTMLElement).style.display).toBe('none');
        expect(el().querySelector('.compass-rose-ascii')!.textContent).toBe(asciiText(['n', 'e', 'd']));
    });
});
