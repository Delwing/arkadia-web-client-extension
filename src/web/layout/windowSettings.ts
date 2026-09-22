import { ensureFontLoaded, resolveOutputFontFamily } from '../fontLoader';
import {
  getBuiltInPanelSetting,
  getPopupSetting,
  setBuiltInPanelSetting,
  setPopupSetting,
  subscribeToPanelSetting,
} from './utils/layoutStorage';

/**
 * Per-window settings: what the settings cog in a window's header edits.
 *
 * Every window gets the shared appearance fields (font, font size); a window can
 * add its own fields through `WindowSettingField`. Values live in the window's
 * existing settings bag — `popupPanels[id].settings` for popups,
 * `builtInPanels[id].settings` for the built-in panels — so they persist and
 * sync with the rest of the layout, and a window's own `usePopupSetting` reads
 * the very same keys.
 */

/** Built-in panels keep their settings in `builtInPanels`, everything else in `popupPanels`. */
const BUILT_IN_WINDOW_IDS = new Set(['map', 'objectList']);

type SettingScope = 'popup' | 'builtIn';

function scopeOf(id: string): SettingScope {
  return BUILT_IN_WINDOW_IDS.has(id) ? 'builtIn' : 'popup';
}

export function getWindowSetting<T>(id: string, key: string, defaultValue: T): T {
  return scopeOf(id) === 'builtIn'
    ? getBuiltInPanelSetting(id, key, defaultValue)
    : getPopupSetting(id, key, defaultValue);
}

export function setWindowSetting<T>(id: string, key: string, value: T): void {
  if (scopeOf(id) === 'builtIn') setBuiltInPanelSetting(id, key, value);
  else setPopupSetting(id, key, value);
}

export function subscribeToWindowSetting(
  id: string,
  key: string,
  listener: (value: unknown) => void,
): () => void {
  return subscribeToPanelSetting(scopeOf(id), id, key, listener);
}

// ─── Window-specific fields ───────────────────────────────────────────────

interface WindowSettingFieldBase {
  /** Key in the window's settings bag — the same key its content reads. */
  key: string;
  label: string;
}

export interface WindowToggleField extends WindowSettingFieldBase {
  type: 'toggle';
  default: boolean;
  /** The stored flag is the opposite of what the label says ("Zawijaj" over `noWrap`). */
  inverted?: boolean;
}

export interface WindowSelectField extends WindowSettingFieldBase {
  type: 'select';
  default: string;
  options: { value: string; label: string }[];
}

export interface WindowNumberField extends WindowSettingFieldBase {
  type: 'number';
  default: number;
  min?: number;
  max?: number;
  step?: number;
}

export type WindowSettingField = WindowToggleField | WindowSelectField | WindowNumberField;

// ─── Appearance ───────────────────────────────────────────────────────────

/** Namespaced so they can never collide with a window's own setting keys. */
export const WINDOW_FONT_SIZE_KEY = 'window.fontSize';
export const WINDOW_FONT_FAMILY_KEY = 'window.fontFamily';

export type WindowFontFamily = 'default' | 'fira-code' | 'jetbrains-mono' | 'cascadia-mono' | 'vera-sans-mono';

export const WINDOW_FONT_FAMILY_OPTIONS: { value: WindowFontFamily; label: string }[] = [
  { value: 'default', label: 'Systemowa monospace' },
  { value: 'fira-code', label: 'Fira Code' },
  { value: 'jetbrains-mono', label: 'JetBrains Mono' },
  { value: 'cascadia-mono', label: 'Cascadia Mono' },
  { value: 'vera-sans-mono', label: 'Bitstream Vera Sans Mono' },
];

export const WINDOW_FONT_SIZE_MIN = 0.3;
export const WINDOW_FONT_SIZE_MAX = 3;
export const WINDOW_FONT_SIZE_STEP = 0.05;

/** Size override in rem, or null when the window follows the main window. */
export function getWindowFontSize(id: string): number | null {
  const v = getWindowSetting<unknown>(id, WINDOW_FONT_SIZE_KEY, null);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Font override, or null when the window follows the main window. */
export function getWindowFontFamily(id: string): WindowFontFamily | null {
  const v = getWindowSetting<unknown>(id, WINDOW_FONT_FAMILY_KEY, null);
  return WINDOW_FONT_FAMILY_OPTIONS.some(o => o.value === v) ? (v as WindowFontFamily) : null;
}

/**
 * Write a window's font overrides onto the element that wraps its content.
 *
 * `--output-font-*` is what popup content already reads, so re-declaring it here
 * overrides the main window's value for this window alone; `--window-font-*` is
 * set too for content whose own default is not the main output font (Kondycje
 * falls back to its objects font size). Custom properties inherit through the
 * `display: contents` portal target, and the element travels with the window
 * into docks, tabs and popped-out windows.
 */
export function applyWindowAppearance(target: HTMLElement, id: string): void {
  const size = getWindowFontSize(id);
  const family = getWindowFontFamily(id);
  const style = target.style;
  if (size !== null) {
    style.setProperty('--output-font-size', `${size}rem`);
    style.setProperty('--window-font-size', `${size}rem`);
  } else {
    style.removeProperty('--output-font-size');
    style.removeProperty('--window-font-size');
  }
  if (family !== null) {
    // The main window only loads the font it uses itself.
    ensureFontLoaded(family);
    const css = resolveOutputFontFamily(family, '') ?? 'monospace';
    style.setProperty('--output-font-family', css);
    style.setProperty('--window-font-family', css);
  } else {
    style.removeProperty('--output-font-family');
    style.removeProperty('--window-font-family');
  }
}
