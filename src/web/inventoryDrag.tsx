import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import eventBus from '@modules/core/eventBus';
import type { ContainerItem } from '@client/scripts/prettyContainers';

/**
 * Dragging in the inventory window moves the item itself: its row leaves the
 * list it was in (the others close up), follows the cursor, and the list under
 * it opens a gap where it will land. Dropped, it stays there, dimmed, until
 * the game says it moved. Only between what is carried ("Przy sobie") and the
 * bags from /pojemniki; everything else is the right-click menu.
 *
 * Pointer events rather than HTML drag and drop: that one only ever drags a
 * picture of the row, while the row stays put.
 *
 * The window re-renders only when the gap moves: the row under the cursor is
 * moved by hand on every pointer move, and where the gap goes is worked out
 * once a frame.
 */

/** Something being moved: an item carried, or one inside a bag from /pojemniki */
export type DragSource =
    | { type: 'entry'; key: string }
    | { type: 'content'; bag: string; item: number };

/** Where it can land: what is carried, or a bag from /pojemniki by its key */
export type DropZone = 'carried' | string;

export interface DragItem extends ContainerItem {
    /** Shown name, open/closed word left out */
    label: string;
}

interface Dragging {
    source: DragSource;
    item: DragItem;
    width: number;
    height: number;
    /** Where in the row it was grabbed */
    offsetX: number;
    offsetY: number;
}

/** The opening in a list where the dragged item would land */
export interface Gap {
    zone: DropZone;
    index: number;
    height: number;
}

/** Dropped, waiting for the game: shown where it landed, gone from where it was */
export interface Pending {
    source: DragSource;
    item: DragItem;
    zone: DropZone;
    index: number;
}

/** How long a dropped item waits for the game before going back */
const PENDING_MS = 5000;
/** How far the pointer moves before a press is a drag, not a click */
const DRAG_THRESHOLD_PX = 4;

function sameSource(a: DragSource, b: DragSource): boolean {
    if (a.type === 'entry' && b.type === 'entry') return a.key === b.key;
    if (a.type === 'content' && b.type === 'content') return a.bag === b.bag && a.item === b.item;
    return false;
}

/** Carried things go into bags; things in a bag go out, or into another bag */
export function accepts(source: DragSource, zone: DropZone): boolean {
    return source.type === 'entry' ? zone !== 'carried' : zone !== source.bag;
}

function drop(source: DragSource, zone: DropZone) {
    if (source.type === 'entry') {
        eventBus.emit('inventory.action', { kind: 'put', key: source.key, bag: zone });
    } else if (zone === 'carried') {
        eventBus.emit('inventory.action', { kind: 'take', bag: source.bag, item: source.item });
    } else {
        eventBus.emit('inventory.action', { kind: 'move', from: source.bag, item: source.item, bag: zone });
    }
}

export interface InventoryDrag {
    dragging: Dragging | null;
    gap: Gap | null;
    pending: Pending | null;
    /** Pointer down on a row that can be dragged */
    press: (e: React.PointerEvent<HTMLElement>, source: DragSource, item: DragItem) => void;
    /** The row following the cursor */
    floatRef: (el: HTMLElement | null) => void;
    /** The area a zone takes drops in */
    hitRef: (zone: DropZone) => (el: HTMLElement | null) => void;
    /** The element whose `[data-drag-row]` children the gap goes between */
    listRef: (zone: DropZone) => (el: HTMLElement | null) => void;
    /** Out of its list: being dragged, or dropped and waiting */
    isAway: (source: DragSource) => boolean;
    /** True once after a drag, so the click ending it does not also toggle a bag */
    swallowClick: () => boolean;
    /** The game refused the move: the dropped item goes back where it was */
    cancelPending: () => void;
}

/**
 * @param stillThere whether a dropped item is still where it came from; once
 *   it is not, the game has moved it and the waiting copy goes
 */
export function useInventoryDrag(stillThere: (pending: Pending) => boolean): InventoryDrag {
    const [dragging, setDragging] = useState<Dragging | null>(null);
    const [gap, setGap] = useState<Gap | null>(null);
    const [pending, setPending] = useState<Pending | null>(null);

    const pressed = useRef<{ source: DragSource; item: DragItem; el: HTMLElement; x: number; y: number } | null>(null);
    const draggingRef = useRef<Dragging | null>(null);
    const gapRef = useRef<Gap | null>(null);
    const dragged = useRef(false);
    const pointer = useRef({ x: 0, y: 0 });
    const float = useRef<HTMLElement | null>(null);
    const zones = useRef(new Map<DropZone, { hit?: HTMLElement; list?: HTMLElement }>());

    const zone = (key: DropZone) => {
        if (!zones.current.has(key)) zones.current.set(key, {});
        return zones.current.get(key)!;
    };
    const hitRef = useCallback((key: DropZone) => (el: HTMLElement | null) => { zone(key).hit = el ?? undefined; }, []);
    const listRef = useCallback((key: DropZone) => (el: HTMLElement | null) => { zone(key).list = el ?? undefined; }, []);

    const place = () => {
        const current = draggingRef.current;
        if (!float.current || !current) return;
        float.current.style.transform =
            `translate(${pointer.current.x - current.offsetX}px, ${pointer.current.y - current.offsetY}px)`;
    };
    const floatRef = useCallback((el: HTMLElement | null) => {
        float.current = el;
        place();
    }, []);  

    useEffect(() => {
        const findGap = (current: Dragging): Gap | null => {
            const { x, y } = pointer.current;
            for (const [key, { hit, list }] of zones.current) {
                if (!hit || !accepts(current.source, key)) continue;
                const r = hit.getBoundingClientRect();
                if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
                let index = 0;
                // Rows go top to bottom, so the first one below the cursor ends the count
                for (const row of list?.querySelectorAll<HTMLElement>(':scope > [data-drag-row]') ?? []) {
                    const box = row.getBoundingClientRect();
                    if (box.top + box.height / 2 >= y) break;
                    index += 1;
                }
                return { zone: key, index, height: current.height };
            }
            return null;
        };

        let frame = 0;
        const updateGap = () => {
            frame = 0;
            const current = draggingRef.current;
            if (!current) return;
            const next = findGap(current);
            const prev = gapRef.current;
            if (next?.zone !== prev?.zone || next?.index !== prev?.index) {
                gapRef.current = next;
                setGap(next);
            }
        };

        const move = (e: PointerEvent) => {
            const press = pressed.current;
            if (!press) return;
            pointer.current = { x: e.clientX, y: e.clientY };
            if (!draggingRef.current) {
                if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_THRESHOLD_PX) return;
                const rect = press.el.getBoundingClientRect();
                const current = {
                    source: press.source,
                    item: press.item,
                    width: rect.width,
                    height: rect.height,
                    offsetX: press.x - rect.left,
                    offsetY: press.y - rect.top,
                };
                dragged.current = true;
                draggingRef.current = current;
                setDragging(current);
            }
            place();
            if (!frame) frame = requestAnimationFrame(updateGap);
        };

        const end = (dropIt: boolean) => {
            if (frame) cancelAnimationFrame(frame);
            frame = 0;
            const current = draggingRef.current;
            // A drop right after a move lands where the cursor is, not where the last frame saw it
            const landing = current ? findGap(current) : null;
            pressed.current = null;
            draggingRef.current = null;
            gapRef.current = null;
            setDragging(null);
            setGap(null);
            if (dropIt && current && landing) {
                drop(current.source, landing.zone);
                setPending({ source: current.source, item: current.item, zone: landing.zone, index: landing.index });
            }
        };
        const up = () => end(true);
        const cancel = () => end(false);
        const key = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && draggingRef.current) cancel();
        };

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', cancel);
        window.addEventListener('keydown', key);
        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', cancel);
            window.removeEventListener('keydown', key);
            if (frame) cancelAnimationFrame(frame);
        };
    }, []);  

    // No selecting text and a grabbing hand anywhere while something is held
    useEffect(() => {
        document.body.classList.toggle('inventory-dragging', !!dragging);
        return () => document.body.classList.remove('inventory-dragging');
    }, [dragging]);

    // The game moved it, or never did: either way the waiting copy goes
    useEffect(() => {
        if (!pending) return;
        if (!stillThere(pending)) {
            setPending(null);
            return;
        }
        const timer = setTimeout(() => setPending(null), PENDING_MS);
        return () => clearTimeout(timer);
    }, [pending, stillThere]);

    const press = useCallback((e: React.PointerEvent<HTMLElement>, source: DragSource, item: DragItem) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
        dragged.current = false;
        pressed.current = { source, item, el: e.currentTarget, x: e.clientX, y: e.clientY };
    }, []);

    const isAway = useCallback((source: DragSource) =>
        (!!dragging && sameSource(dragging.source, source)) || (!!pending && sameSource(pending.source, source)),
    [dragging, pending]);

    const swallowClick = useCallback(() => {
        const was = dragged.current;
        dragged.current = false;
        return was;
    }, []);

    const cancelPending = useCallback(() => setPending(null), []);

    // The same object until something the window shows changes, so rows do not re-render while it is held
    return useMemo(
        () => ({ dragging, gap, pending, press, floatRef, hitRef, listRef, isAway, swallowClick, cancelPending }),
        [dragging, gap, pending, press, floatRef, hitRef, listRef, isAway, swallowClick, cancelPending],
    );
}

/** A row of a drop list: draggable ones have a source and count for the gap's place */
export interface DropRow {
    key: string;
    source?: DragSource;
    node: ReactNode;
}

/**
 * A list's rows with what dragging does to them: the dragged row folded away,
 * the gap opened where it would land, and a dropped item waiting there.
 */
export function dropListRows(
    zone: DropZone,
    rows: DropRow[],
    drag: InventoryDrag,
    renderItem: (item: DragItem) => ReactNode,
): ReactNode[] {
    const out: ReactNode[] = [];
    const { gap, pending, dragging } = drag;
    const opening = (at: number) => {
        if (gap?.zone === zone && gap.index === at) {
            out.push(<div key="gap" className="inventory-popup__gap" style={{ '--h': `${gap.height}px` } as React.CSSProperties} />);
        }
        if (pending?.zone === zone && pending.index === at && !(gap?.zone === zone)) {
            out.push(<div key="pending" className="inventory-popup__pending">{renderItem(pending.item)}</div>);
        }
    };
    let visible = 0;
    rows.forEach(row => {
        if (row.source && drag.isAway(row.source)) {
            const height = dragging?.height ?? 0;
            out.push(<div key={row.key} className="inventory-popup__leaving" style={{ '--h': `${height}px` } as React.CSSProperties} />);
            return;
        }
        if (!row.source) {
            out.push(<React.Fragment key={row.key}>{row.node}</React.Fragment>);
            return;
        }
        opening(visible);
        visible += 1;
        out.push(<div key={row.key} data-drag-row="">{row.node}</div>);
    });
    opening(visible);
    return out;
}

