// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HeaderMenu, MenuBack, MenuCheckItem, MenuItem } from '@web/layout/components/HeaderMenu';
import { usePopover } from '@web/layout/hooks/usePopover';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('HeaderMenu', () => {
  let container: HTMLDivElement;
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

  function click(el: Element | null) {
    expect(el).not.toBeNull();
    act(() => {
      (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  const onAction = vi.fn();

  function Menu() {
    const [submenu, setSubmenu] = useState(false);
    const [checked, setChecked] = useState(false);
    const menu = usePopover({ onClose: () => setSubmenu(false) });
    return (
      <HeaderMenu menu={menu} title="Menu mapy">
        {submenu ? (
          <MenuBack onClick={() => setSubmenu(false)} />
        ) : (
          <>
            <MenuItem onClick={() => setSubmenu(true)}>Zmien obszar</MenuItem>
            <MenuItem onClick={() => { onAction(); menu.close(); }}>Zbliz</MenuItem>
            <MenuCheckItem checked={checked} onClick={() => setChecked(c => !c)}>Siatka</MenuCheckItem>
          </>
        )}
      </HeaderMenu>
    );
  }

  const toggle = () => container.querySelector('.popup-menu__toggle[title="Menu mapy"]');
  const menuEl = () => container.querySelector('.popup-menu');
  const item = (text: string) =>
    [...container.querySelectorAll('.popup-menu__item')].find(b => b.textContent?.includes(text)) ?? null;

  it('opens from the toggle and closes after an action', () => {
    act(() => root.render(<Menu />));
    expect(menuEl()).toBeNull();
    click(toggle());
    expect(menuEl()).not.toBeNull();
    click(item('Zbliz'));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(menuEl()).toBeNull();
  });

  it('closes on a click outside, and reopens at the top level', () => {
    act(() => root.render(<Menu />));
    click(toggle());
    click(item('Zmien obszar'));
    expect(item('Powrot')).not.toBeNull();

    act(() => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    expect(menuEl()).toBeNull();

    click(toggle());
    expect(item('Powrot')).toBeNull();
    expect(item('Zmien obszar')).not.toBeNull();
  });

  it('marks checked items', () => {
    act(() => root.render(<Menu />));
    click(toggle());
    expect(item('Siatka')!.classList.contains('is-on')).toBe(false);
    click(item('Siatka'));
    expect(item('Siatka')!.classList.contains('is-on')).toBe(true);
  });
});
