import { ensureFontLoaded, resolveOutputFontFamily } from '../fontLoader';
import { globalStorage } from '@modules/core/storage.ts';
import {
  getBuiltInPanelSetting,
  getPopupSetting,
  setBuiltInPanelSetting,
  setPopupSetting,
  subscribeToPanelSetting,
} from './utils/layoutStorage';
import { OBJECT_LIST_OTHERS_ID } from './types';

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
const BUILT_IN_WINDOW_IDS = new Set(['map', 'objectList', OBJECT_LIST_OTHERS_ID]);

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
export const WINDOW_BACKGROUND_KEY = 'window.background';

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

// ─── Background ───────────────────────────────────────────────────────────

const HEX_BACKGROUND = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

/**
 * A background as stored: `#rrggbb`, or `#rrggbbaa` when not fully opaque.
 * Null for anything else.
 */
export function normalizeWindowBackground(value: unknown): string | null {
  if (typeof value !== 'string' || !HEX_BACKGROUND.test(value)) return null;
  const v = value.toLowerCase();
  return v.length === 9 && v.endsWith('ff') ? v.slice(0, 7) : v;
}

/** Colour and opacity (0–1) of a stored background. */
export function splitWindowBackground(value: string): { color: string; alpha: number } {
  return {
    color: value.slice(0, 7),
    alpha: value.length === 9 ? parseInt(value.slice(7), 16) / 255 : 1,
  };
}

/** The stored form of a colour and an opacity (0–1). */
export function joinWindowBackground(color: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return normalizeWindowBackground(`${color}${a.toString(16).padStart(2, '0')}`) ?? color;
}

/** Background override, or null when the window keeps the theme's background. */
export function getWindowBackground(id: string): string | null {
  return normalizeWindowBackground(getWindowSetting<unknown>(id, WINDOW_BACKGROUND_KEY, null));
}

/** A stored background as a plain CSS colour. */
export function windowBackgroundRgba(value: string): string {
  const { color, alpha } = splitWindowBackground(value);
  if (alpha === 1) return color;
  const n = parseInt(color.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.round(alpha * 1000) / 1000})`;
}

/**
 * The unitless main-window size a window follows until overridden, published
 * on <body> by uiSettingsCore.apply: Kondycje follows the objects font size,
 * everything else the output font size.
 */
function mainSizeVar(id: string): string {
  return id === 'objectList' || id === OBJECT_LIST_OTHERS_ID
    ? '--objects-font-size-value'
    : '--output-font-size-value';
}

/** An inline px font size that follows the window's font size setting. */
export function windowFontPx(px: number): string {
  return `calc(${px}px * var(--window-font-scale, 1))`;
}

/** Inline monospace that follows the window's font setting. */
export const WINDOW_MONOSPACE = 'var(--window-font-family, monospace)';

/** Font stacks a window's chosen face replaces, so content in any of them follows it. */
const FAMILY_VARS = ['--output-font-family', '--window-font-family', '--font-ui', '--font-mono'];

/**
 * Write a window's font overrides onto the element that wraps its content.
 *
 * `--output-font-*` is what popup content already reads, so re-declaring it here
 * overrides the main window's value for this window alone; `--window-font-*` is
 * set too for content whose own default is not the main output font (Kondycje
 * falls back to its objects font size).
 *
 * Content sized in fixed rem/px multiplies by `--window-font-scale` (the
 * override over the main size; unset, so 1, when not overridden), and content
 * in a face of its own reads `--window-font-family`. `font-family` and the UI
 * and mono stacks are re-declared so everything else inherits the chosen face.
 *
 * A background override is painted by the shell's content slot
 * (useWindowBackground; a `display: contents` element paints nothing). Content
 * that paints its own surfaces with `--popup-bg` gets the colour when it is
 * opaque, and nothing when it is translucent, so the window really is
 * see-through (popups.css gives floating surfaces their theme colour back).
 *
 * Custom properties inherit through the `display: contents` portal target, and
 * the element travels with the window into docks, tabs and popped-out windows.
 */
export function applyWindowAppearance(target: HTMLElement, id: string): void {
  const size = getWindowFontSize(id);
  const family = getWindowFontFamily(id);
  const background = getWindowBackground(id);
  const style = target.style;
  if (size !== null) {
    style.setProperty('--output-font-size', `${size}rem`);
    style.setProperty('--window-font-size', `${size}rem`);
    style.setProperty('--window-font-scale', `calc(${size} / var(${mainSizeVar(id)}, 0.875))`);
  } else {
    style.removeProperty('--output-font-size');
    style.removeProperty('--window-font-size');
    style.removeProperty('--window-font-scale');
  }
  if (family !== null) {
    // The main window only loads the font it uses itself.
    ensureFontLoaded(family);
    const css = resolveOutputFontFamily(family, '') ?? 'monospace';
    for (const name of FAMILY_VARS) style.setProperty(name, css);
    style.fontFamily = css;
  } else {
    for (const name of FAMILY_VARS) style.removeProperty(name);
    style.removeProperty('font-family');
  }
  if (background !== null) {
    const { color, alpha } = splitWindowBackground(background);
    style.setProperty('--popup-bg', alpha === 1 ? color : 'transparent');
  } else {
    style.removeProperty('--popup-bg');
  }
}

// ─── Migration ────────────────────────────────────────────────────────────

const LEGACY_OBJECT_LIST_COLOR = 'objectListBackgroundColor';
const LEGACY_OBJECT_LIST_ALPHA = 'objectListBackgroundAlpha';
/** The old setting's default, 40% black: left behind, so the window shows the theme's background like any other. */
const LEGACY_OBJECT_LIST_DEFAULT = '#00000066';

/**
 * The Kondycje background used to be a general setting (uiSettings
 * objectListBackgroundColor + objectListBackgroundAlpha); it now lives in the
 * window's own settings, set from its settings cog. A customised value moves
 * to both Kondycje windows unless they already have one, and the old fields
 * are dropped. Gated on the old fields alone, so a settings bundle imported
 * from an older version is picked up on the next load too.
 */
export function migrateObjectListBackground(): void {
  try {
    const ui = globalStorage.get('uiSettings') as unknown as Record<string, unknown> | null | undefined;
    if (!ui || typeof ui !== 'object') return;
    if (!(LEGACY_OBJECT_LIST_COLOR in ui) && !(LEGACY_OBJECT_LIST_ALPHA in ui)) return;
    const color = normalizeWindowBackground(ui[LEGACY_OBJECT_LIST_COLOR])?.slice(0, 7) ?? '#000000';
    const rawAlpha = ui[LEGACY_OBJECT_LIST_ALPHA];
    const alpha = typeof rawAlpha === 'number' && rawAlpha >= 0 && rawAlpha <= 1 ? rawAlpha : 0.4;
    const legacy = joinWindowBackground(color, alpha);
    for (const id of ['objectList', OBJECT_LIST_OTHERS_ID]) {
      if (legacy !== LEGACY_OBJECT_LIST_DEFAULT && getWindowBackground(id) === null) {
        setWindowSetting(id, WINDOW_BACKGROUND_KEY, legacy);
      }
    }
    const rest = { ...ui };
    delete rest[LEGACY_OBJECT_LIST_COLOR];
    delete rest[LEGACY_OBJECT_LIST_ALPHA];
    globalStorage.set('uiSettings', rest as never);
  } catch (e) {
    console.error('[windowSettings] Failed to migrate the object list background:', e);
  }
}
