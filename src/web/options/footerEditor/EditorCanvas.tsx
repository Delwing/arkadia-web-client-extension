import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { FooterLayout as Layout, FooterNode } from "@shared/footerLayoutTypes";
import FooterLayout from "@web-ui/footer/layout/FooterLayout";
import { FooterPreviewContext } from "@web-ui/footer/layout/previewContext";
import type { FooterPreviewHost } from "@web-ui/footer/layout/previewHost";
import { nodeAt, type LayoutPath } from "@web-ui/footer/layout/layoutEdit";
import { nodeLabel } from "./NodeFields";

export type DropTarget =
    | { kind: "into"; parent: LayoutPath; index: number }
    | { kind: "band"; index: number };

/**
 * How a drag that starts outside the preview (a new piece from the palette)
 * talks to it, in the frame's own client coordinates: `over` shows where it
 * would land, `drop` says where it lands, `leave` clears the mark.
 */
export interface CanvasBridge {
    over(x: number, y: number): void;
    drop(x: number, y: number): DropTarget | null;
    leave(): void;
}

/** Stands for the dragged path when what is dragged is not in the layout yet. */
const NEW_PIECE: LayoutPath = [-1, -1];

interface Box {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

interface Frame {
    key: string;
    path: LayoutPath;
    node?: FooterNode;
    box: Box;
}

interface Marker {
    box: Box;
    target: DropTarget;
}

interface Handle {
    key: string;
    box: Box;
    left: Frame;
    right: Frame;
}

/** The editor's own marks over the preview, and the few footer rules its wrappers would otherwise break. */
const CANVAS_CSS = `
html, body { height: auto !important; min-height: 0 !important; overflow: hidden !important; }
/* A frame whose colour scheme differs from the page paints opaque; give it the stage's own colour. */
html { background: var(--popup-bg) !important; }
/* Still pictures: nothing fades in or slides while the layout is being moved about. */
.fle-content *, .fle-content *::before, .fle-content *::after { transition: none !important; }
body.footer-preview-body { display: block !important; margin: 0 !important; padding: 0 !important; background: transparent !important; }
.footer-preview-host { display: flow-root; }
.fle-canvas { position: relative; display: flex; flex-direction: column; padding: 14px 0; }
.fle-content > #footer-layout { display: flex !important; flex-direction: column; }
.fle-node { display: contents; }
.footer-preview-sample:not(:only-child) { display: none !important; }
#footer-layout .fle-node + .fle-node > .footer-cell { margin-left: 16px; }
.hud-panel .fle-node + .fle-node > .footer-cell { margin-left: 14px; }
.footer-band > .fle-node:only-child > .footer-vitals { flex: 1; }
.fle-node:not(:last-child) > .status-vitals:not(:empty) { padding-right: 14px; border-right: 1px solid var(--popup-border-subtle); }
.fle-placeholder {
  display: inline-flex; align-items: center; padding: 2px 8px; border: 1px dashed currentColor; border-radius: 6px;
  font: 12px system-ui, sans-serif; opacity: .65; white-space: nowrap;
}
.fle-overlay { position: absolute; inset: 0; z-index: 10; cursor: default; }
.fle-frame {
  position: absolute; box-sizing: border-box; border: 1px dashed rgba(127, 170, 255, .35); border-radius: 5px;
  cursor: grab; touch-action: none;
}
.fle-frame--band { border-color: rgba(127, 170, 255, .18); }
.fle-frame:hover { border-color: rgba(127, 170, 255, .8); background: rgba(127, 170, 255, .06); }
.fle-frame.is-selected { border: 2px solid #6ea8ff; background: rgba(110, 168, 255, .08); }
.fle-frame.is-dragged { opacity: .35; }
.fle-tag {
  position: absolute; left: -1px; top: -18px; padding: 1px 6px; border-radius: 4px 4px 0 0;
  background: #6ea8ff; color: #0b1220; font: 600 11px/16px system-ui, sans-serif; white-space: nowrap; pointer-events: none;
  display: none;
}
.fle-frame:hover > .fle-tag, .fle-frame.is-selected > .fle-tag { display: block; }
.fle-frame--band > .fle-tag { top: auto; bottom: -18px; border-radius: 0 0 4px 4px; }
.fle-ghost {
  position: fixed; z-index: 20; pointer-events: none; opacity: .85;
  outline: 2px solid #6ea8ff; outline-offset: 2px; border-radius: 4px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .45); background: var(--popup-bg);
}
.fle-ghost > * { pointer-events: none; }
.fle-marker { position: absolute; background: #ffb547; border-radius: 2px; pointer-events: none; box-shadow: 0 0 6px #ffb547; }
.fle-handle { position: absolute; z-index: 1; cursor: col-resize; touch-action: none; }
.fle-handle::after { content: ""; position: absolute; left: 4px; top: 20%; bottom: 20%; width: 2px; border-radius: 1px; background: rgba(127, 170, 255, .5); }
.fle-handle:hover::after, .fle-handle.is-active::after { background: #6ea8ff; }
`;

const EMPTY: Box = { left: 0, top: 0, right: 0, bottom: 0 };
const hasArea = (box: Box) => box.right - box.left > 0.5 && box.bottom - box.top > 0.5;
const union = (a: Box, b: Box): Box => (!hasArea(a) ? b : !hasArea(b) ? a : {
    left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom),
});

/** An element's box, looking through display: contents to what it holds. */
function boxOf(element: Element, skipPlaceholders: boolean): Box {
    if (skipPlaceholders && element.classList.contains("fle-placeholder")) return EMPTY;
    const view = element.ownerDocument.defaultView!;
    if (view.getComputedStyle(element).display === "contents") {
        return Array.from(element.children).reduce((box, child) => union(box, boxOf(child, skipPlaceholders)), EMPTY);
    }
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

const pathKey = (path: LayoutPath) => path.join(".");
const isParentOf = (parent: LayoutPath, path: LayoutPath) =>
    path.length === parent.length + 1 && parent.every((index, i) => path[i] === index);
const isWithin = (path: LayoutPath, ancestor: LayoutPath) =>
    path.length >= ancestor.length && ancestor.every((index, i) => path[i] === index);
const inside = (box: Box, x: number, y: number, slack = 0) =>
    x >= box.left - slack && x <= box.right + slack && y >= box.top - slack && y <= box.bottom + slack;

/** Which way a container lays out its children. */
function axisOf(frame: Frame): "x" | "y" {
    return frame.node?.type === "column" ? "y" : "x";
}

const BAND_EDGE = 7;

/** Where a node dragged to (x, y) would land, and the line that shows it. */
function findDrop(frames: Frame[], dragged: LayoutPath, x: number, y: number): Marker | null {
    const bands = frames.filter((frame) => frame.path.length === 1);
    if (bands.length === 0) return null;
    const left = Math.min(...bands.map((band) => band.box.left));
    const right = Math.max(...bands.map((band) => band.box.right));

    // Along a band's top or bottom edge, or past the first or last: a band of its own.
    for (const band of bands) {
        const index = band.path[0];
        const nearTop = y < band.box.top + BAND_EDGE && (index === 0 ? true : y > band.box.top - BAND_EDGE);
        const nearBottom = y > band.box.bottom - BAND_EDGE && (index === bands.length - 1 ? true : y < band.box.bottom + BAND_EDGE);
        if (dragged.length === 1 && dragged[0] === index) continue;
        if (nearTop || nearBottom) {
            const at = nearTop ? index : index + 1;
            const lineY = nearTop ? band.box.top : band.box.bottom;
            return { target: { kind: "band", index: at }, box: { left, right, top: lineY - 1.5, bottom: lineY + 1.5 } };
        }
    }
    if (dragged.length === 1) {
        // A band only moves among the bands.
        const at = bands.filter((band) => (band.box.top + band.box.bottom) / 2 < y).length;
        const lineY = at < bands.length ? bands[at].box.top : bands[bands.length - 1].box.bottom;
        return { target: { kind: "band", index: at }, box: { left, right, top: lineY - 1.5, bottom: lineY + 1.5 } };
    }

    // Otherwise into the innermost band or group under the pointer, between the children either side.
    const containers = frames
        .filter((frame) => (frame.path.length === 1 || (frame.node && frame.node.type !== "block")) && !isWithin(frame.path, dragged))
        .filter((frame) => inside(frame.box, x, y, 2))
        .sort((a, b) => b.path.length - a.path.length);
    const container = containers[0];
    if (!container) return null;
    const axis = axisOf(container);
    const children = frames.filter((frame) => isParentOf(container.path, frame.path) && hasArea(frame.box));
    const centre = (frame: Frame) => (axis === "x" ? (frame.box.left + frame.box.right) / 2 : (frame.box.top + frame.box.bottom) / 2);
    const pointer = axis === "x" ? x : y;
    const before = children.filter((child) => centre(child) < pointer);
    const index = before.length > 0 ? before[before.length - 1].path[before[before.length - 1].path.length - 1] + 1 : children[0]?.path[children[0].path.length - 1] ?? 0;
    const prev = before[before.length - 1];
    const next = children.find((child) => centre(child) >= pointer);
    const box = container.box;
    if (axis === "x") {
        const lineX = prev && next ? (prev.box.right + next.box.left) / 2 : prev ? prev.box.right + 3 : next ? next.box.left - 3 : box.left + 6;
        return { target: { kind: "into", parent: container.path, index }, box: { left: lineX - 1.5, right: lineX + 1.5, top: box.top + 3, bottom: box.bottom - 3 } };
    }
    const lineY = prev && next ? (prev.box.bottom + next.box.top) / 2 : prev ? prev.box.bottom + 2 : next ? next.box.top - 2 : box.top + 4;
    return { target: { kind: "into", parent: container.path, index }, box: { left: box.left + 3, right: box.right - 3, top: lineY - 1.5, bottom: lineY + 1.5 } };
}

/** Between two side-by-side nodes that both have a width share: a handle to move the line between them. */
function findHandles(frames: Frame[]): Handle[] {
    const handles: Handle[] = [];
    for (const container of frames) {
        if (!(container.path.length === 1 || (container.node && container.node.type === "row"))) continue;
        const children = frames
            .filter((frame) => isParentOf(container.path, frame.path) && hasArea(frame.box))
            .sort((a, b) => a.box.left - b.box.left);
        for (let i = 0; i + 1 < children.length; i++) {
            const [a, b] = [children[i], children[i + 1]];
            if (a.node?.grow === undefined || b.node?.grow === undefined) continue;
            const x = (a.box.right + b.box.left) / 2;
            handles.push({ key: `${a.key}|${b.key}`, left: a, right: b, box: { left: x - 5, right: x + 5, top: container.box.top + 4, bottom: container.box.bottom - 4 } });
        }
    }
    return handles;
}

interface EditorCanvasProps {
    layout: Layout;
    host: FooterPreviewHost;
    selected: string | null;
    onSelect: (key: string | null) => void;
    onDrop: (from: LayoutPath, target: DropTarget) => void;
    onGrow: (changes: { path: LayoutPath; grow: number }[]) => void;
    /** Filled in for drags from outside the preview. */
    bridge?: MutableRefObject<CanvasBridge | null>;
}

/**
 * The footer as the UI draws it, with the editor's marks over it: a frame
 * around every band and node to select it with a click or drag it elsewhere,
 * a line showing where it would land, and handles between nodes that share
 * the width. Drawn inside the preview frame, so the footer is the real one.
 */
export default function EditorCanvas({ layout, host, selected, onSelect, onDrop, onGrow, bridge }: EditorCanvasProps) {
    const canvasRef = useRef<HTMLDivElement>(null);
    const ghostRef = useRef<HTMLDivElement>(null);
    const [outside, setOutside] = useState<Marker | null>(null);
    const [frames, setFrames] = useState<Frame[]>([]);
    const [empties, setEmpties] = useState<ReadonlySet<string>>(new Set());
    const [drag, setDrag] = useState<{ key: string; marker: Marker | null } | null>(null);
    const [resizing, setResizing] = useState<string | null>(null);

    const measure = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const origin = canvas.getBoundingClientRect();
        const next: Frame[] = [];
        const nextEmpty = new Set<string>();
        canvas.querySelectorAll<HTMLElement>("[data-fl-path]").forEach((element) => {
            const key = element.dataset.flPath!;
            const path = key.split(".").map(Number);
            const real = boxOf(element, true);
            if (!hasArea(real)) nextEmpty.add(key);
            const box = boxOf(element, false);
            if (!hasArea(box)) return;
            next.push({
                key,
                path,
                node: path.length > 1 ? nodeAt(layout, path) : undefined,
                box: { left: box.left - origin.left, top: box.top - origin.top, right: box.right - origin.left, bottom: box.bottom - origin.top },
            });
        });
        setFrames(next);
        setEmpties((prev) => (prev.size === nextEmpty.size && [...nextEmpty].every((key) => prev.has(key)) ? prev : nextEmpty));
    }, [layout]);

    useLayoutEffect(() => {
        measure();
        const canvas = canvasRef.current;
        if (!canvas) return;
        let frame = 0;
        const soon = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(measure);
        };
        const view = canvas.ownerDocument.defaultView!;
        const resize = new view.ResizeObserver(soon);
        resize.observe(canvas);
        const mutation = new view.MutationObserver(soon);
        mutation.observe(canvas.querySelector(".fle-content")!, { childList: true, subtree: true, characterData: true, attributes: true });
        return () => {
            cancelAnimationFrame(frame);
            resize.disconnect();
            mutation.disconnect();
        };
    }, [measure, empties]);

    const local = (event: ReactPointerEvent) => {
        const origin = canvasRef.current!.getBoundingClientRect();
        return { x: event.clientX - origin.left, y: event.clientY - origin.top };
    };

    // Drags from the palette, outside the frame, find their landing here.
    const framesRef = useRef(frames);
    framesRef.current = frames;
    useEffect(() => {
        if (!bridge) return;
        const at = (x: number, y: number) => {
            const origin = canvasRef.current!.getBoundingClientRect();
            return findDrop(framesRef.current, NEW_PIECE, x - origin.left, y - origin.top);
        };
        bridge.current = {
            over: (x, y) => setOutside(at(x, y)),
            drop: (x, y) => {
                setOutside(null);
                return at(x, y)?.target ?? null;
            },
            leave: () => setOutside(null),
        };
        return () => {
            bridge.current = null;
        };
    }, [bridge]);

    /** A copy of what is dragged, under the pointer: the piece itself, not just where it would go. */
    const showGhost = (frame: Frame, clientX: number, clientY: number, grab: { x: number; y: number }) => {
        const ghost = ghostRef.current;
        const source = canvasRef.current?.querySelector(`[data-fl-path="${frame.key}"]`);
        if (!ghost || !source) return;
        if (!ghost.firstChild) {
            source.childNodes.forEach((child) => {
                if (child instanceof Element && child.classList.contains("fle-placeholder")) return;
                const copy = child.cloneNode(true);
                // Not a piece of the layout: the measuring must not find it.
                if (copy instanceof Element) {
                    copy.removeAttribute("data-fl-path");
                    copy.querySelectorAll("[data-fl-path]").forEach((inner) => inner.removeAttribute("data-fl-path"));
                }
                ghost.appendChild(copy);
            });
            ghost.style.width = `${frame.box.right - frame.box.left}px`;
            ghost.style.display = "block";
        }
        ghost.style.left = `${clientX - grab.x}px`;
        ghost.style.top = `${clientY - grab.y}px`;
    };
    const hideGhost = () => {
        const ghost = ghostRef.current;
        if (!ghost) return;
        ghost.replaceChildren();
        ghost.style.display = "none";
    };

    const startDrag = (frame: Frame) => (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        const start = local(event);
        const grab = { x: start.x - frame.box.left, y: start.y - frame.box.top };
        const target = event.currentTarget;
        target.setPointerCapture(event.pointerId);
        let moved = false;
        let marker: Marker | null = null;
        const onMove = (move: PointerEvent) => {
            const origin = canvasRef.current!.getBoundingClientRect();
            const x = move.clientX - origin.left;
            const y = move.clientY - origin.top;
            if (!moved && Math.hypot(x - start.x, y - start.y) < 4) return;
            moved = true;
            marker = findDrop(frames, frame.path, x, y);
            showGhost(frame, move.clientX, move.clientY, grab);
            setDrag({ key: frame.key, marker });
        };
        const onUp = () => {
            target.removeEventListener("pointermove", onMove);
            target.removeEventListener("pointerup", onUp);
            target.removeEventListener("pointercancel", onUp);
            hideGhost();
            setDrag(null);
            if (!moved) onSelect(frame.key);
            else if (marker) onDrop(frame.path, marker.target);
        };
        target.addEventListener("pointermove", onMove);
        target.addEventListener("pointerup", onUp);
        target.addEventListener("pointercancel", onUp);
    };

    const startResize = (handle: Handle) => (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        const target = event.currentTarget;
        target.setPointerCapture(event.pointerId);
        const startX = event.clientX;
        const widthA = handle.left.box.right - handle.left.box.left;
        const widthB = handle.right.box.right - handle.right.box.left;
        const total = (handle.left.node?.grow ?? 1) + (handle.right.node?.grow ?? 1);
        setResizing(handle.key);
        const onMove = (move: PointerEvent) => {
            const share = (widthA + move.clientX - startX) / (widthA + widthB);
            const growA = Math.max(1, Math.min(total - 1, Math.round(share * total)));
            onGrow([{ path: handle.left.path, grow: growA }, { path: handle.right.path, grow: total - growA }]);
        };
        const onUp = () => {
            target.removeEventListener("pointermove", onMove);
            target.removeEventListener("pointerup", onUp);
            target.removeEventListener("pointercancel", onUp);
            setResizing(null);
        };
        target.addEventListener("pointermove", onMove);
        target.addEventListener("pointerup", onUp);
        target.addEventListener("pointercancel", onUp);
    };

    const decorate = ({ path, node, children }: { path: readonly number[]; node?: FooterNode; children: ReactNode }) => {
        const key = pathKey(path);
        return (
            <div className="fle-node" data-fl-path={key}>
                {children}
                {empties.has(key) && <span className="fle-placeholder">{nodeLabel(node, path[0])}</span>}
            </div>
        );
    };

    const ordered = [...frames].sort((a, b) => a.path.length - b.path.length);
    const style = (box: Box) => ({ left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top });
    const Frame = host.Frame;
    return (
        <FooterPreviewContext.Provider value>
            <style>{CANVAS_CSS}</style>
            <div className="fle-canvas" ref={canvasRef}>
                <div className="fle-content" style={{ display: "contents" }}>
                    <Frame>
                        <FooterLayout layout={layout} skin={host.skin} decorate={decorate} />
                        {/* Inside the frame, so the copy keeps the footer's look. */}
                        <div className="fle-ghost" ref={ghostRef} style={{ display: "none" }} />
                    </Frame>
                </div>
                <div className="fle-overlay" onPointerDown={() => onSelect(null)}>
                    {ordered.map((frame) => (
                        <div
                            key={frame.key}
                            className={`fle-frame${frame.path.length === 1 ? " fle-frame--band" : ""}${frame.key === selected ? " is-selected" : ""}${drag?.key === frame.key ? " is-dragged" : ""}`}
                            data-fl-frame={frame.key}
                            style={style(frame.box)}
                            onPointerDown={startDrag(frame)}
                        >
                            <span className="fle-tag">{nodeLabel(frame.node, frame.path[0])}</span>
                        </div>
                    ))}
                    {!drag && findHandles(frames).map((handle) => (
                        <div
                            key={handle.key}
                            className={`fle-handle${resizing === handle.key ? " is-active" : ""}`}
                            data-fl-handle={handle.key}
                            style={style(handle.box)}
                            onPointerDown={startResize(handle)}
                        />
                    ))}
                    {drag?.marker && <div className="fle-marker" style={style(drag.marker.box)} />}
                    {outside && <div className="fle-marker" style={style(outside.box)} />}
                </div>
            </div>
        </FooterPreviewContext.Provider>
    );
}
