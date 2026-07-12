// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { usePopup } from '@web/hooks/usePopup';
import {
    loadLayoutState,
    saveLayoutState,
    invalidateLayoutCache,
} from '@web/layout/utils/layoutStorage';

// React 19 requires this flag for act() outside a test framework integration.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('usePopup pin/dock seeding on reload', () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        localStorage.clear();
        invalidateLayoutCache();
        container = document.createElement('div');
        document.body.appendChild(container);
        root = createRoot(container);
    });

    function renderPopup(popupId: string): { isOpen: boolean; isPinned: boolean } {
        const result = { isOpen: false, isPinned: false };
        function Probe() {
            const { isOpen, isPinned } = usePopup(popupId);
            result.isOpen = isOpen;
            result.isPinned = isPinned;
            return null;
        }
        act(() => {
            root.render(<Probe />);
        });
        return result;
    }

    it('seeds a docked-but-unpinned popup as open but NOT pinned', () => {
        // Persisted state after: pin popup -> dock it -> unpin it. Unpinning
        // clears persistOpen; the popup stays docked (isDocked true).
        const state = loadLayoutState();
        state.enabled = true;
        state.popupPanels['popup:test'] = { isDocked: true, persistOpen: false };
        saveLayoutState(state);
        invalidateLayoutCache();

        const { isOpen, isPinned } = renderPopup('popup:test');

        // Still docked => reopens on reload...
        expect(isOpen).toBe(true);
        // ...but must NOT resurrect the pinned status the user cleared.
        expect(isPinned).toBe(false);

        act(() => root.unmount());
    });

    it('seeds a pinned popup as open and pinned', () => {
        const state = loadLayoutState();
        state.enabled = true;
        state.popupPanels['popup:test'] = { isDocked: false, persistOpen: true };
        saveLayoutState(state);
        invalidateLayoutCache();

        const { isOpen, isPinned } = renderPopup('popup:test');

        expect(isOpen).toBe(true);
        expect(isPinned).toBe(true);

        act(() => root.unmount());
    });
});
