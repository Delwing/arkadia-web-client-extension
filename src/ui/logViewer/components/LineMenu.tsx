import { useEffect, type RefObject } from "react";
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
    /**
     * The viewer's own subtree. Only a scroll inside it closes the menu — in
     * the client the viewer sits in a dialog over a game log that scrolls on
     * every line, and a capture listener on `window` sees those too.
     */
    boundary: RefObject<HTMLElement | null>;
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
export function LineMenu({ menu, hasRange, boundary, onSetBound, onClearRange, onClose }: LineMenuProps) {
    useEffect(() => {
        const close = () => onClose();
        const onScroll = (event: Event) => {
            const root = boundary.current;
            const target = event.target;
            if (root && target instanceof Node && !root.contains(target)) return;
            onClose();
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            // One press closes the menu and nothing else. In a modal host the
            // dialog is listening for Escape too, and Radix's dismissable
            // layer stands down on a prevented default — which is why this is
            // `preventDefault` and not only `stopPropagation`: the layer
            // listens on the document in the capture phase, so relying on
            // propagation order alone is not enough.
            event.preventDefault();
            event.stopPropagation();
            onClose();
        };

        // Attach on the NEXT tick. The right-click that opened this menu is
        // still propagating: React's handler runs at the root container, so the
        // native contextmenu event goes on to reach window and would close the
        // menu in the same gesture that opened it.
        const armed = window.setTimeout(() => {
            // Scrolling the viewer closes it too: the menu is pinned to the
            // viewport, so a scrolled list would leave it pointing at a
            // different line.
            window.addEventListener("click", close);
            window.addEventListener("contextmenu", close);
            window.addEventListener("scroll", onScroll, true);
        }, 0);
        window.addEventListener("keydown", onKey, true);

        return () => {
            window.clearTimeout(armed);
            window.removeEventListener("click", close);
            window.removeEventListener("contextmenu", close);
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("keydown", onKey, true);
        };
    }, [onClose, boundary]);

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
