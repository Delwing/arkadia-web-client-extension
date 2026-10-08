import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useWindowSetting } from '../../hooks/useWindowSetting';
import { ensureFontLoaded, resolveOutputFontFamily } from '../../fontLoader';
import { usePopover } from '../hooks/usePopover';
import { OBJECT_LIST_OTHERS_ID } from '../types';
import {
  joinWindowBackground,
  normalizeWindowBackground,
  splitWindowBackground,
  WINDOW_BACKGROUND_KEY,
  WINDOW_FONT_FAMILY_KEY,
  WINDOW_FONT_FAMILY_OPTIONS,
  WINDOW_FONT_SIZE_KEY,
  WINDOW_FONT_SIZE_MAX,
  WINDOW_FONT_SIZE_MIN,
  WINDOW_FONT_SIZE_STEP,
  WindowFontFamily,
  WindowNumberField,
  WindowSelectField,
  WindowSettingField,
  WindowToggleField,
} from '../windowSettings';

const PANEL_WIDTH = 256;

/**
 * The main window's size a window follows until overridden: Kondycje follows
 * the objects font size, everything else the output font size. Both are
 * published on <body> by uiSettingsCore.apply.
 */
function mainFontSize(windowId: string): number {
  const name = windowId === 'objectList' || windowId === OBJECT_LIST_OTHERS_ID ? '--objects-font-size' : '--output-font-size';
  const value = parseFloat(getComputedStyle(document.body).getPropertyValue(name));
  return Number.isFinite(value) ? value : 0.875;
}

/**
 * One step up or down, snapped to the step grid: a main size of 0.875 steps to
 * 0.90 / 0.85 rather than to 0.925, which float rounding can't display cleanly.
 */
function stepSize(current: number, dir: 1 | -1): number {
  const units = current / WINDOW_FONT_SIZE_STEP;
  const next = dir > 0
    ? (Math.floor(units + 1e-6) + 1) * WINDOW_FONT_SIZE_STEP
    : (Math.ceil(units - 1e-6) - 1) * WINDOW_FONT_SIZE_STEP;
  const clamped = Math.min(WINDOW_FONT_SIZE_MAX, Math.max(WINDOW_FONT_SIZE_MIN, next));
  return Math.round(clamped * 100) / 100;
}

function formatSize(value: number): string {
  return `${value.toFixed(2)} rem`;
}

/** CSS font stack an option renders in; null = the main window's font. */
function fontStack(family: WindowFontFamily | null): string {
  return family === null
    ? 'var(--output-font-family), monospace'
    : resolveOutputFontFamily(family, '') ?? 'monospace';
}

const INHERIT = '';

/** Any CSS colour as `#rrggbb`, or null when it isn't an opaque rgb colour. */
function toHex(css: string): string | null {
  const m = css.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
  if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return null;
  return `#${[m[1], m[2], m[3]].map(c => Number(c).toString(16).padStart(2, '0')).join('')}`;
}

/** The theme's window background as `#rrggbb`: what the picker opens on before an override. */
function themeBackground(anchor: Element | null): string {
  const doc = anchor?.ownerDocument ?? document;
  const probe = doc.createElement('div');
  probe.style.backgroundColor = 'var(--popup-bg)';
  doc.body.appendChild(probe);
  const resolved = toHex((doc.defaultView ?? window).getComputedStyle(probe).backgroundColor);
  probe.remove();
  return resolved ?? '#1a1a1a';
}

/**
 * Font and font size. The font dropdown previews itself: the closed select and
 * each option are written in their own face (option styling is honoured on
 * Windows/Linux; macOS draws the open list in the system font).
 */
function AppearanceSection({ windowId }: { windowId: string }) {
  const [family, setFamily] = useWindowSetting<WindowFontFamily | null>(windowId, WINDOW_FONT_FAMILY_KEY, null);
  const [size, setSize] = useWindowSetting<number | null>(windowId, WINDOW_FONT_SIZE_KEY, null);
  const sizeOverridden = typeof size === 'number';
  const effectiveSize = sizeOverridden ? size : mainFontSize(windowId);
  const step = (dir: 1 | -1) => setSize(stepSize(effectiveSize, dir));

  // Load every option's face so the dropdown can render in it.
  useEffect(() => {
    for (const o of WINDOW_FONT_FAMILY_OPTIONS) ensureFontLoaded(o.value);
  }, []);

  const fontId = `window-settings-font-${windowId}`;

  return (
    <>
      <div className="window-settings__row">
        <label className="window-settings__label" htmlFor={fontId}>Czcionka</label>
        <select
          id={fontId}
          className="popup-input window-settings__field"
          style={{ fontFamily: fontStack(family) }}
          value={family ?? INHERIT}
          onChange={e => setFamily(e.target.value === INHERIT ? null : (e.target.value as WindowFontFamily))}
        >
          <option value={INHERIT} style={{ fontFamily: fontStack(null) }}>Jak okno główne</option>
          {WINDOW_FONT_FAMILY_OPTIONS.map(o => (
            <option key={o.value} value={o.value} style={{ fontFamily: fontStack(o.value) }}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="window-settings__row">
        <span className="window-settings__label">Rozmiar czcionki</span>
        <div className="window-settings__size">
          <button type="button" className="popup-btn window-settings__step" onClick={() => step(-1)} title="Mniejsza czcionka">
            −
          </button>
          <span className={`window-settings__size-value${sizeOverridden ? '' : ' window-settings__size-value--inherit'}`}>
            {sizeOverridden ? formatSize(effectiveSize) : 'Jak okno główne'}
          </span>
          <button type="button" className="popup-btn window-settings__step" onClick={() => step(1)} title="Większa czcionka">
            +
          </button>
          <button
            type="button"
            className="popup-btn window-settings__step window-settings__reset"
            onClick={() => setSize(null)}
            disabled={!sizeOverridden}
            title={`Przywróć rozmiar okna głównego (${formatSize(mainFontSize(windowId))})`}
          >
            ↺
          </button>
        </div>
      </div>
      <BackgroundRow windowId={windowId} />
    </>
  );
}

/**
 * Background colour and opacity. Until the window is overridden both controls
 * show the theme's background, fully opaque;
 * changing either stores an override, and the reset drops it again.
 */
function BackgroundRow({ windowId }: { windowId: string }) {
  const [stored, setStored] = useWindowSetting<string | null>(windowId, WINDOW_BACKGROUND_KEY, null);
  const override = normalizeWindowBackground(stored);
  const inputRef = useRef<HTMLInputElement>(null);
  const [themeColor, setThemeColor] = useState('#1a1a1a');
  useLayoutEffect(() => {
    if (override === null) setThemeColor(themeBackground(inputRef.current));
  }, [override]);

  const { color, alpha } = splitWindowBackground(override ?? themeColor);
  const percent = Math.round(alpha * 100);
  const colorId = `window-settings-bg-${windowId}`;
  const alphaId = `window-settings-bg-alpha-${windowId}`;

  return (
    <>
      <div className="window-settings__row">
        <label className="window-settings__label" htmlFor={colorId}>Tło</label>
        <div className="window-settings__size">
          <input
            ref={inputRef}
            id={colorId}
            type="color"
            className="popup-color window-settings__color"
            value={color}
            onChange={e => setStored(joinWindowBackground(e.target.value, alpha))}
            title={override === null ? 'Domyślne' : color}
          />
          <span className={`window-settings__size-value${override ? '' : ' window-settings__size-value--inherit'}`}>
            {override === null ? 'Domyślne' : color}
          </span>
          <button
            type="button"
            className="popup-btn window-settings__step window-settings__reset"
            onClick={() => setStored(null)}
            disabled={override === null}
            title="Przywróć domyślne tło"
          >
            ↺
          </button>
        </div>
      </div>
      <div className="window-settings__row">
        <label className="window-settings__label" htmlFor={alphaId}>Krycie tła</label>
        <div className="window-settings__size">
          <input
            id={alphaId}
            type="range"
            min={0}
            max={100}
            step={1}
            className="popup-range window-settings__range"
            value={percent}
            onChange={e => setStored(joinWindowBackground(color, e.target.valueAsNumber / 100))}
          />
          <span className="window-settings__alpha-value">{percent}%</span>
        </div>
      </div>
    </>
  );
}

function ToggleFieldRow({ windowId, field }: { windowId: string; field: WindowToggleField }) {
  const [stored, setStored] = useWindowSetting<boolean>(windowId, field.key, field.default);
  const on = field.inverted ? !stored : stored;
  return (
    <button
      type="button"
      className={`window-settings__toggle${on ? ' is-on' : ''}`}
      onClick={() => setStored(!stored)}
    >
      <span className="window-settings__toggle-label">{field.label}</span>
      <span className="popup-switch" />
    </button>
  );
}

function SelectFieldRow({ windowId, field }: { windowId: string; field: WindowSelectField }) {
  const [value, setValue] = useWindowSetting<string>(windowId, field.key, field.default);
  const id = `window-settings-${windowId}-${field.key}`;
  return (
    <div className="window-settings__row">
      <label className="window-settings__label" htmlFor={id}>{field.label}</label>
      <select
        id={id}
        className="popup-input window-settings__field"
        value={value}
        onChange={e => setValue(e.target.value)}
      >
        {field.options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function NumberFieldRow({ windowId, field }: { windowId: string; field: WindowNumberField }) {
  const [value, setValue] = useWindowSetting<number>(windowId, field.key, field.default);
  const id = `window-settings-${windowId}-${field.key}`;
  return (
    <div className="window-settings__row">
      <label className="window-settings__label" htmlFor={id}>{field.label}</label>
      <input
        id={id}
        type="number"
        className="popup-input window-settings__field"
        value={value}
        min={field.min}
        max={field.max}
        step={field.step}
        onChange={e => {
          const n = e.target.valueAsNumber;
          if (Number.isFinite(n)) setValue(n);
        }}
      />
    </div>
  );
}

function FieldRow({ windowId, field }: { windowId: string; field: WindowSettingField }) {
  switch (field.type) {
    case 'toggle':
      return <ToggleFieldRow windowId={windowId} field={field} />;
    case 'select':
      return <SelectFieldRow windowId={windowId} field={field} />;
    case 'number':
      return <NumberFieldRow windowId={windowId} field={field} />;
  }
}

interface WindowSettingsSectionsProps {
  windowId: string;
  /** Heading of the window's own fields. */
  title: string;
  fields?: WindowSettingField[];
  /** Offer the shared appearance fields; false for windows without text (the map). */
  appearance?: boolean;
}

/**
 * A window's settings: the shared appearance fields, then the window's own.
 * Shown by the cog's panel and by the settings dialog's "Ustawienia okien".
 */
export function WindowSettingsSections({ windowId, title, fields, appearance = true }: WindowSettingsSectionsProps) {
  return (
    <>
      {appearance && (
        <section className="window-settings__section">
          <h3 className="window-settings__section-title">Wygląd</h3>
          <AppearanceSection windowId={windowId} />
        </section>
      )}
      {fields && fields.length > 0 && (
        <section className="window-settings__section">
          <h3 className="window-settings__section-title">{title}</h3>
          {fields.map(field => (
            <FieldRow key={field.key} windowId={windowId} field={field} />
          ))}
        </section>
      )}
    </>
  );
}

interface WindowSettingsMenuProps {
  windowId: string;
  title: string;
  fields?: WindowSettingField[];
  /** Offer the shared font fields; false for windows without text (the map). */
  appearance?: boolean;
  /** Smaller button, for the tab-group action bar. */
  small?: boolean;
}

/**
 * The settings cog in a window's header and the panel it opens: the shared
 * appearance fields every window has, then the window's own fields.
 *
 * The panel is position: fixed inside the header, so it escapes a small docked
 * window's clipping and follows the window into a popped-out browser window
 * (everything is resolved against the button's own document).
 */
export function WindowSettingsMenu({ windowId, title, fields, appearance = true, small }: WindowSettingsMenuProps) {
  const popover = usePopover({ width: PANEL_WIDTH, maxHeight: 480 });

  return (
    <div className="window-settings-anchor" ref={popover.rootRef} onPointerDown={e => e.stopPropagation()}>
      <button
        ref={popover.anchorRef}
        type="button"
        className={`panel-button panel-button--settings${small ? ' panel-button--sm' : ''}${popover.open ? ' is-active' : ''}`}
        onClick={popover.toggle}
        title="Ustawienia okna"
      />
      {popover.style && (
        <div
          className="popup-popover window-settings"
          data-window-settings={windowId}
          style={popover.style}
        >
          <div className="window-settings__header">Ustawienia okna</div>
          <WindowSettingsSections windowId={windowId} title={title} fields={fields} appearance={appearance} />
        </div>
      )}
    </div>
  );
}
