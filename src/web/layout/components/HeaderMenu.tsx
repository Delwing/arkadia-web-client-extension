import type { ReactNode } from 'react';
import type { Popover } from '../hooks/usePopover';

interface HeaderMenuProps {
  /** From usePopover() in the owning menu; its close() dismisses after an action. */
  menu: Popover;
  /** Button tooltip, e.g. "Menu mapy". */
  title: string;
  children: ReactNode;
}

/**
 * The ☰ action menu in a window header: actions and navigation (change area,
 * zoom, open a tool…). Persistent window options belong in the settings cog
 * (WindowSettingsMenu), not here.
 */
export function HeaderMenu({ menu, title, children }: HeaderMenuProps) {
  return (
    <div className="popup-menu-anchor" ref={menu.rootRef} onPointerDown={e => e.stopPropagation()}>
      <button
        ref={menu.anchorRef}
        type="button"
        className={`popup-menu__toggle${menu.open ? ' is-active' : ''}`}
        onClick={menu.toggle}
        title={title}
      >
        <span className="popup-menu__hamburger" />
      </button>
      {menu.style && (
        <div className="popup-popover popup-menu" style={menu.style}>
          {children}
        </div>
      )}
    </div>
  );
}

interface MenuItemProps {
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
}

/** A plain action row. */
export function MenuItem({ onClick, children, active, disabled }: MenuItemProps) {
  return (
    <button
      type="button"
      className={`popup-menu__item${active ? ' popup-menu__item--active' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

/** An on/off row with a check box. */
export function MenuCheckItem({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`popup-menu__item${checked ? ' is-on' : ''}`} onClick={onClick}>
      <span className="popup-menu__check" />
      {children}
    </button>
  );
}

/** "← Powrot" at the top of a submenu. */
export function MenuBack({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="popup-menu__item popup-menu__item--back" onClick={onClick}>
      &larr; Powrot
    </button>
  );
}

/** Items side by side (Zbliz | Oddal). */
export function MenuRow({ children }: { children: ReactNode }) {
  return <div className="popup-menu__row">{children}</div>;
}

/** A long list that scrolls inside the menu (areas, levels). */
export function MenuScroll({ children }: { children: ReactNode }) {
  return <div className="popup-menu__scroll">{children}</div>;
}
