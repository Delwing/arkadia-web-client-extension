import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { windowManager } from '@web/layout/WindowManager';
import { getPopup, subscribeToRegistry } from '@web/layout/popupRegistry';

/**
 * FloatingPopupHost — a floating home for a stock dockable popup, with no
 * docking/layout involvement.
 *
 * Renders the same `.forged.panel` chrome the sidebar panels use (bronze
 * ornament + Cinzel title, panel body), plus a `panel--floating` modifier that
 * makes it a fixed window, and eight resize grips (edges + corners). It is
 * draggable by its header and closable; there is deliberately NO pinning —
 * pinning is a docking concept that has no meaning for a plain floating window.
 *
 * Geometry comes from the popup's own declaration: when the stock popup
 * registers, it publishes `config.initialWidth/Height` and `minWidth/Height`
 * into the popup registry, and the host reads those. The stock component is
 * reused verbatim — its content portals into a shared, id-keyed target div
 * (`WindowManager.getOrCreatePortalTarget`) which we attach into the body.
 */
interface FloatingPopupHostProps {
    popupId: string;
    /** Fallback title used until the popup registers (registry title wins). */
    title?: string;
    initialX?: number;
    initialY?: number;
}

type Size = { w: number; h: number };
type Pos = { x: number; y: number };

const RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;

export default function FloatingPopupHost({
    popupId,
    title,
    initialX = 120,
    initialY = 120,
}: FloatingPopupHostProps) {
    // Subscribe to the registered popup object. Its reference changes on every
    // registry update (updatePopup replaces the record), so this re-renders the
    // host on live title AND headerActions changes — not just open/close.
    const popup = useSyncExternalStore(
        subscribeToRegistry,
        () => getPopup(popupId),
    );
    const registered = popup != null;

    const bodyRef = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<Pos>({ x: initialX, y: initialY });
    const [size, setSize] = useState<Size | null>(null);

    // Seed size from the popup's declared geometry on open; reset on close so a
    // reopen picks up fresh defaults.
    useEffect(() => {
        if (!registered) {
            setSize(null);
            setPos({ x: initialX, y: initialY });
            return;
        }
        const cfg = getPopup(popupId)?.config;
        setSize((s) => s ?? { w: cfg?.initialWidth ?? 360, h: cfg?.initialHeight ?? 320 });
    }, [registered, popupId, initialX, initialY]);

    // Attach the popup's portal target into our body while open. React portals
    // from the stock component render into this same div, so content stays live.
    useEffect(() => {
        if (!registered) return;
        const body = bodyRef.current;
        if (!body) return;
        const target = windowManager.getOrCreatePortalTarget(popupId);
        body.appendChild(target);
        return () => {
            if (target.parentNode === body) body.removeChild(target);
        };
    }, [registered, popupId]);

    const handleClose = useCallback(() => {
        getPopup(popupId)?.onClose();
    }, [popupId]);

    // ── Title-bar drag ──────────────────────────────────────────────────────
    const dragRef = useRef<{ dx: number; dy: number } | null>(null);
    const onDragDown = useCallback((e: React.PointerEvent) => {
        // Don't start a drag from the header controls (close + popup actions).
        if ((e.target as Element).closest('.forge-floating__head-actions')) return;
        dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }, [pos.x, pos.y]);
    const onDragMove = useCallback((e: React.PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        setPos({ x: e.clientX - d.dx, y: e.clientY - d.dy });
    }, []);
    const onDragUp = useCallback((e: React.PointerEvent) => {
        dragRef.current = null;
        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    }, []);

    // ── Resize (edges + corners) ────────────────────────────────────────────
    const resizeRef = useRef<null | {
        dir: string;
        startX: number; startY: number;
        x0: number; y0: number; w0: number; h0: number;
        minW: number; minH: number;
    }>(null);

    const onResizeDown = useCallback((dir: string) => (e: React.PointerEvent) => {
        e.stopPropagation();
        const cfg = getPopup(popupId)?.config;
        resizeRef.current = {
            dir,
            startX: e.clientX, startY: e.clientY,
            x0: pos.x, y0: pos.y,
            w0: size?.w ?? cfg?.initialWidth ?? 360,
            h0: size?.h ?? cfg?.initialHeight ?? 320,
            minW: cfg?.minWidth ?? 200,
            minH: cfg?.minHeight ?? 120,
        };
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
    }, [popupId, pos.x, pos.y, size]);

    const onResizeMove = useCallback((e: React.PointerEvent) => {
        const r = resizeRef.current;
        if (!r) return;
        const dx = e.clientX - r.startX;
        const dy = e.clientY - r.startY;
        let X = r.x0, Y = r.y0, W = r.w0, H = r.h0;
        if (r.dir.includes('e')) W = r.w0 + dx;
        if (r.dir.includes('s')) H = r.h0 + dy;
        if (r.dir.includes('w')) { W = r.w0 - dx; X = r.x0 + dx; }
        if (r.dir.includes('n')) { H = r.h0 - dy; Y = r.y0 + dy; }
        if (W < r.minW) {
            if (r.dir.includes('w')) X = r.x0 + (r.w0 - r.minW);
            W = r.minW;
        }
        if (H < r.minH) {
            if (r.dir.includes('n')) Y = r.y0 + (r.h0 - r.minH);
            H = r.minH;
        }
        setPos({ x: X, y: Y });
        setSize({ w: W, h: H });
    }, []);

    const onResizeUp = useCallback((e: React.PointerEvent) => {
        resizeRef.current = null;
        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    }, []);

    if (!registered) return null;

    const liveTitle = popup?.config.title ?? title ?? popupId;
    const headerActions = popup?.headerActions;

    return (
        <div
            className="forged panel panel--floating"
            style={{ left: pos.x, top: pos.y, width: size?.w, height: size?.h }}
        >
            <div
                className="panel__head panel__head--drag"
                onPointerDown={onDragDown}
                onPointerMove={onDragMove}
                onPointerUp={onDragUp}
            >
                <span className="orn" />
                <span className="panel__title">{liveTitle}</span>
                <div className="forge-floating__head-actions">
                    {headerActions}
                    <button
                        type="button"
                        className="forge-floating__close"
                        onClick={handleClose}
                        title="Zamknij"
                    >
                        &times;
                    </button>
                </div>
            </div>
            <div ref={bodyRef} className="panel__body" />

            {RESIZE_DIRS.map((dir) => (
                <div
                    key={dir}
                    className={`forge-resize forge-resize--${dir}`}
                    onPointerDown={onResizeDown(dir)}
                    onPointerMove={onResizeMove}
                    onPointerUp={onResizeUp}
                />
            ))}
        </div>
    );
}
