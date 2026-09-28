// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Menu, MenuItem } from '@ui/logViewer/ui/Menu.tsx';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Menu', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        vi.useFakeTimers();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
        vi.useRealTimers();
    });

    function renderOpenMenu(): HTMLElement {
        act(() => {
            root.render(
                <div className="scroller">
                    <Menu trigger={<button type="button">Eksport</button>}>
                        <MenuItem onSelect={() => {}}>Pobierz HTML</MenuItem>
                    </Menu>
                </div>,
            );
        });
        act(() => {
            container.querySelector<HTMLElement>('.lv-menu-anchor')!.click();
        });
        // Dismissal listeners arm on the next tick.
        act(() => {
            vi.runAllTimers();
        });
        return container.querySelector<HTMLElement>('.scroller')!;
    }

    const isOpen = () => container.querySelector('.lv-menu') !== null;

    it('stays open when an unrelated element scrolls', () => {
        renderOpenMenu();
        const gameOutput = document.createElement('div');
        document.body.appendChild(gameOutput);

        act(() => {
            gameOutput.dispatchEvent(new Event('scroll'));
        });

        expect(isOpen()).toBe(true);
        gameOutput.remove();
    });

    it('closes when a container of the trigger scrolls', () => {
        const scroller = renderOpenMenu();

        act(() => {
            scroller.dispatchEvent(new Event('scroll'));
        });

        expect(isOpen()).toBe(false);
    });
});
