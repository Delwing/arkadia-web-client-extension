import { beforeEach, describe, expect, it } from 'vitest';
import { windowManager } from '@web/layout/WindowManager';
import {
  getBuiltInPanelSetting,
  setBuiltInPanelSetting,
  getPopupSetting,
  setPopupSetting,
  loadLayoutState,
  saveLayoutState,
  invalidateLayoutCache,
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
