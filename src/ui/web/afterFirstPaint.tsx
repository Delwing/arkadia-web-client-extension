import { useEffect, useState, type ReactNode } from "react";

let painted = false;

/**
 * False until the page has painted once, then true (at once for anything that
 * mounts later). For parts that draw nothing in the first frame — closed popups,
 * on-screen buttons — so they do not hold up the first paint: the whole page
 * renders in one go at start-up, and on a slow phone every part counts.
 */
export function useAfterFirstPaint(): boolean {
    const [ready, setReady] = useState(painted);
    useEffect(() => {
        if (ready) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        // The frame after the first one is drawn, then a task of its own.
        const frame = requestAnimationFrame(() => {
            timer = setTimeout(() => {
                painted = true;
                setReady(true);
            });
        });
        return () => {
            cancelAnimationFrame(frame);
            if (timer !== undefined) clearTimeout(timer);
        };
    }, [ready]);
    return ready;
}

/** Renders its children once the page has painted (see {@link useAfterFirstPaint}). */
export function AfterFirstPaint({ children }: { children: ReactNode }) {
    return useAfterFirstPaint() ? <>{children}</> : null;
}
