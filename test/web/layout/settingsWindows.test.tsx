// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { listSettingsWindows } from '@web/layout/settingsWindows';
import { registerPopup, unregisterPopup, type RegisteredPopup } from '@web/layout/popupRegistry';
import { getWindowSetting, WINDOW_FONT_SIZE_KEY } from '@web/layout/windowSettings';
import { invalidateLayoutCache } from '@web/layout/utils/layoutStorage';
import { WindowSettingsSection } from '@web/uiSettings/sections/WindowsSections';
import { MODAL_EVENT } from '@web/modals/appModal';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function popup(id: string, title: string, extra: Partial<RegisteredPopup> = {}): RegisteredPopup {
  return {
    id,
    config: { id, title } as RegisteredPopup['config'],
    renderContent: () => null,
    onClose: () => {},
    isPinned: false,
    setIsPinned: () => {},
    isLocked: false,
    setIsLocked: () => {},
    onReset: () => {},
    ...extra,
  };
}

describe('listSettingsWindows', () => {
  afterEach(() => {
    unregisterPopup('popup:zeta');
    unregisterPopup('popup:chat');
  });

  it('lists the built-in windows, then open popups by title', () => {
    registerPopup(popup('popup:zeta', 'Zegar'));
    registerPopup(popup('popup:chat', 'Czat', {
      settingsFields: [{ type: 'toggle', key: 'noWrap', label: 'Zawijaj', default: false }],
    }));
    const windows = listSettingsWindows();
    expect(windows.map(w => w.id)).toEqual(['objectList', 'objectListOthers', 'map', 'popup:chat', 'popup:zeta']);
    expect(windows.find(w => w.id === 'map')).toMatchObject({ title: 'Mapa', appearance: false });
    expect(windows.find(w => w.id === 'popup:chat')!.fields).toHaveLength(1);
  });
});

describe('WindowSettingsSection', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    invalidateLayoutCache();
    document.body.style.setProperty('--output-font-size', '0.875rem');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    unregisterPopup('popup:chat');
  });

  it('is built only while the settings dialog shows', () => {
    const modal = document.createElement('div');
    modal.id = 'settings-modal';
    document.body.appendChild(modal);
    act(() => root.render(<WindowSettingsSection />));
    expect(container.querySelector('#ui-window-settings-window')).toBeNull();
    act(() => { modal.dispatchEvent(new Event(MODAL_EVENT.show)); });
    expect(container.querySelector('#ui-window-settings-window')).not.toBeNull();
    act(() => { modal.dispatchEvent(new Event(MODAL_EVENT.hidden)); });
    expect(container.querySelector('#ui-window-settings-window')).toBeNull();
    modal.remove();
  });

  it('edits the chosen window and picks up popups as they open', () => {
    const modal = document.createElement('div');
    modal.id = 'settings-modal';
    document.body.appendChild(modal);
    act(() => root.render(<WindowSettingsSection />));
    act(() => { modal.dispatchEvent(new Event(MODAL_EVENT.show)); });
    const select = () => container.querySelector<HTMLSelectElement>('#ui-window-settings-window')!;
    expect([...select().options].map(o => o.value)).not.toContain('popup:chat');

    act(() => registerPopup(popup('popup:chat', 'Czat')));
    expect([...select().options].map(o => o.value)).toContain('popup:chat');

    act(() => {
      select().value = 'popup:chat';
      select().dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector('.window-settings-inline')).not.toBeNull();
    act(() => {
      container.querySelector<HTMLButtonElement>('.window-settings__step[title="Większa czcionka"]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(getWindowSetting('popup:chat', WINDOW_FONT_SIZE_KEY, null)).toBe(0.9);
    modal.remove();
  });
});
