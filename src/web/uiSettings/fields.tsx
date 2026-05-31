import { useEffect, useState, type ReactNode } from "react";

export function SettingsSection({ title, headerExtra, children }: { title: string; headerExtra?: ReactNode; children: ReactNode }) {
    return (
        <section className="ui-settings-section">
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
        <div className={`form-check${className ? ' ' + className : ''}`}>
            <input id={id} type="checkbox" className="form-check-input" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
            <label className="form-check-label" htmlFor={id}>{label}</label>
        </div>
    );
}

export function SelectField({ id, label, value, onChange, children }: {
    id: string; label?: ReactNode; value: string; onChange: (value: string) => void; children: ReactNode;
}) {
    return (
        <div>
            {label && <label className="form-label" htmlFor={id}>{label}</label>}
            <select id={id} className="form-select" value={value} onChange={(e) => onChange(e.target.value)}>
                {children}
            </select>
        </div>
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
        <div>
            <label className="form-label" htmlFor={id}>{label}</label>
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
