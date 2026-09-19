import type { ReactNode } from "react";
import { cx } from "../cx";

export interface FieldProps {
    label?: ReactNode;
    /** Uppercase section label instead of a plain one — sidebar/group headings. */
    eyebrow?: boolean;
    hint?: ReactNode;
    error?: ReactNode;
    /** Label beside the control rather than above it (checkboxes, switches). */
    inline?: boolean;
    htmlFor?: string;
    className?: string;
    children: ReactNode;
}

/** Label + control + hint/error. The settings-form building block. */
export function Field({ label, eyebrow, hint, error, inline, htmlFor, className, children }: FieldProps) {
    return (
        <div className={cx("ark-field", inline && "ark-field--row", className)}>
            {label ? (
                <label className={eyebrow ? "ark-field__eyebrow" : "ark-field__label"} htmlFor={htmlFor}>
                    {label}
                </label>
            ) : null}
            {children}
            {error ? <span className="ark-field__error">{error}</span> : null}
            {!error && hint ? <span className="ark-field__hint">{hint}</span> : null}
        </div>
    );
}
