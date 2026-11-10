import { useLayoutEffect, useState, type RefObject } from "react";

/** Window width steps: full keyboard, smaller keyboard, colour map, list only. */
export type Size = "wide" | "medium" | "narrow" | "phone";

export function sizeFor(width: number): Size {
    if (width >= 1120) return "wide";
    if (width >= 760) return "medium";
    if (width >= 480) return "narrow";
    return "phone";
}

/**
 * The window's width step and the drawn keyboard's width. `kbCollapsed` is
 * passed so the keyboard is observed again when it comes back.
 */
export function useKeysSize(rootRef: RefObject<HTMLElement | null>, kbRef: RefObject<HTMLElement | null>, kbCollapsed: boolean) {
    const [size, setSize] = useState<Size>("wide");
    const [kbWidth, setKbWidth] = useState(0);

    useLayoutEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        // Measured here too, not only from the observer: a tab that is not being
        // rendered (opened in the background) never gets a resize callback, and
        // the keyboard would stay blank until it does.
        // A zero width means the window has not been laid out yet (it is still
        // hidden, or this is the first pass): measuring that would read as a
        // phone and stick, because a tab that is not being rendered never gets
        // a resize callback to correct it.
        const measure = () => {
            const width = root.clientWidth;
            if (width > 0) setSize(sizeFor(width));
            const board = kbRef.current?.clientWidth ?? 0;
            if (board > 0) setKbWidth(board);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(root);
        if (kbRef.current) observer.observe(kbRef.current);
        return () => observer.disconnect();
    }, [rootRef, kbRef, size, kbCollapsed]);

    return { size, kbWidth };
}
