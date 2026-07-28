import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { windowManager } from '@web/layout/WindowManager';
import {
  getBuiltInPanelSetting,
  setBuiltInPanelSetting,
  getPopupSetting,
  setPopupSetting,
  getPopupPinnedState,
  shouldPopupAutoOpen,
  getPinnedPopupsByPrefix,
  setDockingSupported,
  loadLayoutState,
  loadPersistedLayoutState,
  saveLayoutState,
  invalidateLayoutCache,
  setLayoutOverrides,
  isLayoutModeForced,
} from '@web/layout/utils/layoutStorage';

describe('built-in panel settings persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    invalidateLayoutCache();
    // Load defaults into the live manager, mirroring app startup.
    windowManager.loadState(loadLayoutState());
  });

  it('persists a built-in setting through a subsequent WindowManager serialize', () => {
    // User toggles the map header label off via the menu.
    setBuiltInPanelSetting('map', 'labelVisible', false);

    // A later, unrelated layout change (drag/resize, or MapPanel updating the
    // title as the player moves) saves the whole layout from the manager.
    saveLayoutState(windowManager.serialize());

    // Reload as if the page was refreshed.
    invalidateLayoutCache();
    expect(getBuiltInPanelSetting('map', 'labelVisible', true)).toBe(false);
  });

  it('preserves a built-in setting when updateBuiltInPanelState patches the title', () => {
    setBuiltInPanelSetting('map', 'labelVisible', false);

    // MapPanel pushes a dynamic title; without the sync this would carry the
    // stale labelVisible back into storage on the next save.
    windowManager.updateBuiltInPanelState('map', { title: 'Mapa: gdzies' });
    saveLayoutState(windowManager.serialize());

    invalidateLayoutCache();
    expect(getBuiltInPanelSetting('map', 'labelVisible', true)).toBe(false);
  });
});

describe('popup settings persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    invalidateLayoutCache();
    windowManager.loadState(loadLayoutState());
  });

  it('survives a subsequent WindowManager serialize (e.g. a title change)', () => {
    // User toggles the chat "Druzyna" filter.
    setPopupSetting('popup:chat', 'showTeamOnly', true);

    // Toggling flips the popup title, which makes useDockablePopup save the
    // whole layout from the live manager. Without syncing the in-memory copy
    // this would write the stale setting back over the toggle.
    saveLayoutState(windowManager.serialize());

    // Reload as if the page was refreshed.
    invalidateLayoutCache();
    expect(getPopupSetting('popup:chat', 'showTeamOnly', false)).toBe(true);
  });
});

describe('docked-but-unpinned popup pin state on reload', () => {
  beforeEach(() => {
    localStorage.clear();
    invalidateLayoutCache();
    windowManager.loadState(loadLayoutState());
  });

  it('reads a docked popup that was unpinned as auto-open but NOT pinned', () => {
    // Simulate the persisted state after: pin popup -> dock it -> unpin it.
    // Unpinning clears persistOpen; docking keeps isDocked true.
    const state = loadLayoutState();
    state.enabled = true;
    state.popupPanels['popup:test'] = { isDocked: true, persistOpen: false };
    saveLayoutState(state);

    // Reload as if the page was refreshed.
    invalidateLayoutCache();

    // Still docked => the popup must reappear on reload...
    expect(shouldPopupAutoOpen('popup:test')).toBe(true);
    // ...but it must NOT come back pinned (the previous bug forced it pinned
    // because the hooks seeded isPinned from shouldPopupAutoOpen).
    expect(getPopupPinnedState('popup:test')).toBe(false);
  });
});

describe('docking capability gating (forge-ui vs stock UI)', () => {
  beforeEach(() => {
    localStorage.clear();
    invalidateLayoutCache();
    windowManager.loadState(loadLayoutState());
  });

  // Global flag defaults to true; restore it so it doesn't bleed across tests.
  afterEach(() => {
    setDockingSupported(true);
  });

  function persist(popupPanels: Record<string, { isDocked: boolean; persistOpen?: boolean }>) {
    const state = loadLayoutState();
    state.enabled = true;
    Object.assign(state.popupPanels, popupPanels);
    saveLayoutState(state);
    invalidateLayoutCache();
  }

  it('does NOT auto-open a docked-only popup when docking is unsupported (forge-ui)', () => {
    persist({ 'popup:docked': { isDocked: true }, 'popup:pinned': { isDocked: false, persistOpen: true } });

    setDockingSupported(false);

    // Docking-only popup stays closed; a pinned popup still auto-opens.
    expect(shouldPopupAutoOpen('popup:docked')).toBe(false);
    expect(shouldPopupAutoOpen('popup:pinned')).toBe(true);
  });

  it('DOES auto-open a docked-only popup when docking is supported (stock UI)', () => {
    persist({ 'popup:docked': { isDocked: true } });

    // Default (true).
    expect(shouldPopupAutoOpen('popup:docked')).toBe(true);
  });

  it('getPinnedPopupsByPrefix excludes docked-only popups when docking is unsupported', () => {
    persist({
      'map:a': { isDocked: true },
      'map:b': { isDocked: false, persistOpen: true },
    });

    setDockingSupported(false);
    expect(getPinnedPopupsByPrefix('map:').sort()).toEqual(['map:b']);

    setDockingSupported(true);
    expect(getPinnedPopupsByPrefix('map:').sort()).toEqual(['map:a', 'map:b']);
  });
});

describe('shell layout overrides (forge-ui forces layout mode locally)', () => {
  beforeEach(() => {
    localStorage.clear();
    setLayoutOverrides({});
    invalidateLayoutCache();
    windowManager.loadState(loadLayoutState());
  });

  // Process-local flag; restore it so it doesn't bleed across tests.
  afterEach(() => {
    setLayoutOverrides({});
    invalidateLayoutCache();
  });

  const forgeOverrides = {
    enabled: true,
    enabledPanels: { objectList: true },
    spanningDocks: 'leftRight',
  } as const;

  it('reports the forced fields to the shell without persisting them', () => {
    // Stock UI state: layout manager off.
    saveLayoutState({ ...loadLayoutState(), enabled: false, spanningDocks: 'topBottom' });
    invalidateLayoutCache();

    setLayoutOverrides(forgeOverrides);

    expect(isLayoutModeForced()).toBe(true);
    expect(loadLayoutState().enabled).toBe(true);
    expect(loadLayoutState().spanningDocks).toBe('leftRight');
    // Nothing was written — the stock UI's own choice is untouched.
    expect(loadPersistedLayoutState().enabled).toBe(false);
    expect(loadPersistedLayoutState().spanningDocks).toBe('topBottom');
  });

  it('keeps the stock choice when the shell saves layout changes', () => {
    saveLayoutState({ ...loadLayoutState(), enabled: false, enabledPanels: { objectList: false } });
    invalidateLayoutCache();

    setLayoutOverrides(forgeOverrides);

    // A normal in-forge layout change (drag/resize) serializes enabled:true.
    windowManager.loadState(loadLayoutState());
    saveLayoutState(windowManager.serialize());
    invalidateLayoutCache();

    const persisted = loadPersistedLayoutState();
    expect(persisted.enabled).toBe(false);
    expect(persisted.enabledPanels.objectList).toBe(false);
    expect(persisted.spanningDocks).toBe('topBottom');
    // ...while forge still sees layout mode on.
    expect(loadLayoutState().enabled).toBe(true);
    expect(loadLayoutState().enabledPanels.objectList).toBe(true);
  });

  it('persists non-overridden fields normally', () => {
    setLayoutOverrides(forgeOverrides);

    saveLayoutState({ ...loadLayoutState(), uiLocked: true });
    invalidateLayoutCache();

    expect(loadPersistedLayoutState().uiLocked).toBe(true);
    expect(loadPersistedLayoutState().enabled).toBe(false);
  });

  it('leaves the stock UI writing enabled through when no overrides are set', () => {
    saveLayoutState({ ...loadLayoutState(), enabled: true });
    invalidateLayoutCache();

    expect(isLayoutModeForced()).toBe(false);
    expect(loadPersistedLayoutState().enabled).toBe(true);
  });
});
