import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { usePopover } from '@web/layout/hooks/usePopover.ts';

export interface MenuButtonItem {
    label: ReactNode;
    onSelect: () => void;
    disabled?: boolean;
}

/**
 * A button that opens a short list of actions — for secondary actions that
 * would otherwise crowd a toolbar (imports, exports). Built on the same
 * popover as the window-header ☰ menus.
 */
export function MenuButton({ label, items, size = 'sm', title }: {
    label: ReactNode;
    items: MenuButtonItem[];
    size?: 'sm' | 'md';
    title?: string;
}) {
    const menu = usePopover({ width: 220 });
    return (
        <div className="popup-menu-anchor" ref={menu.rootRef}>
            <button
                ref={menu.anchorRef}
                type="button"
                title={title}
                className={`popup-btn popup-btn--control popup-menu-button${size === 'sm' ? ' popup-btn--sm' : ''}${menu.open ? ' is-active' : ''}`}
                onClick={menu.toggle}
            >
                {label}
                <ChevronDown size={14} strokeWidth={2} />
            </button>
            {menu.style && (
                <div className="popup-popover popup-menu" style={menu.style}>
                    {items.map((item, i) => (
                        <button
                            key={i}
                            type="button"
                            className="popup-menu__item"
                            disabled={item.disabled}
                            onClick={() => { menu.close(); item.onSelect(); }}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
