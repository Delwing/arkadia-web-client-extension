import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { usePopover } from '@web/layout/hooks/usePopover.ts';

export interface MenuButtonItem {
    label: ReactNode;
    /** A second, muted line under the label. */
    hint?: ReactNode;
    onSelect: () => void;
    disabled?: boolean;
}

/**
 * A button that opens a short list of actions — for secondary actions that
 * would otherwise crowd a toolbar (imports, exports). Built on the same
 * popover as the window-header ☰ menus.
 *
 * With `onClick` it becomes a split button: the label runs the default action
 * and only the chevron opens the list of alternatives.
 */
export function MenuButton({ label, items, size = 'sm', title, onClick, menuWidth = 220, disabled }: {
    label: ReactNode;
    items: MenuButtonItem[];
    size?: 'sm' | 'md';
    title?: string;
    onClick?: () => void;
    menuWidth?: number;
    disabled?: boolean;
}) {
    const menu = usePopover({ width: menuWidth });
    const base = `popup-btn popup-btn--control popup-menu-button${size === 'sm' ? ' popup-btn--sm' : ''}`;
    return (
        <div className={`popup-menu-anchor${onClick ? ' popup-menu-anchor--split' : ''}`} ref={menu.rootRef}>
            {onClick && (
                <button type="button" className={`${base} popup-menu-button__main`} onClick={onClick} disabled={disabled}>
                    {label}
                </button>
            )}
            <button
                ref={menu.anchorRef}
                type="button"
                title={title}
                disabled={disabled}
                className={`${base}${onClick ? ' popup-menu-button__chevron' : ''}${menu.open ? ' is-active' : ''}`}
                onClick={menu.toggle}
            >
                {!onClick && label}
                <ChevronDown size={14} strokeWidth={2} />
            </button>
            {menu.style && (
                <div className="popup-popover popup-menu" style={menu.style}>
                    {items.map((item, i) => (
                        <button
                            key={i}
                            type="button"
                            className={`popup-menu__item${item.hint ? ' popup-menu__item--hinted' : ''}`}
                            disabled={item.disabled}
                            onClick={() => { menu.close(); item.onSelect(); }}
                        >
                            {item.hint ? (
                                <>
                                    <span className="popup-menu__label">{item.label}</span>
                                    <span className="popup-menu__hint">{item.hint}</span>
                                </>
                            ) : item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
