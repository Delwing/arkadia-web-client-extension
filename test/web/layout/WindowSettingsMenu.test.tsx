// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { WindowSettingsMenu } from '@web/layout/components/WindowSettingsMenu';
import { usePopupSetting } from '@web/hooks/usePopupSetting';
import {
  getWindowSetting,
  WINDOW_FONT_FAMILY_KEY,
  WINDOW_FONT_SIZE_KEY,
  type WindowSettingField,
} from '@web/layout/windowSettings';
import { invalidateLayoutCache } from '@web/layout/utils/layoutStorage';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FIELDS: WindowSettingField[] = [
  { type: 'toggle', key: 'noWrap', label: 'Zawijaj wiersze', default: false, inverted: true },
  { type: 'toggle', key: 'showTimestamp', label: 'Znacznik czasu', default: true },
];

describe('WindowSettingsMenu', () => {
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
  });

  function click(el: Element | null) {
    expect(el).not.toBeNull();
    act(() => {
      (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  function openMenu() {
    click(container.querySelector('.panel-button--settings'));
    return container.querySelector('.window-settings');
  }

  it('shows the shared appearance fields, then the window\'s own section', () => {
    act(() => root.render(<WindowSettingsMenu windowId="popup:chat" title="Czat" fields={FIELDS} />));
    const panel = openMenu();
    expect(panel).not.toBeNull();
    const sections = [...panel!.querySelectorAll('.window-settings__section-title')].map(h => h.textContent);
    expect(sections).toEqual(['Wyglad', 'Czat']);
    expect(panel!.textContent).toContain('Zawijaj wiersze');
  });

  it('writes a toggle that the window\'s own content sees at once', () => {
    const seen: boolean[] = [];
    function Content() {
      const [noWrap] = usePopupSetting('popup:chat', 'noWrap', false);
      seen.push(noWrap);
      return null;
    }
    act(() => root.render(
      <>
        <Content />
        <WindowSettingsMenu windowId="popup:chat" title="Czat" fields={FIELDS} />
      </>,
    ));
    const panel = openMenu();
    const wrapToggle = [...panel!.querySelectorAll('.window-settings__toggle')]
      .find(b => b.textContent?.includes('Zawijaj'))!;
    // "Zawijaj" is shown on while noWrap is false (inverted field).
    expect(wrapToggle.classList.contains('is-on')).toBe(true);

    click(wrapToggle);
    expect(getWindowSetting('popup:chat', 'noWrap', false)).toBe(true);
    expect(seen.at(-1)).toBe(true);
    expect(wrapToggle.classList.contains('is-on')).toBe(false);
  });

  it('starts a size override from the main window size and can go back to following it', () => {
    act(() => root.render(<WindowSettingsMenu windowId="popup:chat" title="Czat" />));
    const panel = openMenu();
    expect(panel!.querySelector('.window-settings__size-value')!.textContent).toBe('Jak okno glowne');

    click(panel!.querySelector('.window-settings__step[title="Wieksza czcionka"]'));
    // 0.875 snaps to the 0.05 grid: + gives 0.90, not 0.925.
    expect(getWindowSetting('popup:chat', WINDOW_FONT_SIZE_KEY, null)).toBe(0.9);
    click(panel!.querySelector('.window-settings__step[title="Mniejsza czcionka"]'));
    expect(getWindowSetting('popup:chat', WINDOW_FONT_SIZE_KEY, null)).toBe(0.85);

    click(panel!.querySelector('.window-settings__reset'));
    expect(getWindowSetting('popup:chat', WINDOW_FONT_SIZE_KEY, 'unset')).toBeNull();
  });

  function choose(select: HTMLSelectElement, value: string) {
    act(() => {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  it('offers fonts in a dropdown that is written in each font', () => {
    act(() => root.render(<WindowSettingsMenu windowId="popup:chat" title="Czat" />));
    const panel = openMenu()!;
    const select = panel.querySelector<HTMLSelectElement>('select')!;
    const options = [...select.options];
    expect(options.map(o => o.textContent)).toEqual([
      'Jak okno glowne', 'Systemowa monospace', 'Fira Code', 'JetBrains Mono', 'Cascadia Mono',
    ]);
    expect(options.find(o => o.value === 'fira-code')!.style.fontFamily).toContain('Fira Code');

    choose(select, 'fira-code');
    expect(getWindowSetting('popup:chat', WINDOW_FONT_FAMILY_KEY, null)).toBe('fira-code');
    // The closed dropdown shows the chosen font too.
    expect(select.style.fontFamily).toContain('Fira Code');

    choose(select, '');
    expect(getWindowSetting('popup:chat', WINDOW_FONT_FAMILY_KEY, 'unset')).toBeNull();
  });

  it('offers the size reset only while the size is overridden', () => {
    act(() => root.render(<WindowSettingsMenu windowId="popup:chat" title="Czat" />));
    const panel = openMenu()!;
    const reset = () => panel.querySelector<HTMLButtonElement>('.window-settings__reset')!;
    expect(reset().disabled).toBe(true);
    click(panel.querySelector('.window-settings__step[title="Wieksza czcionka"]'));
    expect(reset().disabled).toBe(false);
    click(reset());
    expect(reset().disabled).toBe(true);
  });

  it('leaves out the font section for windows without text', () => {
    act(() => root.render(
      <WindowSettingsMenu windowId="map" title="Mapa" appearance={false} fields={FIELDS} />,
    ));
    const panel = openMenu()!;
    const sections = [...panel.querySelectorAll('.window-settings__section-title')].map(h => h.textContent);
    expect(sections).toEqual(['Mapa']);
    expect(panel.querySelector('select')).toBeNull();
  });

  it('closes on Escape', () => {
    act(() => root.render(<WindowSettingsMenu windowId="popup:chat" title="Czat" />));
    openMenu();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(container.querySelector('.window-settings')).toBeNull();
  });
});
