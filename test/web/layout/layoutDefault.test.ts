import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyDefaultLayoutMode } from '@web/layout/utils/layoutDefault';
import {
  invalidateLayoutCache,
  loadPersistedLayoutState,
  saveLayoutState,
} from '@web/layout/utils/layoutStorage';
import { globalStorage } from '@modules/core/storage';

const DISMISSED_KEY = 'layoutManagerSuggestionDismissed';
const APPLIED_KEY = 'layoutManagerDefaultApplied';

/** jsdom reports 1024x768 by default, so the viewport already looks desktop —
 *  isMobileLikeViewport also consults touch heuristics, hence the explicit
 *  width plus the absent touch APIs. */
function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', {
    value: width,
    configurable: true,
    writable: true,
  });
}

describe('applyDefaultLayoutMode', () => {
  beforeEach(() => {
    localStorage.clear();
    invalidateLayoutCache();
    setViewportWidth(1280);
  });

  it('turns the layout manager on for a desktop user who never declined', () => {
    applyDefaultLayoutMode();

    expect(loadPersistedLayoutState().enabled).toBe(true);
    expect(globalStorage.get('uiSettings')?.showButtons).toBe(false);
  });

  it('leaves it off for a user who dismissed the old suggestion', () => {
    localStorage.setItem(DISMISSED_KEY, '1');

    applyDefaultLayoutMode();

    expect(loadPersistedLayoutState().enabled).toBe(false);
  });

  it('does not re-enable it after the user turns it off in settings', () => {
    applyDefaultLayoutMode();
    expect(loadPersistedLayoutState().enabled).toBe(true);

    // User unticks "Wlacz menedzer okien".
    saveLayoutState({ ...loadPersistedLayoutState(), enabled: false });
    invalidateLayoutCache();

    applyDefaultLayoutMode();

    expect(loadPersistedLayoutState().enabled).toBe(false);
  });

  it('skips mobile-like viewports, and still applies later on a big screen', () => {
    setViewportWidth(480);

    applyDefaultLayoutMode();
    expect(loadPersistedLayoutState().enabled).toBe(false);
    expect(localStorage.getItem(APPLIED_KEY)).toBeNull();

    setViewportWidth(1280);
    applyDefaultLayoutMode();
    expect(loadPersistedLayoutState().enabled).toBe(true);
  });

  it('keeps other uiSettings fields when clearing showButtons', () => {
    globalStorage.set('uiSettings', { fontSize: 17 } as never);

    applyDefaultLayoutMode();

    const ui = globalStorage.get('uiSettings');
    expect(ui?.showButtons).toBe(false);
    expect(ui?.fontSize).toBe(17);
  });

  it('survives a storage failure without throwing', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => applyDefaultLayoutMode()).not.toThrow();

    spy.mockRestore();
    err.mockRestore();
  });
});
