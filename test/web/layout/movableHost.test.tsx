import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DEFAULT_SLOT, MovableHost, PANEL_SLOT, useHostHeldAt, useHostSlot } from '@web/layout/movableHost';

// React 19 requires this flag for act() outside a test framework integration.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('MovableHost', () => {
    let home: HTMLElement;
    let panel: HTMLElement;

    beforeEach(() => {
        document.body.innerHTML = '<div id="home"><span id="anchor"></span></div><div id="panel"></div>';
        home = document.getElementById('home')!;
        panel = document.getElementById('panel')!;
    });

    it('creates the element with its id and attributes', () => {
        const host = MovableHost.create('map', { 'data-x': '' });
        expect(host.element.id).toBe('map');
        expect(host.element.hasAttribute('data-x')).toBe(true);
        expect(host.element.isConnected).toBe(false);
    });

    it('sits in the highest-priority slot and goes back when it detaches', () => {
        const host = MovableHost.create('map');
        host.attach(home, DEFAULT_SLOT);
        expect(host.element.parentElement).toBe(home);

        const detach = host.attach(panel, PANEL_SLOT);
        expect(host.element.parentElement).toBe(panel);
        expect(host.ownerPriority()).toBe(PANEL_SLOT);

        detach();
        expect(host.element.parentElement).toBe(home);
        expect(host.ownerPriority()).toBe(DEFAULT_SLOT);
    });

    it('a lower-priority slot attached later does not take it', () => {
        const host = MovableHost.create('map');
        host.attach(panel, PANEL_SLOT);
        host.attach(home, DEFAULT_SLOT);
        expect(host.element.parentElement).toBe(panel);
    });

    it('the latest slot wins a tie', () => {
        const host = MovableHost.create('map');
        host.attach(home, PANEL_SLOT);
        const detach = host.attach(panel, PANEL_SLOT);
        expect(host.element.parentElement).toBe(panel);
        detach();
        expect(host.element.parentElement).toBe(home);
    });

    it('goes before the given node of its slot', () => {
        const host = MovableHost.create('map');
        host.attach(home, DEFAULT_SLOT, document.getElementById('anchor'));
        expect([...home.children].map(c => c.id)).toEqual(['map', 'anchor']);
    });

    it('leaves the page once no slot holds it', () => {
        const host = MovableHost.create('map');
        const detach = host.attach(home);
        detach();
        expect(host.element.isConnected).toBe(false);
        expect(host.ownerPriority()).toBeNull();
    });

    it('adopt keeps an existing element where it is as its default', () => {
        const element = document.getElementById('anchor')!;
        const host = MovableHost.adopt(element);
        const detach = host.attach(panel, PANEL_SLOT);
        expect(element.parentElement).toBe(panel);
        detach();
        expect(element.parentElement).toBe(home);
    });

    it('tells subscribers when the holder changes, not on every attach', () => {
        const host = MovableHost.create('map');
        const listener = vi.fn();
        host.subscribe(listener);
        host.attach(panel, PANEL_SLOT);
        host.attach(home, DEFAULT_SLOT);
        expect(listener).toHaveBeenCalledTimes(1);
    });
});

describe('useHostSlot / useHostHeldAt', () => {
    let container: HTMLElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    afterEach(() => {
        act(() => root.unmount());
        container.remove();
    });

    it('a mounted panel holds the host and the default spot knows it', () => {
        const host = MovableHost.create('map');
        const home = document.createElement('div');
        host.attach(home, DEFAULT_SLOT);

        const Panel = () => {
            const ref = useRef<HTMLDivElement>(null);
            useHostSlot(host, ref, PANEL_SLOT);
            return <div id="panel-slot" ref={ref}><span>chrome</span></div>;
        };
        const DefaultChrome = () => (useHostHeldAt(host, DEFAULT_SLOT) ? <p id="default-chrome" /> : null);

        act(() => root.render(<><DefaultChrome /></>));
        expect(container.querySelector('#default-chrome')).not.toBeNull();

        act(() => root.render(<><DefaultChrome /><Panel /></>));
        const slot = container.querySelector('#panel-slot')!;
        expect(host.element.parentElement).toBe(slot);
        expect(container.querySelector('#default-chrome')).toBeNull();
        // The host is a foreign child after React's own.
        expect(slot.lastElementChild).toBe(host.element);

        act(() => root.render(<><DefaultChrome /></>));
        expect(host.element.parentElement).toBe(home);
        expect(container.querySelector('#default-chrome')).not.toBeNull();
    });
});
