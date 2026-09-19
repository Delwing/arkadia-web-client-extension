import type { InputHTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";
import { cx } from "../cx";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
    /** Monospace field — search patterns, file names, numbers. */
    mono?: boolean;
    /** Height, from the control ladder. Shadows the HTML `size` attribute,
     *  which this system has no use for. */
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
                "ark-input",
                mono && "ark-input--mono",
                size === "lg" && "ark-input--lg",
                invalid && "ark-input--invalid",
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

/**
 * Positions decorations inside a field. Kept separate from `Input` so the same
 * insets work for a textarea or a combobox later.
 */
export function InputShell({ icon, adornments, className, children }: InputShellProps) {
    return (
        <div className={cx("ark-input-shell", icon && "ark-input-shell--with-icon", className)}>
            {icon ? <span className="ark-input-shell__icon">{icon}</span> : null}
            {children}
            {adornments ? <span className="ark-input-shell__adornments">{adornments}</span> : null}
        </div>
    );
}
