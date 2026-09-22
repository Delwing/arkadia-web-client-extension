import { useEffect, useState, type ReactNode } from "react";
import { Button, Check, Field, Input, Select } from "@web-ui/primitives/index.ts";

/**
 * One card on a settings page. `full` spans every masonry column, for content
 * that needs the width (tile grids, tables).
 */
export function SettingsSection({ title, headerExtra, full, children }: { title: string; headerExtra?: ReactNode; full?: boolean; children: ReactNode }) {
    return (
        <section className={`ui-settings-section${full ? " ui-settings-section--full" : ""}`}>
            {headerExtra ? (
                <div className="ui-settings-section-header">
                    <h6 className="ui-settings-section-title">{title}</h6>
                    {headerExtra}
                </div>
            ) : (
                <h6 className="ui-settings-section-title">{title}</h6>
            )}
            <div className="ui-settings-stack">{children}</div>
        </section>
    );
}

export function CheckboxRow({ id, label, checked, onChange, disabled, className }: {
    id: string; label: ReactNode; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; className?: string;
}) {
    return (
        <Check
            id={id}
            className={className}
            label={label}
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
        />
    );
}

export function SelectField({ id, label, hint, value, onChange, disabled, children }: {
    id: string; label?: ReactNode; hint?: ReactNode; value: string; onChange: (value: string) => void; disabled?: boolean; children: ReactNode;
}) {
    return (
        <Field label={label} hint={hint} htmlFor={id}>
            <Select id={id} className="settings-narrow" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
                {children}
            </Select>
        </Field>
    );
}

/**
 * Number input that tolerates intermediate empty/invalid text while editing,
 * only emitting finite numbers upstream.
 */
export function NumberField({ id, label, value, step, min, onChange }: {
    id: string; label: ReactNode; value: number; step?: number | string; min?: number | string; onChange: (value: number) => void;
}) {
    const [text, setText] = useState(String(value));
    useEffect(() => { setText(String(value)); }, [value]);
    return (
        <Field label={label} htmlFor={id}>
            <Input
                id={id}
                className="settings-num"
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
        </Field>
    );
}

export function RangeField({ id, label, value, min, max, step, onChange }: {
    id: string; label: string; value: number; min: number | string; max: number | string; step: number | string; onChange: (value: number) => void;
}) {
    return (
        <Field label={<>{label}: <span id={`${id}-value`}>{value}</span></>} htmlFor={id}>
            <input
                id={id}
                type="range"
                className="popup-range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
            />
        </Field>
    );
}

export function ColorField({ id, label, value, onChange, onReset }: {
    id: string; label: ReactNode; value: string; onChange: (value: string) => void; onReset?: () => void;
}) {
    return (
        <Field label={label} htmlFor={id}>
            <div className="popup-inline">
                <input id={id} type="color" className="popup-color" value={value} onChange={(e) => onChange(e.target.value)} />
                {onReset && (
                    <Button size="sm" variant="ghost" onClick={onReset}>Przywróć domyślny</Button>
                )}
            </div>
        </Field>
    );
}
