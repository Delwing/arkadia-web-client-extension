import { useEffect, useState, type ReactNode } from "react";
import { Button, Checkbox, Input } from "@design";

/**
 * Building blocks for a settings page that has moved onto the design system.
 *
 * These are the migrated counterpart of `@web/uiSettings/fields.tsx` and of the
 * `.character-settings-section` markup the character pages hand-roll. Both of
 * those read `--popup-*` through Bootstrap and the stock stylesheet; these read
 * `--ark-*` only. The two layers run side by side, one tab at a time, and the
 * old ones go when the last tab has moved over (docs/dev/UI_MIGRATION.md §4).
 *
 * Shape notes, because two of them are deliberate departures:
 *
 * - The checkbox is Radix (`@design`'s `Checkbox`), which renders a <button>,
 *   not an <input>. <button> is a labelable element, so a plain <label for>
 *   still activates it and the label needs no click handler of its own — adding
 *   one toggles twice and the checkbox appears not to react at all.
 *   `settingsDirty.ts` reads its state off `data-state` — see the note there.
 * - `<select>` and `<input type="color">` stay native. The design system's
 *   `Select` is a Radix listbox with no <optgroup> and no `selectOption()` for
 *   the e2e suite, and there is no colour-picker primitive at all. Both are
 *   styled from tokens in `settingsDialog.css`.
 */

export function SettingsCard({ title, headerExtra, full, children }: {
    title: string;
    /** Rendered opposite the heading, on the same line. */
    headerExtra?: ReactNode;
    full?: boolean;
    children: ReactNode;
}) {
    const heading = <h5 className="settings-card__title">{title}</h5>;
    return (
        <section className={`settings-card${full ? " settings-card--full" : ""}`}>
            {headerExtra ? (
                <div className="settings-row">{heading}{headerExtra}</div>
            ) : heading}
            {children}
        </section>
    );
}

/** Label on the left, control on the right. */
export function SettingsRow({ label, htmlFor, children }: {
    label: ReactNode;
    htmlFor?: string;
    children: ReactNode;
}) {
    return (
        <div className="settings-row">
            <label className="settings-row__label" htmlFor={htmlFor}>{label}</label>
            <div className="settings-row__controls">{children}</div>
        </div>
    );
}

export function SettingsHint({ children }: { children: ReactNode }) {
    return <p className="settings-hint">{children}</p>;
}

export function CheckboxField({ id, label, checked, onChange, disabled, labelExtra }: {
    id: string;
    label: ReactNode;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    /** Rendered after the label text — a device-scope badge, typically. */
    labelExtra?: ReactNode;
}) {
    return (
        <div className="settings-check">
            <Checkbox id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
            <label className="settings-check__label" htmlFor={id}>
                {label}{labelExtra}
            </label>
        </div>
    );
}

export function SelectField({ id, label, value, onChange, disabled, labelExtra, children }: {
    id: string;
    label?: ReactNode;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    labelExtra?: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="settings-field">
            {label && (
                <label className="settings-field__label" htmlFor={id}>{label}{labelExtra}</label>
            )}
            <select
                id={id}
                className="settings-native-select"
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
            >
                {children}
            </select>
        </div>
    );
}

/**
 * Number input that tolerates intermediate empty/invalid text while editing,
 * only emitting finite numbers upstream — a field cleared to retype it must
 * not push NaN into the draft and repaint the client. The migrated counterpart
 * of `uiSettings/fields.tsx`'s NumberField; it stays an <input type="number">
 * because e2e drives several of these with `fill()`.
 */
export function NumberField({ id, label, value, step, min, onChange, labelExtra }: {
    id: string;
    label: ReactNode;
    value: number;
    step?: number | string;
    min?: number | string;
    onChange: (value: number) => void;
    labelExtra?: ReactNode;
}) {
    const [text, setText] = useState(String(value));
    useEffect(() => { setText(String(value)); }, [value]);
    return (
        <div className="settings-field">
            <label className="settings-field__label" htmlFor={id}>{label}{labelExtra}</label>
            <Input
                id={id}
                type="number"
                step={step}
                min={min}
                value={text}
                onChange={(e) => {
                    setText(e.target.value);
                    const n = parseFloat(e.target.value);
                    if (Number.isFinite(n)) onChange(n);
                }}
            />
        </div>
    );
}

/**
 * Slider with its current value beside the label. The value keeps the
 * `${id}-value` span the Bootstrap-era field had: it is what makes the number
 * part of the page signature, so dragging a slider raises the unsaved dot.
 */
export function RangeField({ id, label, value, min, max, step, onChange }: {
    id: string;
    label: ReactNode;
    value: number;
    min: number | string;
    max: number | string;
    step: number | string;
    onChange: (value: number) => void;
}) {
    return (
        <div className="settings-field">
            <label className="settings-field__label" htmlFor={id}>
                {label}: <span id={`${id}-value`} className="settings-field__value">{value}</span>
            </label>
            <input
                id={id}
                type="range"
                className="settings-range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
            />
        </div>
    );
}

/** Single-line text/url field with an optional hint under it. */
export function TextField({ id, label, value, onChange, type = "text", placeholder, hint }: {
    id: string;
    label: ReactNode;
    value: string;
    onChange: (value: string) => void;
    type?: "text" | "url";
    placeholder?: string;
    hint?: ReactNode;
}) {
    return (
        <div className="settings-field">
            <label className="settings-field__label" htmlFor={id}>{label}</label>
            <Input id={id} type={type} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
            {hint && <SettingsHint>{hint}</SettingsHint>}
        </div>
    );
}

export function ColorField({ id, label, value, onChange, onReset, disabled }: {
    id: string;
    label: ReactNode;
    value: string;
    onChange: (value: string) => void;
    /** Adds a restore-the-default button next to the swatch. */
    onReset?: () => void;
    disabled?: boolean;
}) {
    return (
        <SettingsRow label={label} htmlFor={id}>
            <input
                id={id}
                type="color"
                className="settings-color"
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
            />
            {onReset && (
                <Button size="sm" variant="outline" onClick={onReset} disabled={disabled} title="Przywróć domyślny kolor">
                    Domyślny
                </Button>
            )}
        </SettingsRow>
    );
}
