import type { ReactNode } from "react";
import { cx } from "./cx";

export interface ToggleProps {
    pressed: boolean;
    onPressedChange: (pressed: boolean) => void;
    /** `square` is the 24px modifier used inside the search field. */
    shape?: "pill" | "square";
    size?: "sm" | "md";
    mono?: boolean;
    title?: string;
    disabled?: boolean;
    className?: string;
    children: ReactNode;
}

/**
 * Two-state control.
 *
 * A plain `<button>` carrying `data-state`, which is what the stylesheet keys
 * off — the same attribute name Radix used, so the ported CSS did not have to
 * change. Space and Enter already activate a button, so the behaviour the
 * primitive added on top was the attribute and nothing else.
 */
export function Toggle({
    pressed,
    onPressedChange,
    shape = "pill",
    size = "sm",
    mono,
    className,
    children,
    ...rest
}: ToggleProps) {
    return (
        <button
            type="button"
            data-state={pressed ? "on" : "off"}
            onClick={() => onPressedChange(!pressed)}
            className={cx(
                "lv-toggle",
                size === "md" && "lv-toggle--md",
                shape === "square" && "lv-toggle--square",
                mono && "lv-toggle--mono",
                className,
            )}
            {...rest}
        >
            {children}
        </button>
    );
}
