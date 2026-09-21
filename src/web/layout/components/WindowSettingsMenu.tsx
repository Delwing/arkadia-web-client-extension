import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useWindowSetting } from '../../hooks/useWindowSetting';
import { ensureFontLoaded, resolveOutputFontFamily } from '../../fontLoader';
import {
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
  const name = windowId === 'objectList' ? '--objects-font-size' : '--output-font-size';
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
          <option value={INHERIT} style={{ fontFamily: fontStack(null) }}>Jak okno glowne</option>
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
            {sizeOverridden ? formatSize(effectiveSize) : 'Jak okno glowne'}
          </span>
          <button type="button" className="popup-btn window-settings__step" onClick={() => step(1)} title="Wieksza czcionka">
            +
          </button>
          <button
            type="button"
            className="popup-btn window-settings__step window-settings__reset"
            onClick={() => setSize(null)}
            disabled={!sizeOverridden}
            title={`Przywroc rozmiar okna glownego (${formatSize(mainFontSize(windowId))})`}
          >
            ↺
          </button>
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
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const button = buttonRef.current;
    const view = button.ownerDocument.defaultView ?? window;
    const rect = button.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.right - PANEL_WIDTH, view.innerWidth - PANEL_WIDTH - 8));
    setPosition({ top: rect.bottom + 4, left });
  }, [open]);

  useEffect(() => {
    if (!open || !rootRef.current) return;
    const doc = rootRef.current.ownerDocument;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    doc.addEventListener('pointerdown', onPointerDown);
    doc.addEventListener('keydown', onKeyDown);
    return () => {
      doc.removeEventListener('pointerdown', onPointerDown);
      doc.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  return (
    <div className="window-settings-anchor" ref={rootRef} onPointerDown={e => e.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        className={`panel-button panel-button--settings${small ? ' panel-button--sm' : ''}${open ? ' is-active' : ''}`}
        onClick={() => setOpen(o => !o)}
        title="Ustawienia okna"
      />
      {open && position && (
        <div
          className="popup-popover window-settings"
          data-window-settings={windowId}
          style={{ top: position.top, left: position.left, width: PANEL_WIDTH }}
        >
          <div className="window-settings__header">Ustawienia okna</div>
          {appearance && (
            <section className="window-settings__section">
              <h3 className="window-settings__section-title">Wyglad</h3>
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
        </div>
      )}
    </div>
  );
}
