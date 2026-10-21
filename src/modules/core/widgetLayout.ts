import { globalStorage } from "./storage";
import type { WidgetCorner } from "./widgetRegistry";

/**
 * The widgets placed on screen, persisted as `widgetLayout`, plus the edit mode
 * in which they can be dragged. A widget is pinned to a corner of the output
 * area at an offset from it, so it keeps its corner when the window or the docks
 * change size. Several instances of one type are fine (a clock for each domain).
 *
 * An instance whose type is not registered (a plugin that is not loaded) is kept,
 * so it comes back with its plugin.
 */
export interface WidgetInstance {
  id: string;
  type: string;
  corner: WidgetCorner;
  /** Distance in px from the corner's vertical edge. */
  dx: number;
  /** Distance in px from the corner's horizontal edge. */
  dy: number;
  /** Size multiplier; 1 when absent. */
  scale?: number;
  /** 0..1; 1 when absent. */
  opacity?: number;
  settings?: Record<string, string>;
}

const CORNERS: WidgetCorner[] = ["tl", "tr", "bl", "br"];
/** Gap from the corner for a new widget, and between widgets stacked there. */
const NEW_OFFSET = 12;
const STACK_STEP = 48;

function isInstance(value: unknown): value is WidgetInstance {
  const v = value as WidgetInstance | null;
  return !!v && typeof v.id === "string" && typeof v.type === "string"
    && CORNERS.includes(v.corner) && Number.isFinite(v.dx) && Number.isFinite(v.dy);
}

function read(): WidgetInstance[] {
  const raw = globalStorage.get("widgetLayout");
  return Array.isArray(raw) ? raw.filter(isInstance) : [];
}

let snapshot: WidgetInstance[] = read();
let editing = false;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

// Another tab, a sync or an import replaced the layout.
globalStorage.onChange("widgetLayout", () => {
  snapshot = read();
  emit();
});

function write(next: WidgetInstance[]): void {
  globalStorage.set("widgetLayout", next);
}

/** Stable reference until the next change (safe for useSyncExternalStore). */
export function getWidgetInstances(): WidgetInstance[] {
  return snapshot;
}

export function subscribeWidgets(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Place a new widget in `corner`, below (or above) any already there. Returns its id. */
export function addWidget(type: string, corner: WidgetCorner = "tr"): string {
  const id = `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const taken = snapshot.filter((w) => w.corner === corner).length;
  write([...snapshot, { id, type, corner, dx: NEW_OFFSET, dy: NEW_OFFSET + taken * STACK_STEP }]);
  return id;
}

export function updateWidget(id: string, changes: Partial<Omit<WidgetInstance, "id" | "type">>): void {
  if (!snapshot.some((w) => w.id === id)) return;
  write(snapshot.map((w) => (w.id === id ? { ...w, ...changes } : w)));
}

export function setWidgetSetting(id: string, key: string, value: string): void {
  const widget = snapshot.find((w) => w.id === id);
  if (!widget) return;
  updateWidget(id, { settings: { ...widget.settings, [key]: value } });
}

export function removeWidget(id: string): void {
  if (!snapshot.some((w) => w.id === id)) return;
  write(snapshot.filter((w) => w.id !== id));
}

export function isWidgetEditMode(): boolean {
  return editing;
}

/** Turn edit mode on or off; without an argument, toggle it. */
export function setWidgetEditMode(on: boolean = !editing): void {
  if (on === editing) return;
  editing = on;
  emit();
}
