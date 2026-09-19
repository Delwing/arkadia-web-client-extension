import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";

export type ButtonVariant =
    | "solid"
    | "soft"
    | "outline"
    | "ghost"
    | "danger"
    | "danger-soft"
    | "link";

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
 * The client's one button.
 *
 * `soft` is the default because most buttons in this UI sit on a dark surface
 * among other controls; `solid` is reserved for the single primary action of a
 * view, so that "the accent-coloured one" keeps meaning something.
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
            className={cx(
                "ark-button",
                `ark-button--${variant}`,
                size !== "md" && `ark-button--${size}`,
                className,
            )}
            {...rest}
        >
            {icon ? <span className="ark-button__icon">{icon}</span> : null}
            {children}
            {trailing ? <span className="ark-button__icon">{trailing}</span> : null}
        </button>
    );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    size?: "sm" | "md";
    /** Drops the border — for icons inside an already-bordered container. */
    plain?: boolean;
    /**
     * Required: an icon alone tells a screen reader nothing, and this project
     * does not use aria-* attributes, so the label goes in `title` where it also
     * serves as the hover tooltip. Include the shortcut, e.g. "Zamknij  Esc".
     */
    title: string;
}

export function IconButton({
    size = "md",
    plain,
    className,
    children,
    type = "button",
    ...rest
}: IconButtonProps) {
    return (
        <button
            type={type}
            className={cx(
                "ark-icon-button",
                size === "sm" && "ark-icon-button--sm",
                plain && "ark-icon-button--plain",
                className,
            )}
            {...rest}
        >
            {children}
        </button>
    );
}
