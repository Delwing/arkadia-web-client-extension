// ─── Per-shell chrome overrides for the built-in panels ───────────────────
// The built-in objectList panel defaults to the stock "Kondycje" title and the
// stock header actions (the "Lista" mode toggle + timers menu). A shell that
// replaces the panel body (forge-ui swaps in its forged "W poblizu" panel via
// LayoutManagerWrapper.renderObjectList) can also retitle the header and drop the
// stock actions here. This is process-local module state — NOT persisted — so
// the shared layoutManagerState (and therefore the stock UI) is untouched.

export interface ObjectListChrome {
  /** Header title override (default "Kondycje" from PANEL_CONFIGS). */
  title?: string;
  /** When true, the stock ObjectListHeaderActions are not rendered. */
  hideStockActions?: boolean;
}

let objectListChrome: ObjectListChrome = {};

export function setObjectListChrome(chrome: ObjectListChrome): void {
  objectListChrome = { ...chrome };
}

export function getObjectListChrome(): ObjectListChrome {
  return objectListChrome;
}
