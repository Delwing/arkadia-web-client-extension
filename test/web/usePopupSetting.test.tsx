// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import eventBus from '@modules/core/eventBus';
import { usePopupSetting } from '@web/hooks/usePopupSetting';
import {
    getPopupSetting,
    setPopupSetting,
    resetLayoutCache,
    invalidateLayoutCache,
} from '@web/layout/utils/layoutStorage';

// React 19 requires this flag for act() outside a test framework integration.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('popup setting storage freshness', () => {
    beforeEach(() => {
        localStorage.clear();
        invalidateLayoutCache();
    });

    it('returns the fresh value after an external layout replacement + cache reset', () => {
        setPopupSetting('popup:chat', 'showTeamOnly', false);
        expect(getPopupSetting('popup:chat', 'showTeamOnly', false)).toBe(false);

        // Simulate a device-sync import replacing layoutManagerState wholesale.
        const imported = JSON.parse(localStorage.getItem('layoutManagerState')!);
        imported.popupPanels['popup:chat'].settings.showTeamOnly = true;
        localStorage.setItem('layoutManagerState', JSON.stringify(imported));

        // Without resetting the cache the stale value could linger (100ms TTL);
        // resetLayoutCache forces a fresh read, which is what the hook does.
        resetLayoutCache();
        expect(getPopupSetting('popup:chat', 'showTeamOnly', false)).toBe(true);
    });
});

describe('usePopupSetting re-hydration', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        localStorage.clear();
        invalidateLayoutCache();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    function renderProbe(onValue: (v: boolean) => void) {
        function Probe() {
            const [value] = usePopupSetting('popup:chat', 'showTeamOnly', false);
            onValue(value);
            return null;
        }
        act(() => {
            root.render(<Probe />);
        });
    }

    it('picks up an imported popup setting on layoutManagerStateChanged without a remount', () => {
        const seen: boolean[] = [];
        renderProbe(v => seen.push(v));
        expect(seen.at(-1)).toBe(false);

        // External writer (import) replaces the layout, then emits the event.
        const imported = {
            version: 8,
            windows: {},
            popupPanels: { 'popup:chat': { isDocked: false, settings: { showTeamOnly: true } } },
            enabledPanels: {},
        };
        localStorage.setItem('layoutManagerState', JSON.stringify(imported));

        act(() => {
            eventBus.emit('layoutManagerStateChanged', { type: 'import' });
        });

        expect(seen.at(-1)).toBe(true);

        act(() => root.unmount());
    });

    it('stops reacting after unmount (listener cleaned up)', () => {
        const seen: boolean[] = [];
        renderProbe(v => seen.push(v));
        act(() => root.unmount());
        const countAfterUnmount = seen.length;

        act(() => {
            eventBus.emit('layoutManagerStateChanged', { type: 'import' });
        });

        // No further renders after unmount.
        expect(seen.length).toBe(countAfterUnmount);
    });
});
