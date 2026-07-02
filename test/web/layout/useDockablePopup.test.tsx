import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LayoutProvider } from '@web/layout/LayoutContext';
import { useDockablePopup } from '@web/layout/hooks/useDockablePopup';
import { windowManager } from '@web/layout/WindowManager';

const POPUP_ID = 'popup:knowledgeDetails';

/**
 * Minimal host that registers a dockable popup whose title can change between
 * renders — mirroring the knowledge report window, which embeds live progress
 * ("Raport wiedzy X/Y") in its title.
 */
function Host({ title }: { title: string }) {
  useDockablePopup({
    popupId: POPUP_ID,
    popupType: 'knowledgeDetails',
    title,
    isOpen: true,
    isPinned: true,
    isLocked: false,
    onClose: () => {},
    onPinnedChange: () => {},
    onLockedChange: () => {},
    onReset: () => {},
    minWidth: 100,
    minHeight: 100,
    initialWidth: 300,
    initialHeight: 200,
    renderContent: () => null,
    headerActions: null,
  });
  return null;
}

describe('useDockablePopup — popped-out state survives title changes', () => {
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
    windowManager.close(POPUP_ID);
  });

  it('keeps poppedOut true when the title changes (regression)', () => {
    act(() => {
      root.render(
        <LayoutProvider>
          <Host title="Raport wiedzy 1/5 (20%)" />
        </LayoutProvider>,
      );
    });

    // The popup registered a live window in the manager.
    expect(windowManager.get(POPUP_ID)).toBeTruthy();

    // Simulate the user popping the window out into its own browser window.
    act(() => {
      windowManager.setPoppedOut(POPUP_ID, true);
    });
    expect(windowManager.get(POPUP_ID)?.poppedOut).toBe(true);

    // Learning a new entry / rebuilding the report changes the title. This must
    // NOT tear down and recreate the window record — doing so drops the
    // live-only poppedOut flag and snaps the popup back into the main window.
    act(() => {
      root.render(
        <LayoutProvider>
          <Host title="Raport wiedzy 2/5 (40%)" />
        </LayoutProvider>,
      );
    });

    expect(
      windowManager.get(POPUP_ID)?.poppedOut,
      'window should stay popped out after a title change',
    ).toBe(true);
    expect(
      windowManager.get(POPUP_ID)?.title,
      'window title should still update to the new progress',
    ).toBe('Raport wiedzy 2/5 (40%)');
  });
});
