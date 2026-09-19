import { useEffect } from "react";
import { formatClock } from "../model/format";

export interface LineMenuState {
    x: number;
    y: number;
    timestamp: number;
    lineNumber: number;
}

export interface LineMenuProps {
    menu: LineMenuState;
    /** True when a range is already set, so clearing it is worth offering. */
    hasRange: boolean;
    onSetBound: (edge: "from" | "to", timestamp: number) => void;
    onClearRange: () => void;
    onClose: () => void;
}

/**
 * Right-click menu on a log line: the way a range is set without touching the
 * timeline, matching the in-client browser.
 *
 * Positioned with `position: fixed` at the pointer. It is deliberately not a
 * Radix menu — Radix wants a trigger element, and the trigger here is a
 * right-click anywhere in a virtualized list whose rows unmount as they scroll.
 */
export function LineMenu({ menu, hasRange, onSetBound, onClearRange, onClose }: LineMenuProps) {
    useEffect(() => {
        const close = () => onClose();
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            // Captured on `window`, ahead of every other listener, and stopped
            // there: in a modal host the dialog is also listening for Escape,
            // and one press must close the menu WITHOUT closing the window
            // underneath it.
            event.stopPropagation();
            onClose();
        };

        // Attach on the NEXT tick. The right-click that opened this menu is
        // still propagating: React's handler runs at the root container, so the
        // native contextmenu event goes on to reach window and would close the
        // menu in the same gesture that opened it.
        const armed = window.setTimeout(() => {
            // Scroll closes it too: the menu is pinned to the viewport, so a
            // scrolled list would leave it pointing at a different line.
            window.addEventListener("click", close);
            window.addEventListener("contextmenu", close);
            window.addEventListener("scroll", close, true);
        }, 0);
        window.addEventListener("keydown", onKey, true);

        return () => {
            window.clearTimeout(armed);
            window.removeEventListener("click", close);
            window.removeEventListener("contextmenu", close);
            window.removeEventListener("scroll", close, true);
            window.removeEventListener("keydown", onKey, true);
        };
    }, [onClose]);

    return (
        <div
            className="lv-line-menu"
            style={{
                // Keep the menu on screen when the click lands near an edge.
                left: Math.min(menu.x, window.innerWidth - 220),
                top: Math.min(menu.y, window.innerHeight - 140),
            }}
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.preventDefault()}
        >
            <div className="lv-line-menu__label">
                linia {menu.lineNumber} {"·"} {formatClock(menu.timestamp)}
            </div>
            <button
                type="button"
                className="lv-line-menu__item"
                onClick={() => onSetBound("from", menu.timestamp)}
            >
                Zacznij od tej linii
            </button>
            <button
                type="button"
                className="lv-line-menu__item"
                onClick={() => onSetBound("to", menu.timestamp)}
            >
                Zakoncz na tej linii
            </button>
            {hasRange ? (
                <>
                    <div className="lv-line-menu__separator" />
                    <button type="button" className="lv-line-menu__item" onClick={onClearRange}>
                        Wyczysc zakres
                    </button>
                </>
            ) : null}
        </div>
    );
}
