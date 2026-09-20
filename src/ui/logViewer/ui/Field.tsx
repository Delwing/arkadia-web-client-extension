import type { ReactNode } from "react";
import { cx } from "./cx";

export interface FieldProps {
    label?: ReactNode;
    /** Uppercase section label instead of a plain one — sidebar/group headings. */
    eyebrow?: boolean;
    htmlFor?: string;
    className?: string;
    children: ReactNode;
}

/** Label + control. */
export function Field({ label, eyebrow, htmlFor, className, children }: FieldProps) {
    return (
        <div className={cx("lv-field", className)}>
            {label ? (
                <label className={eyebrow ? "lv-field__eyebrow" : "lv-field__label"} htmlFor={htmlFor}>
                    {label}
                </label>
            ) : null}
            {children}
        </div>
    );
}
