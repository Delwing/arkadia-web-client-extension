import type { ReactNode } from "react";
import { Toggle as RadixToggle } from "radix-ui";
import { cx } from "../cx";

export interface ToggleProps {
    pressed: boolean;
    onPressedChange: (pressed: boolean) => void;
    /** `square` is the 24px modifier used inside a search field. */
    shape?: "pill" | "square";
    size?: "sm" | "md";
    mono?: boolean;
    title?: string;
    disabled?: boolean;
    className?: string;
    children: ReactNode;
}

/**
 * Two-state control. Radix supplies the `data-state` attribute the stylesheet
 * keys off, plus space/enter handling, so on/off looks and behaves the same
 * everywhere it appears.
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
        <RadixToggle.Root
            pressed={pressed}
            onPressedChange={onPressedChange}
            className={cx(
                "ark-toggle",
                size === "md" && "ark-toggle--md",
                shape === "square" && "ark-toggle--square",
                mono && "ark-toggle--mono",
                className,
            )}
            {...rest}
        >
            {children}
        </RadixToggle.Root>
    );
}
