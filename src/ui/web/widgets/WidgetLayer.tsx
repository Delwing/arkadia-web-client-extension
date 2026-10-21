import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Move, Plus, Trash2 } from "lucide-react";
import eventBus from "@modules/core/eventBus";
import {
  addWidget,
  getWidgetInstances,
  isWidgetEditMode,
  removeWidget,
  setWidgetEditMode,
  setWidgetSetting,
  subscribeWidgets,
  updateWidget,
  type WidgetInstance,
} from "@modules/core/widgetLayout.ts";
import {
  getWidgetTypes,
  resolveWidgetSettings,
  subscribeWidgetTypes,
  type WidgetType,
} from "@modules/core/widgetRegistry.ts";
import { showContextMenu, type ContextMenuEntry } from "@web/contextMenu/index.ts";
import { Button } from "../primitives";
import { anchorAt, widgetPosition, type Rect, type Size } from "./widgetGeometry";
import "./widgets.css";

const SCALES: { value: number; label: string }[] = [
  { value: 0.8, label: "Mały" },
  { value: 1, label: "Średni" },
  { value: 1.25, label: "Duży" },
];

const OPACITIES: { value: number; label: string }[] = [
  { value: 1, label: "100%" },
  { value: 0.8, label: "80%" },
  { value: 0.6, label: "60%" },
  { value: 0.4, label: "40%" },
];

/** Pointer travel before a press in edit mode becomes a drag. */
const DRAG_THRESHOLD = 3;

function sameRect(a: Rect, b: Rect): boolean {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

/** The output area's place on screen, following window resizes and dock changes. */
function useAreaRect(getArea: () => HTMLElement | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const el = getArea();
        if (!el) return;
        const r = el.getBoundingClientRect();
        const next = { left: r.left, top: r.top, width: r.width, height: r.height };
        setRect((prev) => (prev && sameRect(prev, next) ? prev : next));
      });
    };
    measure();
    const el = getArea();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (el) observer?.observe(el);
    // A dock opening on the left moves the output without resizing it.
    observer?.observe(document.body);
    window.addEventListener("resize", measure);
    const offLayout = eventBus.on("layoutManagerStateChanged", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      offLayout?.();
    };
  }, [getArea]);

  return rect;
}

/** Adopts a plugin widget's own element into the frame. */
function NodeHost({ node }: { node: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (host && node.parentNode !== host) host.appendChild(node);
    return () => {
      if (node.parentNode) node.parentNode.removeChild(node);
    };
  }, [node]);
  return <div ref={ref} className="widget-node-host" />;
}

function widgetMenu(widget: WidgetInstance, type: WidgetType | undefined, editing: boolean): ContextMenuEntry[] {
  const items: ContextMenuEntry[] = [];
  const settings = resolveWidgetSettings(type, widget.settings);
  for (const option of type?.options ?? []) {
    for (const choice of option.choices) {
      items.push({
        section: option.label,
        label: choice.label,
        checked: settings[option.key] === choice.value,
        action: () => setWidgetSetting(widget.id, option.key, choice.value),
      });
    }
  }
  const scale = widget.scale ?? 1;
  for (const choice of SCALES) {
    items.push({
      section: "Rozmiar",
      label: choice.label,
      checked: scale === choice.value,
      action: () => updateWidget(widget.id, { scale: choice.value }),
    });
  }
  const opacity = widget.opacity ?? 1;
  for (const choice of OPACITIES) {
    items.push({
      section: "Krycie",
      label: choice.label,
      checked: opacity === choice.value,
      action: () => updateWidget(widget.id, { opacity: choice.value }),
    });
  }
  items.push(
    {
      section: "Widżety",
      label: "Przesuwaj widżety",
      icon: Move,
      checked: editing,
      hint: editing ? "Esc" : undefined,
      action: () => setWidgetEditMode(!editing),
    },
    {
      section: "Widżety",
      label: "Usuń",
      icon: Trash2,
      tone: "danger",
      action: () => removeWidget(widget.id),
    },
  );
  return items;
}

interface WidgetFrameProps {
  widget: WidgetInstance;
  type: WidgetType | undefined;
  area: Rect;
  editing: boolean;
}

function WidgetFrame({ widget, type, area, editing }: WidgetFrameProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [dragPos, setDragPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const next = { width: el.offsetWidth, height: el.offsetHeight };
      setSize((prev) => (prev && prev.width === next.width && prev.height === next.height ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const label = type?.label ?? `Niedostępny: ${widget.type}`;
  const settings = resolveWidgetSettings(type, widget.settings);
  const position = size ? widgetPosition(widget, area, size) : null;
  const shown = dragPos ?? position;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!editing || e.button !== 0 || !position || !size) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let last: { left: number; top: number } | null = null;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!last && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
      last = { left: position.left + dx, top: position.top + dy };
      setDragPos(last);
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      setDragPos(null);
      if (last) updateWidget(widget.id, anchorAt(last.left, last.top, size, area));
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu(widgetMenu(widget, type, editing), e.clientX, e.clientY, { header: label, smallHeader: true });
  };

  let content: React.ReactNode = null;
  if (type?.render) content = type.render(settings);
  else if (type?.node) content = <NodeHost node={type.node} />;

  const className = [
    "widget-frame",
    editing ? "is-editing" : "",
    dragPos ? "is-dragging" : "",
    type ? "" : "is-missing",
  ].filter(Boolean).join(" ");

  return (
    <div
      ref={ref}
      className={className}
      data-widget-id={widget.id}
      data-widget-type={widget.type}
      data-corner={widget.corner}
      style={{
        left: shown?.left ?? area.left,
        top: shown?.top ?? area.top,
        opacity: widget.opacity ?? 1,
        // Hidden until measured, so it never flashes at the area's corner.
        visibility: shown ? undefined : "hidden",
      }}
      onPointerDown={onPointerDown}
      onContextMenu={onContextMenu}
    >
      <div className="widget-frame__body" data-label={label} style={{ zoom: widget.scale ?? 1 }}>
        {content}
      </div>
    </div>
  );
}

function showAddMenu(types: WidgetType[], placed: WidgetInstance[], x: number, y: number): void {
  const items: ContextMenuEntry[] = types.map((type) => {
    // A plugin widget is one element: a second copy would have nothing to show.
    const single = !!type.node && placed.some((w) => w.type === type.id);
    return {
      label: type.label,
      icon: Plus,
      detail: single ? "już jest na ekranie" : type.source === "plugin" ? "wtyczka" : undefined,
      action: () => {
        if (!single) addWidget(type.id, type.defaultCorner);
      },
    };
  });
  if (items.length === 0) items.push({ label: "Brak widżetów", action: () => {} });
  showContextMenu(items, x, y, { header: "Dodaj widżet", smallHeader: true });
}

/**
 * Widgets: small frameless pieces (a clock, the vitals, the exit compass, a
 * plugin's own) laid over the game output wherever the player puts them. Each
 * is pinned to a corner of the output area (see widgetLayout), so it stays put
 * in that corner when the window or the docks change size.
 *
 * At rest a widget only answers a right-click, with its own settings, size,
 * opacity and Usuń. "Przesuwaj widżety" (that menu, the main menu or /widzety)
 * outlines them all for dragging and shows the Dodaj / Gotowe bar; Esc leaves.
 *
 * Portals itself to document.body; `getArea` is the element the widgets sit
 * over (the stock UI's #main_text_output_msg_wrapper).
 */
export function WidgetLayer({ getArea }: { getArea: () => HTMLElement | null }) {
  const widgets = useSyncExternalStore(subscribeWidgets, getWidgetInstances);
  const editing = useSyncExternalStore(subscribeWidgets, isWidgetEditMode);
  const types = useSyncExternalStore(subscribeWidgetTypes, getWidgetTypes);
  const area = useAreaRect(getArea);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setWidgetEditMode(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editing]);

  const onAdd = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    showAddMenu(types, widgets, r.left, r.bottom + 4);
  }, [types, widgets]);

  if (!area) return null;
  const shownNodes = new Set<string>();

  return createPortal(
    <div className={`widget-layer${editing ? " is-editing" : ""}`}>
      {editing && (
        <div
          className="widget-outline"
          style={{ left: area.left, top: area.top, width: area.width, height: area.height }}
        />
      )}
      {widgets.map((widget) => {
        const type = types.find((t) => t.id === widget.type);
        // A plugin's widget waits, out of sight, for its plugin to come back.
        if (!type && !editing) return null;
        // A plugin widget is one element, so it can only be in one place.
        if (type?.node) {
          if (shownNodes.has(type.id)) return null;
          shownNodes.add(type.id);
        }
        return <WidgetFrame key={widget.id} widget={widget} type={type} area={area} editing={editing} />;
      })}
      {editing && (
        <div className="widget-toolbar" style={{ left: area.left + area.width / 2, top: area.top + 8 }}>
          <span className="widget-toolbar__title">Widżety</span>
          <Button size="sm" onClick={onAdd} data-widget-add>
            <Plus size={14} /> Dodaj
          </Button>
          <Button size="sm" variant="solid" onClick={() => setWidgetEditMode(false)} data-widget-done>
            Gotowe
          </Button>
        </div>
      )}
    </div>,
    document.body,
  );
}
