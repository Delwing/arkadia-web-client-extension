import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { sanitizeFooterLayout } from "@shared/footerLayoutSanitize";
import type { FooterBlockId, FooterLayout } from "@shared/footerLayoutTypes";
import { Button, DeleteButton, Dialog, Notice, TextArea } from "@web-ui/primitives/index.ts";
import {
    insertBand,
    insertNode,
    layoutWarnings,
    moveBandTo,
    moveNode,
    moveToNewBand,
    nodeAt,
    pruneLayout,
    removeBand,
    removeNode,
    settle,
    unwrapNode,
    updateNode,
    wrapNode,
    type LayoutPath,
} from "@web-ui/footer/layout/layoutEdit.ts";
import { getFooterPreviewHost } from "@web-ui/footer/layout/previewHost.ts";
import EditorCanvas, { type CanvasBridge, type DropTarget } from "./EditorCanvas";
import NodeFields, { BLOCK_NAMES, NEW_BLOCKS, nodeLabel } from "./NodeFields";
import PreviewFrame from "./PreviewFrame";
import "./footerEditor.css";

const toPath = (key: string): LayoutPath => key.split(".").map(Number);

interface FooterLayoutDialogProps {
    initial: FooterLayout;
    onDone: (layout: FooterLayout) => void;
    onCancel: () => void;
}

/**
 * The footer layout editor: the footer itself, drawn by the UI in use, to
 * click a piece of and drag it where it should go - beside another, into a
 * row or column, onto a band's edge for a band of its own - with the handle
 * between two pieces sharing the width to set their shares. The selected
 * piece's settings are below, with what to add. "Gotowe" hands the layout to
 * the settings, which save it.
 */
export default function FooterLayoutDialog({ initial, onDone, onCancel }: FooterLayoutDialogProps) {
    const host = useMemo(() => getFooterPreviewHost(), []);
    const [layout, setLayout] = useState(initial);
    const [selected, setSelected] = useState<string | null>(null);
    const [json, setJson] = useState<string | null>(null);
    const [jsonError, setJsonError] = useState<string | null>(null);
    const bridge = useRef<CanvasBridge | null>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const layoutRef = useRef(layout);
    layoutRef.current = layout;
    /** A palette piece on its way to the preview, drawn under the pointer. */
    const [carried, setCarried] = useState<{ id: FooterBlockId; x: number; y: number } | null>(null);
    const droppedRef = useRef(false);

    const path = selected ? toPath(selected) : null;
    const node = path && path.length > 1 ? nodeAt(layout, path) : undefined;
    const isBand = path?.length === 1 && path[0] < layout.bands.length;
    const warnings = useMemo(() => layoutWarnings(layout), [layout]);

    const apply = (next: FooterLayout, nextPath?: LayoutPath | null) => {
        setLayout(next);
        if (nextPath !== undefined) setSelected(nextPath ? nextPath.join(".") : null);
    };

    const drop = (from: LayoutPath, target: DropTarget) => {
        if (from.length === 1) {
            if (target.kind !== "band") return;
            const to = target.index > from[0] ? target.index - 1 : target.index;
            apply(moveBandTo(layout, from[0], target.index), [to]);
            return;
        }
        const moved = target.kind === "band"
            ? moveToNewBand(layout, from, target.index)
            : moveNode(layout, from, target.parent, target.index);
        if (!moved) return;
        const tidy = settle(moved);
        apply(tidy.layout, tidy.path);
    };

    const grow = (changes: { path: LayoutPath; grow: number }[]) =>
        setLayout((current) => changes.reduce((next, change) => updateNode(next, change.path, (n) => ({ ...n, grow: change.grow })), current));

    /** A new piece goes into the selected band or group, after the selected piece, or into a band of its own. */
    const add = (id: FooterBlockId) => {
        const block = NEW_BLOCKS[id];
        if (!path) {
            apply(insertBand(layout, layout.bands.length, block), [layout.bands.length, 0]);
        } else if (path.length === 1) {
            const at = layout.bands[path[0]].children.length;
            apply(insertNode(layout, path, at, block), [...path, at]);
        } else if (node && node.type !== "block") {
            apply(insertNode(layout, path, node.children.length, block), [...path, node.children.length]);
        } else {
            const parent = path.slice(0, -1);
            const at = path[path.length - 1] + 1;
            apply(insertNode(layout, parent, at, block), [...parent, at]);
        }
    };

    /** A new piece dropped where the preview says. */
    const place = (id: FooterBlockId, target: DropTarget) => {
        const current = layoutRef.current;
        const block = NEW_BLOCKS[id];
        if (target.kind === "band") apply(insertBand(current, target.index, block), [target.index, 0]);
        else apply(insertNode(current, target.parent, target.index, block), [...target.parent, target.index]);
    };

    /**
     * Dragging a piece from the palette onto the preview. The frame stops taking
     * the pointer for the drag, so the moves stay here and are handed to the
     * preview, which shows where the piece would land.
     */
    const startCarry = (id: FooterBlockId) => (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) return;
        const frame = stageRef.current?.querySelector("iframe");
        if (!frame) return;
        const startX = event.clientX;
        const startY = event.clientY;
        let carrying = false;
        droppedRef.current = false;
        const insideFrame = (x: number, y: number) => {
            const box = frame.getBoundingClientRect();
            return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom ? { x: x - box.left, y: y - box.top } : null;
        };
        const onMove = (move: PointerEvent) => {
            if (!carrying && Math.hypot(move.clientX - startX, move.clientY - startY) < 4) return;
            carrying = true;
            frame.style.pointerEvents = "none";
            setCarried({ id, x: move.clientX, y: move.clientY });
            const at = insideFrame(move.clientX, move.clientY);
            if (at) bridge.current?.over(at.x, at.y);
            else bridge.current?.leave();
        };
        const onUp = (up: PointerEvent) => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            document.removeEventListener("pointercancel", onUp);
            frame.style.pointerEvents = "";
            setCarried(null);
            if (!carrying) return;
            // The click that follows this release is not an "add".
            droppedRef.current = true;
            const at = insideFrame(up.clientX, up.clientY);
            const target = at ? bridge.current?.drop(at.x, at.y) : null;
            bridge.current?.leave();
            if (target) place(id, target);
        };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointercancel", onUp);
    };

    const remove = () => {
        if (!path) return;
        if (path.length === 1) apply(pruneLayout(removeBand(layout, path[0])), null);
        else apply(pruneLayout(removeNode(layout, path)), null);
    };

    const importJson = () => {
        let parsed: unknown;
        try {
            parsed = JSON.parse(json ?? "");
        } catch {
            setJsonError("To nie jest poprawny JSON.");
            return;
        }
        const clean = sanitizeFooterLayout(parsed);
        if (!clean) {
            setJsonError("W tym układzie nie ma nic, co stopka umie pokazać.");
            return;
        }
        setJson(null);
        setJsonError(null);
        apply(clean, null);
    };

    return (
        <Dialog
            title="Edytor stopki"
            size="xl"
            onClose={onCancel}
            className="footer-editor-dialog"
            footer={
                <>
                    <Button variant="ghost" onClick={onCancel}>Anuluj</Button>
                    <Button variant="solid" id="fle-done" onClick={() => onDone(pruneLayout(layout))}>Gotowe</Button>
                </>
            }
        >
            <div className="footer-editor">
                <div className="footer-editor__stage" ref={stageRef}>
                    <PreviewFrame title="Podgląd stopki">
                        <EditorCanvas
                            layout={layout}
                            host={host}
                            selected={selected}
                            onSelect={setSelected}
                            onDrop={drop}
                            onGrow={grow}
                            bridge={bridge}
                        />
                    </PreviewFrame>
                </div>
                <div className="footer-editor__palette">
                    <span className="footer-editor__label">Przeciągnij na stopkę:</span>
                    {(Object.keys(BLOCK_NAMES) as FooterBlockId[]).map((id) => (
                        <button
                            key={id}
                            type="button"
                            className="footer-editor__piece"
                            id={`fle-add-${id}`}
                            title="Przeciągnij na stopkę albo kliknij, by dodać obok zaznaczonego"
                            onPointerDown={startCarry(id)}
                            onClick={() => {
                                if (droppedRef.current) droppedRef.current = false;
                                else add(id);
                            }}
                        >
                            {BLOCK_NAMES[id]}
                        </button>
                    ))}
                </div>
                <p className="popup-field__hint">
                    Kliknij element, by go wybrać; przeciągnij, by przenieść – na górną lub dolną krawędź pasa, by dostał pas dla siebie.
                    Uchwyt między elementami o udziale szerokości zmienia ich proporcje.
                </p>
                {carried && (
                    <div className="footer-editor__carried" style={{ left: carried.x, top: carried.y }}>{BLOCK_NAMES[carried.id]}</div>
                )}

                <div className="footer-editor__panels">
                    <section className="footer-editor__panel" id="fle-props">
                        {!path || (!node && !isBand) ? (
                            <p className="popup-field__hint">Wybierz element w podglądzie, by go ustawić.</p>
                        ) : (
                            <>
                                <div className="footer-editor__panel-head">
                                    <span className="footer-editor__title">{nodeLabel(node, path[0])}</span>
                                    <span className="footer-editor__actions">
                                        {node && (
                                            <>
                                                <Button size="sm" id="fle-wrap-row" title="Otocz wierszem: dzieci obok siebie" onClick={() => apply(wrapNode(layout, path, "row"), path)}>W wiersz</Button>
                                                <Button size="sm" id="fle-wrap-column" title="Otocz kolumną: dzieci jedno pod drugim" onClick={() => apply(wrapNode(layout, path, "column"), path)}>W kolumnę</Button>
                                                {node.type !== "block" && (
                                                    <Button size="sm" id="fle-unwrap" onClick={() => apply(unwrapNode(layout, path), null)}>Rozgrupuj</Button>
                                                )}
                                            </>
                                        )}
                                        <DeleteButton id="fle-remove" title={node ? "Usuń element" : "Usuń pas"} onClick={remove} disabled={!node && layout.bands.length < 2} />
                                    </span>
                                </div>
                                {node
                                    ? <NodeFields node={node} onChange={(next) => apply(updateNode(layout, path, () => next))} />
                                    : <p className="popup-field__hint">Pas to jeden wiersz stopki, od lewej do prawej. Przeciągnij go za ramkę, by zmienić kolejność pasów.</p>}
                            </>
                        )}
                    </section>

                    <section className="footer-editor__panel">
                        {warnings.length > 0 && (
                            <Notice variant="warning">
                                <ul className="footer-editor__warnings">
                                    {warnings.map((warning) => <li key={warning}>{warning}</li>)}
                                </ul>
                            </Notice>
                        )}
                        <div className="footer-editor__actions">
                            <Button size="sm" id="fle-export" onClick={() => { setJsonError(null); setJson(JSON.stringify(pruneLayout(layout), null, 2)); }}>Eksportuj JSON</Button>
                            <Button size="sm" id="fle-import-open" onClick={() => { setJsonError(null); setJson(""); }}>Importuj JSON</Button>
                        </div>
                        {json !== null && (
                            <>
                                <TextArea id="fle-json" rows={8} mono value={json} onChange={(e) => setJson(e.target.value)} />
                                <div className="footer-editor__actions">
                                    <Button size="sm" variant="solid" id="fle-import" onClick={importJson}>Wczytaj ten układ</Button>
                                    <Button size="sm" variant="ghost" onClick={() => { setJson(null); setJsonError(null); }}>Zamknij</Button>
                                </div>
                                {jsonError && <Notice variant="danger">{jsonError}</Notice>}
                            </>
                        )}
                    </section>
                </div>
            </div>
        </Dialog>
    );
}
