import type { InputHTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";
import { cx } from "./cx";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
    /** Monospace field — search patterns, file names, numbers. */
    mono?: boolean;
    /** Height, from the control ladder. Shadows the HTML `size` attribute,
     *  which this viewer has no use for. */
    size?: "md" | "lg";
    invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
    { mono, size = "md", invalid, className, ...rest },
    ref,
) {
    return (
        <input
            ref={ref}
            className={cx(
                "lv-input",
                mono && "lv-input--mono",
                size === "lg" && "lv-input--lg",
                invalid && "lv-input--invalid",
                className,
            )}
            {...rest}
        />
    );
});

export interface InputShellProps {
    /** Leading decoration, inset into the field (a search glass, typically). */
    icon?: ReactNode;
    /** Controls parked at the right edge inside the field (`Aa`, `.*`). */
    adornments?: ReactNode;
    className?: string;
    children: ReactNode;
}

/** Positions decorations inside a field. */
export function InputShell({ icon, adornments, className, children }: InputShellProps) {
    return (
        <div className={cx("lv-input-shell", icon && "lv-input-shell--with-icon", className)}>
            {icon ? <span className="lv-input-shell__icon">{icon}</span> : null}
            {children}
            {adornments ? <span className="lv-input-shell__adornments">{adornments}</span> : null}
        </div>
    );
}
