import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "./cx";

export interface MenuProps {
    /** The control that opens the menu — a `<Button>`, typically. */
    trigger: ReactNode;
    align?: "start" | "end";
    /** Keeps the menu shut; the trigger is expected to look disabled too. */
    disabled?: boolean;
    className?: string;
    children: ReactNode;
}

interface Position {
    top: number;
    left: number;
}

/**
 * Dropdown menu.
 *
 * Written here rather than taken from a library because the viewer has to run
 * on the standalone page, which loads no Bootstrap, and in the client, which
 * loads plenty — so a menu that brings its own positioning and its own
 * dismissal is the only one that looks the same in both.
 *
 * The panel is `position: fixed` and measured from the trigger. Fixed rather
 * than absolute because `.lv` clips its overflow, and a menu that opens below
 * the header would otherwise be cut off at the first row of the log.
 */
export function Menu({ trigger, align = "end", disabled, className, children }: MenuProps) {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<Position | null>(null);
    const anchorRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const close = useCallback(() => setOpen(false), []);

    useLayoutEffect(() => {
        if (!open) return;
        const anchor = anchorRef.current?.getBoundingClientRect();
        const panel = panelRef.current?.getBoundingClientRect();
        if (!anchor) return;
        const width = panel?.width ?? 180;
        const left = align === "end" ? anchor.right - width : anchor.left;
        setPosition({
            top: anchor.bottom + 4,
            // Keep the panel on screen when the trigger sits near an edge.
            left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
        });
    }, [open, align]);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (panelRef.current?.contains(target)) return;
            if (anchorRef.current?.contains(target)) return;
            close();
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            // The viewer is hosted in a dialog that also listens for Escape;
            // one press closes the menu and nothing else.
            event.preventDefault();
            event.stopPropagation();
            close();
        };
        // Attached on the next tick: the click that opened the menu is still
        // propagating and would close it in the same gesture.
        const armed = window.setTimeout(() => {
            window.addEventListener("mousedown", onPointerDown);
            window.addEventListener("scroll", close, true);
            window.addEventListener("resize", close);
        }, 0);
        window.addEventListener("keydown", onKey, true);
        return () => {
            window.clearTimeout(armed);
            window.removeEventListener("mousedown", onPointerDown);
            window.removeEventListener("scroll", close, true);
            window.removeEventListener("resize", close);
            window.removeEventListener("keydown", onKey, true);
        };
    }, [open, close]);

    return (
        <>
            <span ref={anchorRef} className="lv-menu-anchor" onClick={() => !disabled && setOpen((was) => !was)}>
                {trigger}
            </span>
            {open ? (
                <div
                    ref={panelRef}
                    className={cx("lv-menu", className)}
                    style={position ? { top: position.top, left: position.left } : { visibility: "hidden" }}
                    onClick={close}
                >
                    {children}
                </div>
            ) : null}
        </>
    );
}

export function MenuItem({
    onSelect,
    disabled,
    children,
}: {
    onSelect: () => void;
    disabled?: boolean;
    children: ReactNode;
}) {
    return (
        <button type="button" className="lv-menu__item" disabled={disabled} onClick={onSelect}>
            {children}
        </button>
    );
}

export function MenuLabel({ children }: { children: ReactNode }) {
    return <div className="lv-menu__label">{children}</div>;
}

export function MenuSeparator() {
    return <div className="lv-menu__separator" />;
}
