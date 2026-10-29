import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@web-ui/components/map/LocationLabel', () => ({ LocationLabel: () => null }));
vi.mock('@web-ui/components/map/MapLostBadge', () => ({ MapLostBadge: () => null }));

import { MapPane } from '@web/app/shell/MapPane';
import { mapHost } from '@web/app/shell/mapHosts';
import { PANEL_SLOT } from '@web/layout/movableHost';
import type { MapLoadProgress } from '@web/map/mapBootstrap';

// React 19 requires this flag for act() outside a test framework integration.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeMapLoad(initial: MapLoadProgress) {
    let progress = initial;
    const listeners = new Set<(p: MapLoadProgress) => void>();
    return {
        getProgress: () => progress,
        subscribeProgress: (fn: (p: MapLoadProgress) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
        ready: new Promise<void>(() => undefined),
        set(next: MapLoadProgress) { progress = next; listeners.forEach(fn => fn(next)); },
    };
}

describe('MapPane', () => {
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

    it('holds the map and its chrome until a panel takes the map over', () => {
        const mapLoad = makeMapLoad({ visible: false, percent: 0 });
        act(() => root.render(<MapPane mapLoad={mapLoad} />));
        const pane = document.getElementById('iframe-container')!;
        expect(mapHost.element.parentElement).toBe(pane);
        expect(pane.querySelector('#location-wrapper')).not.toBeNull();

        const panel = document.createElement('div');
        let detach!: () => void;
        act(() => { detach = mapHost.attach(panel, PANEL_SLOT); });
        expect(mapHost.element.parentElement).toBe(panel);
        expect(pane.querySelector('#location-wrapper')).toBeNull();

        act(() => detach());
        expect(mapHost.element.parentElement).toBe(pane);
        expect(pane.querySelector('#location-wrapper')).not.toBeNull();
    });

    it('shows the download, then hides the bar', () => {
        const mapLoad = makeMapLoad({ visible: true, percent: 42.7 });
        act(() => root.render(<MapPane mapLoad={mapLoad} />));
        const bar = () => document.getElementById('map-progress-bar')!;
        const box = () => document.getElementById('map-progress-container')!;
        expect(box().style.display).toBe('block');
        expect(bar().style.width).toBe('42.7%');
        expect(bar().textContent).toBe('42%');

        act(() => mapLoad.set({ visible: true, percent: null, loadedBytes: 4096 }));
        expect(bar().style.width).toBe('100%');
        expect(bar().textContent).toBe('4 KB');

        act(() => mapLoad.set({ visible: false, percent: 100 }));
        expect(box().style.display).toBe('none');
    });
});
