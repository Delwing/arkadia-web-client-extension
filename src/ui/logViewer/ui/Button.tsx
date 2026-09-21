import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export type ButtonVariant = "solid" | "soft" | "ghost" | "danger" | "link";

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Leading icon. Pass an `<Icon>`; the button reserves the gap. */
    icon?: ReactNode;
    /** Trailing icon, e.g. a disclosure chevron. */
    trailing?: ReactNode;
}

/**
 * The viewer's one button.
 *
 * Plain markup rather than react-bootstrap: this component tree is rendered by
 * the standalone page as well, which carries no Bootstrap stylesheet. See
 * `controls.css` for why the viewer styles its own controls.
 */
export function Button({
    variant = "soft",
    size = "md",
    icon,
    trailing,
    className,
    children,
    type = "button",
    ...rest
}: ButtonProps) {
    return (
        <button
            type={type}
            className={cx("lv-button", `lv-button--${variant}`, size !== "md" && `lv-button--${size}`, className)}
            {...rest}
        >
            {icon ? <span className="lv-button__icon">{icon}</span> : null}
            {children}
            {trailing ? <span className="lv-button__icon">{trailing}</span> : null}
        </button>
    );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    size?: "sm" | "md";
    /**
     * Required: an icon alone tells nobody anything, and this project does not
     * use aria-* attributes, so the label goes in `title` where it also serves
     * as the hover tooltip. Include the shortcut, e.g. "Zamknij  Esc".
     */
    title: string;
}

export function IconButton({ size = "md", className, children, type = "button", ...rest }: IconButtonProps) {
    return (
        <button
            type={type}
            className={cx("lv-icon-button", size === "sm" && "lv-icon-button--sm", className)}
            {...rest}
        >
            {children}
        </button>
    );
}
