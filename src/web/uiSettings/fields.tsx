import { useEffect, useState, type ReactNode } from "react";
import { chromeSettingsKeys } from "@shared/settingsDefaults.ts";
import type { UiSettings } from "../uiSettingsCore";

/** Keys persisted in the device-scoped `uiSettings` entry; every other UI slice is shared. */
const DEVICE_SETTING_KEYS: ReadonlySet<string> = new Set(chromeSettingsKeys);

/**
 * Marks a UI setting kept on this device only. Most of the Interfejs pages sync
 * across devices, so the ones that do not are flagged where they are edited.
 * Renders nothing for a shared key, so passing `settingKey` is always safe.
 */
export function DeviceOnlyBadge({ settingKey }: { settingKey?: keyof UiSettings }) {
    if (!settingKey || !DEVICE_SETTING_KEYS.has(settingKey)) return null;
    return (
        <span className="settings-scope-badge ms-2" title="Zapisywane tylko na tym urządzeniu, bez synchronizacji z innymi">
            to urządzenie
        </span>
    );
}

/**
 * One card on a settings page. `full` spans every masonry column, for content
 * that needs the width (tile grids, tables).
 */
export function SettingsSection({ title, headerExtra, full, settingKey, children }: { title: string; headerExtra?: ReactNode; full?: boolean; settingKey?: keyof UiSettings; children: ReactNode }) {
    return (
        <section className={`ui-settings-section${full ? " ui-settings-section--full" : ""}`}>
            {headerExtra ? (
                <div className="ui-settings-section-header">
                    <h6 className="ui-settings-section-title">{title}<DeviceOnlyBadge settingKey={settingKey} /></h6>
                    {headerExtra}
                </div>
            ) : (
                <h6 className="ui-settings-section-title">{title}<DeviceOnlyBadge settingKey={settingKey} /></h6>
            )}
            <div className="ui-settings-stack">{children}</div>
        </section>
    );
}

export function CheckboxRow({ id, label, checked, onChange, disabled, className, settingKey }: {
    id: string; label: ReactNode; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; className?: string; settingKey?: keyof UiSettings;
}) {
    return (
        <div className={`form-check${className ? ' ' + className : ''}`}>
            <input id={id} type="checkbox" className="form-check-input" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
            <label className="form-check-label" htmlFor={id}>{label}<DeviceOnlyBadge settingKey={settingKey} /></label>
        </div>
    );
}

export function SelectField({ id, label, value, onChange, disabled, settingKey, children }: {
    id: string; label?: ReactNode; value: string; onChange: (value: string) => void; disabled?: boolean; settingKey?: keyof UiSettings; children: ReactNode;
}) {
    return (
        <div>
            {label && <label className="form-label" htmlFor={id}>{label}<DeviceOnlyBadge settingKey={settingKey} /></label>}
            <select id={id} className="form-select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
                {children}
            </select>
        </div>
    );
}

/**
 * Number input that tolerates intermediate empty/invalid text while editing,
 * only emitting finite numbers upstream.
 */
export function NumberField({ id, label, value, step, min, settingKey, onChange }: {
    id: string; label: ReactNode; value: number; step?: number | string; min?: number | string; settingKey?: keyof UiSettings; onChange: (value: number) => void;
}) {
    const [text, setText] = useState(String(value));
    useEffect(() => { setText(String(value)); }, [value]);
    return (
        <div>
            <label className="form-label" htmlFor={id}>{label}<DeviceOnlyBadge settingKey={settingKey} /></label>
            <input
                id={id}
                type="number"
                className="form-control"
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

export function RangeField({ id, label, value, min, max, step, onChange }: {
    id: string; label: string; value: number; min: number | string; max: number | string; step: number | string; onChange: (value: number) => void;
}) {
    return (
        <div>
            <label className="form-label" htmlFor={id}>
                {label}: <span id={`${id}-value`}>{value}</span>
            </label>
            <input
                id={id}
                type="range"
                className="form-range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
            />
        </div>
    );
}

export function ColorField({ id, label, value, onChange, onReset }: {
    id: string; label: ReactNode; value: string; onChange: (value: string) => void; onReset?: () => void;
}) {
    return (
        <div>
            <label className="form-label" htmlFor={id}>{label}</label>
            <div className="d-flex align-items-center gap-2 flex-wrap">
                <input id={id} type="color" className="form-control form-control-color" value={value} onChange={(e) => onChange(e.target.value)} />
                {onReset && (
                    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onReset}>Przywróć domyślny</button>
                )}
            </div>
        </div>
    );
}
