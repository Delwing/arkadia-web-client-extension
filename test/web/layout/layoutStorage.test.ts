import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { windowManager } from '@web/layout/WindowManager';
import {
  getBuiltInPanelSetting,
  setBuiltInPanelSetting,
  getPopupSetting,
  setPopupSetting,
  getPopupPinnedState,
  shouldPopupAutoOpen,
  getPinnedPopupsByPrefix,
  loadLayoutState,
  loadPersistedLayoutState,
  saveLayoutState,
  saveLayoutStateDebounced,
  invalidateLayoutCache,
  subscribeToPanelSetting,
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

describe('a debounced save already in flight when a setting is toggled', () => {
  beforeEach(() => {
    localStorage.clear();
    invalidateLayoutCache();
    windowManager.loadState(loadLayoutState());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // The layout settles shortly after boot and queues a debounced save. The user
  // toggles a panel setting before that timer fires. The toggle writes straight
  // to storage and patches the live manager, but deliberately does not notify(),
  // so the queued timer is neither cancelled nor rescheduled -- it still fires,
  // and whatever it writes is what survives a reload.
  it('does not let the queued save erase a built-in setting toggled meanwhile', () => {
    saveLayoutStateDebounced(() => windowManager.serialize());

    vi.advanceTimersByTime(150);
    setBuiltInPanelSetting('objectList', 'showCoverTimer', true);

    vi.advanceTimersByTime(300);

    invalidateLayoutCache();
    expect(getBuiltInPanelSetting('objectList', 'showCoverTimer', false)).toBe(true);
  });

  it('does not let the queued save erase a popup setting toggled meanwhile', () => {
    saveLayoutStateDebounced(() => windowManager.serialize());

    vi.advanceTimersByTime(150);
    setPopupSetting('popup:chat', 'showTeamOnly', true);

    vi.advanceTimersByTime(300);

    invalidateLayoutCache();
    expect(getPopupSetting('popup:chat', 'showTeamOnly', false)).toBe(true);
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

describe('settings changed in another tab', () => {
  beforeEach(() => {
    localStorage.clear();
    invalidateLayoutCache();
    windowManager.loadState(loadLayoutState());
  });

  // What another tab writes: its whole layout, with its own copy of the settings.
  const otherTabSaves = (popupSettings: Record<string, unknown>) => {
    const state = loadPersistedLayoutState();
    state.popupPanels['popup:notes'] = { isDocked: true, settings: popupSettings };
    const raw = JSON.stringify(state);
    localStorage.setItem('layoutManagerState', raw);
    window.dispatchEvent(new StorageEvent('storage', { key: 'layoutManagerState', newValue: raw }));
  };

  it('takes over a setting changed there, so this tab does not save its old value back', () => {
    setPopupSetting('popup:notes', 'hiddenTags', []);
    const heard: unknown[] = [];
    const off = subscribeToPanelSetting('popup', 'popup:notes', 'hiddenTags', (v) => heard.push(v));

    otherTabSaves({ hiddenTags: ['zakupy'] });
    saveLayoutState(windowManager.serialize());

    invalidateLayoutCache();
    expect(getPopupSetting('popup:notes', 'hiddenTags', [])).toEqual(['zakupy']);
    expect(heard).toEqual([['zakupy']]);
    off();
  });

  it('keeps a setting the other tab does not know about', () => {
    setPopupSetting('popup:notes', 'tag:42', true);

    otherTabSaves({ hiddenTags: [] });
    saveLayoutState(windowManager.serialize());

    invalidateLayoutCache();
    expect(getPopupSetting('popup:notes', 'tag:42', false)).toBe(true);
  });

  it('does not notify settings that did not change', () => {
    setPopupSetting('popup:notes', 'hiddenTags', ['zakupy']);
    const listener = vi.fn();
    const off = subscribeToPanelSetting('popup', 'popup:notes', 'hiddenTags', listener);

    otherTabSaves({ hiddenTags: ['zakupy'] });

    expect(listener).not.toHaveBeenCalled();
    off();
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

describe('auto-opening docked and pinned popups', () => {
  beforeEach(() => {
    localStorage.clear();
    invalidateLayoutCache();
    windowManager.loadState(loadLayoutState());
  });

  function persist(popupPanels: Record<string, { isDocked: boolean; persistOpen?: boolean }>) {
    const state = loadLayoutState();
    state.enabled = true;
    Object.assign(state.popupPanels, popupPanels);
    saveLayoutState(state);
    invalidateLayoutCache();
  }

  it('auto-opens a docked popup and a pinned one', () => {
    persist({ 'popup:docked': { isDocked: true }, 'popup:pinned': { isDocked: false, persistOpen: true } });

    expect(shouldPopupAutoOpen('popup:docked')).toBe(true);
    expect(shouldPopupAutoOpen('popup:pinned')).toBe(true);
  });

  it('getPinnedPopupsByPrefix includes docked and pinned popups', () => {
    persist({
      'map:a': { isDocked: true },
      'map:b': { isDocked: false, persistOpen: true },
    });

    expect(getPinnedPopupsByPrefix('map:').sort()).toEqual(['map:a', 'map:b']);
  });
});

describe('floating window top-edge clamping', () => {
  beforeEach(() => {
    localStorage.clear();
    invalidateLayoutCache();
    windowManager.loadState(loadLayoutState());
  });

  const openFloating = () => {
    windowManager.open('popup:clamp-test', { title: 'Test', x: 100, y: 100, ignoreHint: true });
  };

  it('clamps a negative top when the manager commits a drag', () => {
    openFloating();
    // User drags the titlebar up past the viewport top.
    windowManager.setPosition('popup:clamp-test', 40, -300);

    const w = windowManager.serialize().windows['popup:clamp-test'];
    expect(w.y).toBe(0);
    // Only the top edge is constrained.
    expect(w.x).toBe(40);
  });

  it('leaves an on-screen position untouched', () => {
    openFloating();
    windowManager.setPosition('popup:clamp-test', -120, 250);

    const w = windowManager.serialize().windows['popup:clamp-test'];
    expect(w.x).toBe(-120);
    expect(w.y).toBe(250);
  });

  it('heals a negative top persisted before the clamp existed', () => {
    const stored = loadLayoutState();
    stored.windows.map.y = -420;
    stored.popupPanels.chat = { isDocked: false, floatingState: { x: 10, y: -80, width: 300 } };
    saveLayoutState(stored);
    invalidateLayoutCache();

    const loaded = loadPersistedLayoutState();
    expect(loaded.windows.map.y).toBe(0);
    expect(loaded.popupPanels.chat.floatingState!.y).toBe(0);
    expect(loaded.popupPanels.chat.floatingState!.x).toBe(10);
  });
});
