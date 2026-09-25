/**
 * Which pair of edge docks spans the shell — the user's choice, per shell.
 *
 * `spanningDocks` lives in the shared `layoutManagerState`, but the two shells
 * want different defaults (stock: top/bottom span the width; forge: the side
 * rails span the height) and look different enough that one choice should not
 * flip the other. So each shell keeps its own preference in a small per-device
 * key and applies it as a process-local layout override (see
 * setLayoutOverrides): the page reads it as the layout's `spanningDocks`, while
 * the persisted shared field is never written.
 */
import type { SpanningDocks } from '../types';
import {
  getLayoutOverrides,
  isRailSpanSupported,
  setLayoutOverrides,
  setRailSpanSupported,
} from './layoutStorage';

const STORAGE_KEY = 'dockArrangement';

let shellScope: string | null = null;
let shellDefault: SpanningDocks = 'topBottom';

function isSpanningDocks(value: unknown): value is SpanningDocks {
  return value === 'topBottom' || value === 'leftRight';
}

function readStored(): Record<string, SpanningDocks> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Record<string, SpanningDocks> = {};
    for (const [shell, value] of Object.entries(parsed)) {
      if (isSpanningDocks(value)) result[shell] = value;
    }
    return result;
  } catch {
    return {};
  }
}

function applyOverride(arrangement: SpanningDocks): void {
  setLayoutOverrides({ ...getLayoutOverrides(), spanningDocks: arrangement });
}

/**
 * Declare that this shell renders both arrangements (it provides the
 * `#layout-left/right-dock-host` elements) and apply the stored choice. Call
 * after any other setLayoutOverrides, before the first LayoutProvider mount.
 */
export function initDockArrangement(shell: string, defaultArrangement: SpanningDocks): void {
  shellScope = shell;
  shellDefault = defaultArrangement;
  setRailSpanSupported(true);
  applyOverride(getDockArrangement());
}

/** True when the running shell lets the user pick the arrangement. */
export function isDockArrangementSwitchable(): boolean {
  return shellScope !== null && isRailSpanSupported();
}

/** The running shell's arrangement: the stored choice, else its default. */
export function getDockArrangement(): SpanningDocks {
  if (shellScope === null) return shellDefault;
  return readStored()[shellScope] ?? shellDefault;
}

/**
 * Store the running shell's arrangement and apply it to this page. Callers
 * then emit `layoutManagerStateChanged` so the layout reloads with it.
 */
export function setDockArrangement(arrangement: SpanningDocks): void {
  if (shellScope === null) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readStored(), [shellScope]: arrangement }));
  } catch {
    // Storage blocked: the choice still holds for this page.
  }
  applyOverride(arrangement);
}
